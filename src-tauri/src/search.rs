use crate::{commands, AppError, AppState};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, fs, path::Path};
use uuid::Uuid;

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
        "DROP TRIGGER IF EXISTS search_chunks_ai;
        DROP TRIGGER IF EXISTS search_chunks_ad;
        DROP TRIGGER IF EXISTS search_chunks_au;
        DROP TABLE IF EXISTS search_chunks_fts;
        DROP TABLE IF EXISTS search_chunks;
        DROP TABLE IF EXISTS search_documents;
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

fn read_reference_content(
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
    let (raw, resolved_title) = read_reference_content(&conn, &path, &ext)
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

pub fn resolve_explicit_context(
    state: &AppState,
    references: &[ContextReference],
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
