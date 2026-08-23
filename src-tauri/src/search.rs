use crate::{commands, AppError, AppState};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, fs, path::Path};
use uuid::Uuid;
use walkdir::WalkDir;

const MAX_FILE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_CONTEXT_CHARS: usize = 12_000;
const MAX_REFERENCE_CHARS: usize = 2_500;
const MAX_SOURCES: usize = 6;
const SUPPORTED_EXTENSIONS: &[&str] = &[
    "txt", "text", "md", "markdown", "html", "htm", "json", "xml", "csv", "log", "note",
];

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextReference {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub note_id: Option<String>,
    #[serde(default, alias = "baseId")]
    pub knowledge_base_id: Option<String>,
    #[serde(default)]
    pub relative_path: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextScope {
    #[serde(default)]
    pub knowledge_base_ids: Vec<String>,
    #[serde(default)]
    pub note_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextSource {
    pub id: String,
    pub source_type: String,
    pub title: String,
    pub note_id: Option<String>,
    pub knowledge_base_id: Option<String>,
    pub relative_path: Option<String>,
    pub snippet: String,
    pub content: String,
    pub content_hash: String,
    pub score: f64,
    pub explicit: bool,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextBundle {
    pub sources: Vec<ContextSource>,
    pub total_characters: usize,
    pub truncated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatusDto {
    pub documents: i64,
    pub chunks: i64,
    pub indexed: i64,
    pub failed: i64,
    pub unsupported: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditProposalDto {
    pub id: String,
    pub note_id: String,
    pub action: String,
    pub original_text: String,
    pub replacement_markdown: String,
    pub selection_from: Option<i64>,
    pub selection_to: Option<i64>,
    pub target_language: Option<String>,
    pub base_updated_at: String,
    pub base_content_hash: String,
    pub status: String,
    pub sources: serde_json::Value,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteRevisionDto {
    pub id: String,
    pub note_id: String,
    pub title: String,
    pub content_html: String,
    pub content_text: String,
    pub content_markdown: String,
    pub reason: String,
    pub created_at: String,
}

pub fn content_hash(content: &str) -> String {
    format!("{:x}", Sha256::digest(content.as_bytes()))
}

pub fn init_schema(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS search_documents (
          id TEXT PRIMARY KEY, source_type TEXT NOT NULL, source_id TEXT NOT NULL,
          knowledge_base_id TEXT, relative_path TEXT, title TEXT NOT NULL,
          content_hash TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'indexed', error TEXT NOT NULL DEFAULT ''
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_search_documents_source ON search_documents(source_type,source_id);
        CREATE TABLE IF NOT EXISTS search_chunks (
          id INTEGER PRIMARY KEY AUTOINCREMENT, document_id TEXT NOT NULL REFERENCES search_documents(id) ON DELETE CASCADE,
          chunk_index INTEGER NOT NULL, title TEXT NOT NULL, path TEXT NOT NULL,
          content TEXT NOT NULL, parent_content TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_search_chunks_document ON search_chunks(document_id);
        CREATE VIRTUAL TABLE IF NOT EXISTS search_chunks_fts USING fts5(
          title, path, content, content='search_chunks', content_rowid='id', tokenize='trigram'
        );
        CREATE TRIGGER IF NOT EXISTS search_chunks_ai AFTER INSERT ON search_chunks BEGIN
          INSERT INTO search_chunks_fts(rowid,title,path,content) VALUES (new.id,new.title,new.path,new.content);
        END;
        CREATE TRIGGER IF NOT EXISTS search_chunks_ad AFTER DELETE ON search_chunks BEGIN
          INSERT INTO search_chunks_fts(search_chunks_fts,rowid,title,path,content) VALUES('delete',old.id,old.title,old.path,old.content);
        END;
        CREATE TRIGGER IF NOT EXISTS search_chunks_au AFTER UPDATE ON search_chunks BEGIN
          INSERT INTO search_chunks_fts(search_chunks_fts,rowid,title,path,content) VALUES('delete',old.id,old.title,old.path,old.content);
          INSERT INTO search_chunks_fts(rowid,title,path,content) VALUES (new.id,new.title,new.path,new.content);
        END;
        CREATE TABLE IF NOT EXISTS ai_edit_proposals (
          id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          action TEXT NOT NULL, original_text TEXT NOT NULL, replacement_markdown TEXT NOT NULL,
          selection_from INTEGER, selection_to INTEGER, target_language TEXT,
          base_updated_at TEXT NOT NULL, base_content_hash TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft', sources_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ai_edit_proposals_note ON ai_edit_proposals(note_id,created_at DESC);
        CREATE TABLE IF NOT EXISTS note_revisions (
          id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          title TEXT NOT NULL, content_html TEXT NOT NULL, content_text TEXT NOT NULL,
          content_markdown TEXT NOT NULL DEFAULT '',
          reason TEXT NOT NULL DEFAULT 'ai_edit', created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_note_revisions_note ON note_revisions(note_id,created_at DESC);",
    )
    .map_err(AppError::db)
}

fn char_slice(value: &str, start: usize, end: usize) -> String {
    value
        .chars()
        .skip(start)
        .take(end.saturating_sub(start))
        .collect()
}

fn split_windows(value: &str, size: usize, overlap: usize) -> Vec<String> {
    let len = value.chars().count();
    if len == 0 {
        return Vec::new();
    }
    let mut result = Vec::new();
    let mut start = 0;
    while start < len {
        let end = (start + size).min(len);
        result.push(char_slice(value, start, end));
        if end == len {
            break;
        }
        start = end.saturating_sub(overlap);
    }
    result
}

struct IndexedDocument<'a> {
    document_id: &'a str,
    source_type: &'a str,
    source_id: &'a str,
    knowledge_base_id: Option<&'a str>,
    relative_path: Option<&'a str>,
    title: &'a str,
    content: &'a str,
    updated_at: &'a str,
}

fn replace_document(conn: &Connection, document: IndexedDocument<'_>) -> Result<(), AppError> {
    let IndexedDocument {
        document_id,
        source_type,
        source_id,
        knowledge_base_id,
        relative_path,
        title,
        content,
        updated_at,
    } = document;
    conn.execute(
        "DELETE FROM search_documents WHERE id=?1",
        params![document_id],
    )
    .map_err(AppError::db)?;
    conn.execute(
        "INSERT INTO search_documents(id,source_type,source_id,knowledge_base_id,relative_path,title,content_hash,updated_at,status,error) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,'indexed','')",
        params![document_id, source_type, source_id, knowledge_base_id, relative_path, title, content_hash(content), updated_at],
    ).map_err(AppError::db)?;
    let parents = split_windows(content, 2_000, 200);
    let mut chunk_index = 0_i64;
    for parent in parents {
        for child in split_windows(&parent, 400, 50) {
            conn.execute(
                "INSERT INTO search_chunks(document_id,chunk_index,title,path,content,parent_content) VALUES(?1,?2,?3,?4,?5,?6)",
                params![document_id, chunk_index, title, relative_path.unwrap_or_default(), child, parent],
            ).map_err(AppError::db)?;
            chunk_index += 1;
        }
    }
    Ok(())
}

pub fn index_note(conn: &Connection, note_id: &str) -> Result<(), AppError> {
    let note = conn
        .query_row(
            "SELECT title,content_text,deleted_at,updated_at,knowledge_base_id FROM notes WHERE id=?1",
            params![note_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            },
        )
        .optional()
        .map_err(AppError::db)?;
    let document_id = format!("note:{note_id}");
    match note {
        Some((title, content, None, updated_at, knowledge_base_id)) => replace_document(
            conn,
            IndexedDocument {
                document_id: &document_id,
                source_type: "note",
                source_id: note_id,
                knowledge_base_id: knowledge_base_id.as_deref(),
                relative_path: None,
                title: &title,
                content: &content,
                updated_at: &updated_at,
            },
        ),
        _ => conn
            .execute(
                "DELETE FROM search_documents WHERE id=?1",
                params![document_id],
            )
            .map(|_| ())
            .map_err(AppError::db),
    }
}

fn supported_extension(path: &Path) -> Option<String> {
    let ext = path.extension()?.to_str()?.to_lowercase();
    SUPPORTED_EXTENSIONS.contains(&ext.as_str()).then_some(ext)
}

fn strip_html(content: &str) -> String {
    let mut out = String::with_capacity(content.len());
    let mut in_tag = false;
    for ch in content.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                out.push(' ');
            }
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out
}

fn read_indexable_content(
    conn: &Connection,
    path: &Path,
    ext: &str,
) -> Result<(String, Option<String>), String> {
    let metadata = fs::metadata(path).map_err(|_| "metadata_failed".to_string())?;
    if metadata.len() > MAX_FILE_BYTES {
        return Err("file_too_large".into());
    }
    let raw = fs::read_to_string(path).map_err(|_| "invalid_text_encoding".to_string())?;
    if ext == "note" {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) {
            if value.get("format").and_then(|v| v.as_str()) == Some("tiny-note-reference") {
                if let Some(note_id) = value.get("noteId").and_then(|v| v.as_str()) {
                    let note = conn.query_row(
                        "SELECT content_text,title FROM notes WHERE id=?1 AND deleted_at IS NULL",
                        params![note_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                    ).optional().map_err(|_| "note_reference_failed".to_string())?;
                    return note
                        .map(|(content, title)| (content, Some(title)))
                        .ok_or_else(|| "note_reference_missing".into());
                }
            }
        }
    }
    let content = if matches!(ext, "html" | "htm") {
        strip_html(&raw)
    } else {
        raw
    };
    Ok((content, None))
}

fn index_library_file_conn(
    conn: &Connection,
    kb_id: &str,
    root: &Path,
    path: &Path,
) -> Result<(), AppError> {
    let relative = path
        .strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/");
    if relative == ".tiny-note.json" || path.is_dir() {
        return Ok(());
    }
    if path.extension().and_then(|value| value.to_str()) == Some("note") {
        if let Ok(raw) = fs::read_to_string(path) {
            if serde_json::from_str::<serde_json::Value>(&raw)
                .ok()
                .and_then(|value| {
                    value
                        .get("format")
                        .and_then(|format| format.as_str())
                        .map(|format| format == "tiny-note-reference")
                })
                == Some(true)
            {
                return Ok(());
            }
        }
    }
    let document_id = format!("file:{kb_id}:{relative}");
    let title = path
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or(&relative)
        .to_string();
    let Some(ext) = supported_extension(path) else {
        conn.execute(
            "DELETE FROM search_documents WHERE id=?1",
            params![document_id],
        )
        .map_err(AppError::db)?;
        conn.execute("INSERT INTO search_documents(id,source_type,source_id,knowledge_base_id,relative_path,title,updated_at,status,error) VALUES(?1,'file',?2,?3,?4,?5,?6,'unsupported','unsupported_file_type')",
            params![document_id, format!("{kb_id}:{relative}"), kb_id, relative, title, crate::now()]).map_err(AppError::db)?;
        return Ok(());
    };
    match read_indexable_content(conn, path, &ext) {
        Ok((content, resolved_title)) => {
            let source_id = format!("{kb_id}:{relative}");
            let updated_at = crate::now();
            replace_document(
                conn,
                IndexedDocument {
                    document_id: &document_id,
                    source_type: "file",
                    source_id: &source_id,
                    knowledge_base_id: Some(kb_id),
                    relative_path: Some(&relative),
                    title: resolved_title.as_deref().unwrap_or(&title),
                    content: &content,
                    updated_at: &updated_at,
                },
            )
        }
        Err(error) => {
            conn.execute(
                "DELETE FROM search_documents WHERE id=?1",
                params![document_id],
            )
            .map_err(AppError::db)?;
            conn.execute("INSERT INTO search_documents(id,source_type,source_id,knowledge_base_id,relative_path,title,updated_at,status,error) VALUES(?1,'file',?2,?3,?4,?5,?6,'failed',?7)",
                params![document_id, format!("{kb_id}:{relative}"), kb_id, relative, title, crate::now(), error]).map_err(AppError::db)?;
            Ok(())
        }
    }
}

pub fn index_library_file(
    state: &AppState,
    kb_id: &str,
    root: &Path,
    path: &Path,
) -> Result<(), AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    index_library_file_conn(&conn, kb_id, root, path)
}

pub fn reindex_library_path(
    state: &AppState,
    kb_id: &str,
    root: &Path,
    relative_path: &str,
) -> Result<(), AppError> {
    let relative_path = relative_path.replace('\\', "/");
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    let prefix = format!("file:{kb_id}:{relative_path}");
    conn.execute(
        "DELETE FROM search_documents WHERE id=?1 OR id LIKE ?2",
        params![prefix, format!("{prefix}/%")],
    )
    .map_err(AppError::db)?;
    let path = root.join(relative_path);
    if path.is_dir() {
        for entry in WalkDir::new(&path)
            .follow_links(false)
            .into_iter()
            .filter_map(Result::ok)
        {
            if entry.file_type().is_file() {
                index_library_file_conn(&conn, kb_id, root, entry.path())?;
            }
        }
    } else if path.is_file() {
        index_library_file_conn(&conn, kb_id, root, &path)?;
    }
    Ok(())
}

pub fn rebuild_all(state: &AppState) -> Result<IndexStatusDto, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    conn.execute("DELETE FROM search_documents", [])
        .map_err(AppError::db)?;
    let note_ids = conn
        .prepare("SELECT id FROM notes WHERE deleted_at IS NULL")
        .map_err(AppError::db)?
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(AppError::db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::db)?;
    for note_id in note_ids {
        index_note(&conn, &note_id)?;
    }
    let bases = conn
        .prepare("SELECT id,root_path FROM knowledge_bases")
        .map_err(AppError::db)?
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(AppError::db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::db)?;
    for (kb_id, root_path) in bases {
        let root = std::path::PathBuf::from(root_path);
        for entry in WalkDir::new(&root)
            .follow_links(false)
            .into_iter()
            .filter_map(Result::ok)
        {
            if entry.file_type().is_file() {
                index_library_file_conn(&conn, &kb_id, &root, entry.path())?;
            }
        }
    }
    index_status_conn(&conn)
}

fn index_status_conn(conn: &Connection) -> Result<IndexStatusDto, AppError> {
    let count = |condition: &str| {
        conn.query_row(
            &format!("SELECT COUNT(*) FROM search_documents {condition}"),
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(AppError::db)
    };
    Ok(IndexStatusDto {
        documents: count("")?,
        chunks: conn
            .query_row("SELECT COUNT(*) FROM search_chunks", [], |row| row.get(0))
            .map_err(AppError::db)?,
        indexed: count("WHERE status='indexed'")?,
        failed: count("WHERE status='failed'")?,
        unsupported: count("WHERE status='unsupported'")?,
    })
}

pub fn index_status(state: &AppState) -> Result<IndexStatusDto, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    index_status_conn(&conn)
}

fn truncate_chars(value: &str, max: usize) -> (String, bool) {
    if value.chars().count() <= max {
        return (value.to_string(), false);
    }
    (value.chars().take(max).collect(), true)
}

fn explicit_source(
    state: &AppState,
    reference: &ContextReference,
) -> Result<ContextSource, AppError> {
    if reference.kind == "note" {
        let note_id = reference
            .note_id
            .as_deref()
            .ok_or_else(|| AppError::invalid("invalid_reference", "Missing note id"))?;
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        let (title, content) = conn
            .query_row(
                "SELECT title,content_text FROM notes WHERE id=?1 AND deleted_at IS NULL",
                params![note_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(AppError::db)?
            .ok_or_else(|| {
                AppError::not_found("reference_not_found", "Referenced note not found")
            })?;
        let (content, truncated) = truncate_chars(&content, MAX_REFERENCE_CHARS);
        return Ok(ContextSource {
            id: format!("note:{note_id}"),
            source_type: "note".into(),
            title,
            note_id: Some(note_id.into()),
            knowledge_base_id: None,
            relative_path: None,
            snippet: content.chars().take(160).collect(),
            content_hash: content_hash(&content),
            content,
            score: 1000.0,
            explicit: true,
            truncated,
        });
    }
    let kb_id = reference
        .knowledge_base_id
        .as_deref()
        .ok_or_else(|| AppError::invalid("invalid_reference", "Missing knowledge base id"))?;
    let relative = reference
        .relative_path
        .as_deref()
        .ok_or_else(|| AppError::invalid("invalid_reference", "Missing relative path"))?;
    let root = commands::kb_root(state, kb_id)?;
    let path = commands::safe_path(&root, relative)?;
    let ext = supported_extension(&path)
        .ok_or_else(|| AppError::invalid("unsupported_reference", "Unsupported reference type"))?;
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    let (raw, resolved_title) = read_indexable_content(&conn, &path, &ext)
        .map_err(|code| AppError::invalid(&code, "Reference could not be read"))?;
    let (content, truncated) = truncate_chars(&raw, MAX_REFERENCE_CHARS);
    Ok(ContextSource {
        id: format!("file:{kb_id}:{relative}"),
        source_type: "file".into(),
        title: resolved_title
            .or_else(|| reference.name.clone())
            .unwrap_or_else(|| relative.into()),
        note_id: None,
        knowledge_base_id: Some(kb_id.into()),
        relative_path: Some(relative.into()),
        snippet: content.chars().take(160).collect(),
        content_hash: content_hash(&content),
        content,
        score: 1000.0,
        explicit: true,
        truncated,
    })
}

fn search_sources(
    state: &AppState,
    query: &str,
    scope: &ContextScope,
) -> Result<Vec<ContextSource>, AppError> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    let mut terms = Vec::new();
    for token in query.split(|ch: char| !ch.is_alphanumeric()) {
        let chars = token.chars().collect::<Vec<_>>();
        if chars.len() < 3 {
            continue;
        }
        if token.is_ascii() {
            terms.push(token.to_lowercase());
        } else {
            for window in chars.windows(3) {
                terms.push(window.iter().collect::<String>());
                if terms.len() >= 12 {
                    break;
                }
            }
        }
        if terms.len() >= 12 {
            break;
        }
    }
    terms.sort();
    terms.dedup();
    let (sql, search_parameter) = if terms.is_empty() {
        (
            "SELECT d.id,d.source_type,d.title,d.source_id,d.knowledge_base_id,d.relative_path,c.parent_content,0.0
             FROM search_chunks c JOIN search_documents d ON d.id=c.document_id
             WHERE (c.content LIKE ?1 OR c.title LIKE ?1 OR c.path LIKE ?1) AND d.status='indexed' LIMIT 24",
            format!("%{}%", query.trim()),
        )
    } else {
        (
            "SELECT d.id,d.source_type,d.title,d.source_id,d.knowledge_base_id,d.relative_path,c.parent_content,bm25(search_chunks_fts,8.0,5.0,1.0)
             FROM search_chunks_fts JOIN search_chunks c ON c.id=search_chunks_fts.rowid JOIN search_documents d ON d.id=c.document_id
             WHERE search_chunks_fts MATCH ?1 AND d.status='indexed' ORDER BY 8 LIMIT 24",
            terms
                .into_iter()
                .map(|term| format!("\"{}\"", term.replace('"', "\"\"")))
                .collect::<Vec<_>>()
                .join(" OR "),
        )
    };
    let mut statement = conn.prepare(sql).map_err(AppError::db)?;
    let rows = statement
        .query_map(params![search_parameter], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, f64>(7)?,
            ))
        })
        .map_err(AppError::db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::db)?;
    let mut seen = HashSet::new();
    let mut sources = Vec::new();
    for (id, source_type, title, source_id, kb_id, path, content, rank) in rows {
        if !scope.knowledge_base_ids.is_empty()
            && kb_id
                .as_ref()
                .is_some_and(|id| !scope.knowledge_base_ids.contains(id))
        {
            continue;
        }
        let note_id = (source_type == "note").then_some(source_id.clone());
        if !scope.note_ids.is_empty()
            && note_id
                .as_ref()
                .is_some_and(|id| !scope.note_ids.contains(id))
        {
            continue;
        }
        if !seen.insert(id.clone()) {
            continue;
        }
        let (content, truncated) = truncate_chars(&content, 2_000);
        sources.push(ContextSource {
            id,
            source_type,
            title,
            note_id,
            knowledge_base_id: kb_id,
            relative_path: path,
            snippet: content.chars().take(160).collect(),
            content_hash: content_hash(&content),
            content,
            score: -rank,
            explicit: false,
            truncated,
        });
        if sources.len() == MAX_SOURCES {
            break;
        }
    }
    Ok(sources)
}

pub fn resolve_context(
    state: &AppState,
    query: &str,
    references: &[ContextReference],
    scope: &ContextScope,
    auto_retrieve: bool,
) -> Result<ContextBundle, AppError> {
    let mut sources = Vec::new();
    let mut seen = HashSet::new();
    for reference in references {
        let source = explicit_source(state, reference)?;
        if seen.insert(source.id.clone()) {
            sources.push(source);
        }
        if sources.len() == MAX_SOURCES {
            break;
        }
    }
    if auto_retrieve {
        for source in search_sources(state, query, scope)? {
            if seen.insert(source.id.clone()) {
                sources.push(source);
            }
            if sources.len() == MAX_SOURCES {
                break;
            }
        }
    }
    let mut used = 0;
    let mut truncated = false;
    for source in &mut sources {
        let remaining = MAX_CONTEXT_CHARS.saturating_sub(used);
        let (content, cut) = truncate_chars(&source.content, remaining);
        source.content = content;
        source.truncated |= cut;
        truncated |= source.truncated;
        used += source.content.chars().count();
    }
    sources.retain(|source| !source.content.is_empty());
    Ok(ContextBundle {
        sources,
        total_characters: used,
        truncated,
    })
}

pub struct ProposalDraft<'a> {
    pub note_id: &'a str,
    pub action: &'a str,
    pub replacement: &'a str,
    pub selection_from: Option<i64>,
    pub selection_to: Option<i64>,
    pub selected_text: Option<&'a str>,
    pub target_language: Option<&'a str>,
    pub sources: &'a [ContextSource],
}

pub fn create_proposal(
    conn: &Connection,
    draft: ProposalDraft<'_>,
) -> Result<EditProposalDto, AppError> {
    let ProposalDraft {
        note_id,
        action,
        replacement,
        selection_from,
        selection_to,
        selected_text,
        target_language,
        sources,
    } = draft;
    let (content, updated_at) = conn
        .query_row(
            "SELECT content_text,updated_at FROM notes WHERE id=?1 AND deleted_at IS NULL",
            params![note_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(AppError::db)?
        .ok_or_else(|| AppError::not_found("note_not_found", "Note not found"))?;
    let proposal = EditProposalDto {
        id: Uuid::new_v4().to_string(),
        note_id: note_id.into(),
        action: action.into(),
        original_text: selected_text.unwrap_or(&content).into(),
        replacement_markdown: replacement.into(),
        selection_from,
        selection_to,
        target_language: target_language.map(str::to_string),
        base_updated_at: updated_at,
        base_content_hash: content_hash(&content),
        status: "draft".into(),
        sources: serde_json::to_value(sources).unwrap_or_else(|_| serde_json::json!([])),
        created_at: crate::now(),
    };
    conn.execute("INSERT INTO ai_edit_proposals(id,note_id,action,original_text,replacement_markdown,selection_from,selection_to,target_language,base_updated_at,base_content_hash,status,sources_json,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
        params![proposal.id,proposal.note_id,proposal.action,proposal.original_text,proposal.replacement_markdown,proposal.selection_from,proposal.selection_to,proposal.target_language,proposal.base_updated_at,proposal.base_content_hash,proposal.status,proposal.sources.to_string(),proposal.created_at]).map_err(AppError::db)?;
    Ok(proposal)
}

pub fn proposal_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<EditProposalDto> {
    let sources: String = row.get(11)?;
    Ok(EditProposalDto {
        id: row.get(0)?,
        note_id: row.get(1)?,
        action: row.get(2)?,
        original_text: row.get(3)?,
        replacement_markdown: row.get(4)?,
        selection_from: row.get(5)?,
        selection_to: row.get(6)?,
        target_language: row.get(7)?,
        base_updated_at: row.get(8)?,
        base_content_hash: row.get(9)?,
        status: row.get(10)?,
        sources: serde_json::from_str(&sources).unwrap_or_else(|_| serde_json::json!([])),
        created_at: row.get(12)?,
    })
}

pub fn revision_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<NoteRevisionDto> {
    Ok(NoteRevisionDto {
        id: row.get(0)?,
        note_id: row.get(1)?,
        title: row.get(2)?,
        content_html: row.get(3)?,
        content_text: row.get(4)?,
        content_markdown: row.get(5)?,
        reason: row.get(6)?,
        created_at: row.get(7)?,
    })
}
