use chrono::Utc;
use futures_util::StreamExt;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{ser::SerializeStruct, Deserialize, Serialize, Serializer};
use std::{
    collections::HashMap,
    fs,
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
};
use tauri::{ipc::Channel, Manager, State};
use thiserror::Error;
use uuid::Uuid;
use walkdir::WalkDir;

#[derive(Debug, Error, Clone)]
pub enum AppError {
    #[error("database error")]
    Database { code: String, message: String },
    #[error("not found")]
    NotFound { code: String, message: String },
    #[error("invalid input")]
    InvalidInput { code: String, message: String },
    #[error("filesystem error")]
    Filesystem { code: String, message: String },
    #[error("operation failed")]
    Operation { code: String, message: String },
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let (code, message) = match self {
            Self::Database { code, message }
            | Self::NotFound { code, message }
            | Self::InvalidInput { code, message }
            | Self::Filesystem { code, message }
            | Self::Operation { code, message } => (code, message),
        };
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("code", code)?;
        state.serialize_field("message", message)?;
        state.end()
    }
}

impl AppError {
    fn invalid(code: &str, message: &str) -> Self {
        Self::InvalidInput {
            code: code.into(),
            message: message.into(),
        }
    }
    fn not_found(code: &str, message: &str) -> Self {
        Self::NotFound {
            code: code.into(),
            message: message.into(),
        }
    }
    fn db(err: impl std::fmt::Display) -> Self {
        Self::Database {
            code: "database_error".into(),
            message: err.to_string(),
        }
    }
    fn fs(err: impl std::fmt::Display) -> Self {
        Self::Filesystem {
            code: "filesystem_error".into(),
            message: err.to_string(),
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    db: Arc<Mutex<Connection>>,
    data_dir: PathBuf,
    cancels: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteDto {
    pub id: String,
    pub notebook_id: Option<String>,
    pub title: String,
    pub content_html: String,
    pub content_text: String,
    pub deleted_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookDto {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeBaseDto {
    pub id: String,
    pub category: String,
    pub name: String,
    pub description: String,
    pub cover: Option<String>,
    pub root_path: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntryDto {
    pub name: String,
    pub relative_path: String,
    pub kind: String,
    pub size: u64,
    pub modified_at: Option<String>,
    pub extension: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewDto {
    pub kind: String,
    pub title: String,
    pub content: String,
    pub mime_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModelProfileDto {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub base_url: String,
    pub model: String,
    pub api_key_configured: bool,
    pub is_default: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsDto {
    pub theme: String,
    pub language: String,
    pub fim_enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNote {
    pub title: Option<String>,
    pub notebook_id: Option<String>,
    pub content_html: Option<String>,
    pub content_text: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNote {
    pub title: String,
    pub notebook_id: Option<String>,
    pub content_html: String,
    pub content_text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateKnowledgeBase {
    pub category: String,
    pub name: String,
    pub description: Option<String>,
    pub cover: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRequest {
    pub request_id: String,
    pub action: String,
    pub text: String,
    pub instruction: Option<String>,
    pub model_profile_id: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AiEvent {
    Started {
        request_id: String,
    },
    Delta {
        request_id: String,
        text: String,
    },
    Completed {
        request_id: String,
    },
    Cancelled {
        request_id: String,
    },
    Error {
        request_id: String,
        code: String,
        message: String,
    },
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn init_database(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch("PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS notebooks (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, notebook_id TEXT REFERENCES notebooks(id) ON DELETE SET NULL, title TEXT NOT NULL, content_html TEXT NOT NULL, content_text TEXT NOT NULL, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_notes_deleted_updated ON notes(deleted_at, updated_at);
      CREATE TABLE IF NOT EXISTS knowledge_bases (id TEXT PRIMARY KEY, category TEXT NOT NULL CHECK(category IN ('personal','local')), name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', cover TEXT, root_path TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS model_profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, provider TEXT NOT NULL, base_url TEXT NOT NULL, model TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);")
        .map_err(AppError::db)?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM notebooks", [], |r| r.get(0))
        .map_err(AppError::db)?;
    if count == 0 {
        let t = now();
        conn.execute("INSERT INTO notebooks (id,name,description,created_at,updated_at) VALUES (?1,?2,'',?3,?3)", params![Uuid::new_v4().to_string(), "未分类", t]).map_err(AppError::db)?;
    }
    Ok(())
}

fn app_state(app: &tauri::AppHandle) -> Result<AppState, AppError> {
    let data_dir = app.path().app_data_dir().map_err(AppError::fs)?;
    fs::create_dir_all(data_dir.join("knowledge")).map_err(AppError::fs)?;
    fs::create_dir_all(data_dir.join("attachments")).map_err(AppError::fs)?;
    let conn = Connection::open(data_dir.join("tiny-note.db")).map_err(AppError::db)?;
    init_database(&conn)?;
    let state = AppState {
        db: Arc::new(Mutex::new(conn)),
        data_dir,
        cancels: Arc::new(Mutex::new(HashMap::new())),
    };
    ensure_default_kbs(&state)?;
    Ok(state)
}

fn ensure_default_kbs(state: &AppState) -> Result<(), AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM knowledge_bases", [], |r| r.get(0))
        .map_err(AppError::db)?;
    if count == 0 {
        for (category, name) in [("personal", "我的笔记"), ("local", "我的书籍")] {
            let id = Uuid::new_v4().to_string();
            let root = state.data_dir.join("knowledge").join(category).join(&id);
            fs::create_dir_all(&root).map_err(AppError::fs)?;
            fs::write(
                root.join(".tiny-note.json"),
                format!("{{\"id\":\"{id}\",\"category\":\"{category}\"}}"),
            )
            .map_err(AppError::fs)?;
            let t = now();
            conn.execute("INSERT INTO knowledge_bases (id,category,name,description,cover,root_path,created_at,updated_at) VALUES (?1,?2,?3,'',NULL,?4,?5,?5)", params![id, category, name, root.to_string_lossy(), t]).map_err(AppError::db)?;
        }
    }
    Ok(())
}

fn note_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<NoteDto> {
    Ok(NoteDto {
        id: row.get(0)?,
        notebook_id: row.get(1)?,
        title: row.get(2)?,
        content_html: row.get(3)?,
        content_text: row.get(4)?,
        deleted_at: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

pub mod commands {
    use super::*;

    #[tauri::command]
    pub fn note_list(
        state: State<'_, AppState>,
        search: Option<String>,
        deleted: bool,
    ) -> Result<Vec<NoteDto>, AppError> {
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        let pattern = format!("%{}%", search.unwrap_or_default());
        let sql = if deleted {
            "SELECT id,notebook_id,title,content_html,content_text,deleted_at,created_at,updated_at FROM notes WHERE deleted_at IS NOT NULL AND (title LIKE ?1 OR content_text LIKE ?1) ORDER BY updated_at DESC"
        } else {
            "SELECT id,notebook_id,title,content_html,content_text,deleted_at,created_at,updated_at FROM notes WHERE deleted_at IS NULL AND (title LIKE ?1 OR content_text LIKE ?1) ORDER BY updated_at DESC"
        };
        let result = conn
            .prepare(sql)
            .map_err(AppError::db)?
            .query_map(params![pattern], note_from_row)
            .map_err(AppError::db)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(AppError::db);
        result
    }

    #[tauri::command]
    pub fn note_get(state: State<'_, AppState>, id: String) -> Result<NoteDto, AppError> {
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        conn.query_row("SELECT id,notebook_id,title,content_html,content_text,deleted_at,created_at,updated_at FROM notes WHERE id=?1", params![id], note_from_row).optional().map_err(AppError::db)?.ok_or_else(|| AppError::not_found("note_not_found", "Note not found"))
    }

    #[tauri::command]
    pub fn note_create(state: State<'_, AppState>, input: CreateNote) -> Result<NoteDto, AppError> {
        let id = Uuid::new_v4().to_string();
        let t = now();
        let title = input.title.unwrap_or_else(|| "未命名笔记".into());
        let html = input.content_html.unwrap_or_default();
        let text = input.content_text.unwrap_or_default();
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        conn.execute("INSERT INTO notes (id,notebook_id,title,content_html,content_text,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?6)", params![id, input.notebook_id, title, html, text, t]).map_err(AppError::db)?;
        drop(conn);
        note_get(state, id)
    }

    #[tauri::command]
    pub fn note_update(
        state: State<'_, AppState>,
        id: String,
        input: UpdateNote,
    ) -> Result<NoteDto, AppError> {
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        let t = now();
        let changed = conn.execute("UPDATE notes SET notebook_id=?2,title=?3,content_html=?4,content_text=?5,updated_at=?6 WHERE id=?1", params![id, input.notebook_id, input.title, input.content_html, input.content_text, t]).map_err(AppError::db)?;
        if changed == 0 {
            return Err(AppError::not_found("note_not_found", "Note not found"));
        }
        drop(conn);
        note_get(state, id)
    }

    #[tauri::command]
    pub fn note_delete(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        let changed = conn
            .execute(
                "UPDATE notes SET deleted_at=?2,updated_at=?2 WHERE id=?1",
                params![id, now()],
            )
            .map_err(AppError::db)?;
        if changed == 0 {
            Err(AppError::not_found("note_not_found", "Note not found"))
        } else {
            Ok(())
        }
    }

    #[tauri::command]
    pub fn note_copy(state: State<'_, AppState>, id: String) -> Result<NoteDto, AppError> {
        let source = note_get(state.clone(), id)?;
        let new_id = Uuid::new_v4().to_string();
        let title = if source.title.is_empty() {
            "未命名笔记".to_string()
        } else {
            format!("{} 副本", source.title)
        };
        let t = now();
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        conn.execute("INSERT INTO notes (id,notebook_id,title,content_html,content_text,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?6)", params![new_id, source.notebook_id, title, source.content_html, source.content_text, t]).map_err(AppError::db)?;
        drop(conn);
        note_get(state, new_id)
    }

    #[tauri::command]
    pub fn note_move(
        state: State<'_, AppState>,
        id: String,
        notebook_id: Option<String>,
    ) -> Result<(), AppError> {
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        let changed = conn
            .execute(
                "UPDATE notes SET notebook_id=?2,updated_at=?3 WHERE id=?1",
                params![id, notebook_id, now()],
            )
            .map_err(AppError::db)?;
        if changed == 0 {
            Err(AppError::not_found("note_not_found", "Note not found"))
        } else {
            Ok(())
        }
    }

    #[tauri::command]
    pub fn note_restore(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        conn.execute(
            "UPDATE notes SET deleted_at=NULL,updated_at=?2 WHERE id=?1",
            params![id, now()],
        )
        .map_err(AppError::db)?;
        Ok(())
    }

    #[tauri::command]
    pub fn note_purge_expired(state: State<'_, AppState>) -> Result<u64, AppError> {
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        let n = conn.execute("DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now','-30 day')", []).map_err(AppError::db)?;
        Ok(n as u64)
    }

    #[tauri::command]
    pub fn note_purge(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        conn.execute("DELETE FROM notes WHERE id=?1", params![id])
            .map_err(AppError::db)?;
        Ok(())
    }

    #[tauri::command]
    pub fn notebook_list(state: State<'_, AppState>) -> Result<Vec<NotebookDto>, AppError> {
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        let result = conn
            .prepare(
                "SELECT id,name,description,created_at,updated_at FROM notebooks ORDER BY name",
            )
            .map_err(AppError::db)?
            .query_map([], |r| {
                Ok(NotebookDto {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    description: r.get(2)?,
                    created_at: r.get(3)?,
                    updated_at: r.get(4)?,
                })
            })
            .map_err(AppError::db)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(AppError::db);
        result
    }

    #[tauri::command]
    pub fn notebook_create(
        state: State<'_, AppState>,
        name: String,
        description: Option<String>,
    ) -> Result<NotebookDto, AppError> {
        let id = Uuid::new_v4().to_string();
        let t = now();
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        conn.execute(
            "INSERT INTO notebooks VALUES (?1,?2,?3,?4,?4)",
            params![id, name, description.unwrap_or_default(), t],
        )
        .map_err(AppError::db)?;
        drop(conn);
        notebook_list(state).map(|x| x.into_iter().find(|n| n.id == id).unwrap())
    }

    #[tauri::command]
    pub fn notebook_update(
        state: State<'_, AppState>,
        id: String,
        name: String,
        description: Option<String>,
    ) -> Result<(), AppError> {
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        let n = conn
            .execute(
                "UPDATE notebooks SET name=?2,description=?3,updated_at=?4 WHERE id=?1",
                params![id, name, description.unwrap_or_default(), now()],
            )
            .map_err(AppError::db)?;
        if n == 0 {
            Err(AppError::not_found(
                "notebook_not_found",
                "Notebook not found",
            ))
        } else {
            Ok(())
        }
    }

    #[tauri::command]
    pub fn notebook_delete(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        let fallback: String = conn
            .query_row(
                "SELECT id FROM notebooks WHERE name='未分类' LIMIT 1",
                [],
                |r| r.get(0),
            )
            .map_err(AppError::db)?;
        conn.execute(
            "UPDATE notes SET notebook_id=?2 WHERE notebook_id=?1",
            params![id, fallback],
        )
        .map_err(AppError::db)?;
        let n = conn
            .execute("DELETE FROM notebooks WHERE id=?1", params![id])
            .map_err(AppError::db)?;
        if n == 0 {
            Err(AppError::not_found(
                "notebook_not_found",
                "Notebook not found",
            ))
        } else {
            Ok(())
        }
    }

    pub(crate) fn safe_path(root: &Path, relative: &str) -> Result<PathBuf, AppError> {
        let p = Path::new(relative);
        // `Path` only understands the host platform's syntax. A Linux build
        // would otherwise treat `C:\\escape` as a normal filename, while the
        // same value is an absolute Windows path. Reject Windows separators
        // and drive prefixes explicitly so the boundary is platform-neutral.
        let bytes = relative.as_bytes();
        let has_windows_drive_prefix =
            bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':';
        let has_windows_separator = relative.contains('\\');
        if p.is_absolute()
            || has_windows_drive_prefix
            || has_windows_separator
            || p.components().any(|c| {
                matches!(
                    c,
                    Component::ParentDir | Component::RootDir | Component::Prefix(_)
                )
            })
        {
            return Err(AppError::invalid(
                "invalid_relative_path",
                "Path must stay inside knowledge base",
            ));
        }
        let candidate = root.join(p);
        let parent = candidate.parent().unwrap_or(root);
        let canonical_root = fs::canonicalize(root).map_err(AppError::fs)?;
        let canonical_parent = fs::canonicalize(parent).map_err(AppError::fs)?;
        if !canonical_parent.starts_with(&canonical_root) {
            return Err(AppError::invalid(
                "path_outside_knowledge_base",
                "Path escapes knowledge base",
            ));
        }
        if candidate.exists() {
            let canonical = fs::canonicalize(&candidate).map_err(AppError::fs)?;
            if !canonical.starts_with(&canonical_root) {
                return Err(AppError::invalid(
                    "symlink_outside_knowledge_base",
                    "Path escapes knowledge base",
                ));
            }
        }
        Ok(candidate)
    }

    fn kb_root(state: &AppState, id: &str) -> Result<PathBuf, AppError> {
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        let path: String = conn
            .query_row(
                "SELECT root_path FROM knowledge_bases WHERE id=?1",
                params![id],
                |r| r.get(0),
            )
            .optional()
            .map_err(AppError::db)?
            .ok_or_else(|| {
                AppError::not_found("knowledge_base_not_found", "Knowledge base not found")
            })?;
        Ok(PathBuf::from(path))
    }

    #[tauri::command]
    pub fn knowledge_base_list(
        state: State<'_, AppState>,
    ) -> Result<Vec<KnowledgeBaseDto>, AppError> {
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        let result = conn.prepare("SELECT id,category,name,description,cover,root_path,created_at,updated_at FROM knowledge_bases ORDER BY category,name").map_err(AppError::db)?.query_map([],|r|Ok(KnowledgeBaseDto{id:r.get(0)?,category:r.get(1)?,name:r.get(2)?,description:r.get(3)?,cover:r.get(4)?,root_path:r.get(5)?,created_at:r.get(6)?,updated_at:r.get(7)?})).map_err(AppError::db)?.collect::<Result<Vec<_>,_>>().map_err(AppError::db);
        result
    }

    #[tauri::command]
    pub fn knowledge_base_create(
        state: State<'_, AppState>,
        input: CreateKnowledgeBase,
    ) -> Result<KnowledgeBaseDto, AppError> {
        if input.category != "personal" && input.category != "local" {
            return Err(AppError::invalid(
                "invalid_category",
                "Only personal and local are supported",
            ));
        }
        let id = Uuid::new_v4().to_string();
        let root = state
            .data_dir
            .join("knowledge")
            .join(&input.category)
            .join(&id);
        fs::create_dir_all(&root).map_err(AppError::fs)?;
        fs::write(
            root.join(".tiny-note.json"),
            format!("{{\"id\":\"{id}\",\"category\":\"{}\"}}", input.category),
        )
        .map_err(AppError::fs)?;
        let t = now();
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        conn.execute(
            "INSERT INTO knowledge_bases VALUES (?1,?2,?3,?4,?5,?6,?7,?7)",
            params![
                id,
                input.category,
                input.name,
                input.description.unwrap_or_default(),
                input.cover,
                root.to_string_lossy(),
                t
            ],
        )
        .map_err(AppError::db)?;
        drop(conn);
        knowledge_base_list(state).map(|x| x.into_iter().find(|k| k.id == id).unwrap())
    }

    #[tauri::command]
    pub fn knowledge_base_update(
        state: State<'_, AppState>,
        id: String,
        name: String,
        description: Option<String>,
        cover: Option<String>,
    ) -> Result<(), AppError> {
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        let n = conn
        .execute(
            "UPDATE knowledge_bases SET name=?2,description=?3,cover=?4,updated_at=?5 WHERE id=?1",
            params![id, name, description.unwrap_or_default(), cover, now()],
        )
        .map_err(AppError::db)?;
        if n == 0 {
            Err(AppError::not_found(
                "knowledge_base_not_found",
                "Knowledge base not found",
            ))
        } else {
            Ok(())
        }
    }

    #[tauri::command]
    pub fn knowledge_base_delete(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
        let root = kb_root(&state, &id)?;
        trash::delete(&root).map_err(AppError::fs)?;
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        conn.execute("DELETE FROM knowledge_bases WHERE id=?1", params![id])
            .map_err(AppError::db)?;
        Ok(())
    }

    #[tauri::command]
    pub fn library_list(
        state: State<'_, AppState>,
        knowledge_base_id: String,
        relative_path: Option<String>,
        search: Option<String>,
    ) -> Result<Vec<LibraryEntryDto>, AppError> {
        let root = kb_root(&state, &knowledge_base_id)?;
        let rel = relative_path.unwrap_or_default();
        let dir = safe_path(&root, &rel)?;
        if !dir.is_dir() {
            return Err(AppError::not_found(
                "directory_not_found",
                "Directory not found",
            ));
        }
        let query = search.unwrap_or_default().to_lowercase();
        let mut out = Vec::new();
        for item in WalkDir::new(&dir)
            .min_depth(1)
            .max_depth(if query.is_empty() { 1 } else { usize::MAX })
            .into_iter()
            .filter_map(Result::ok)
        {
            let path = item.path();
            let relpath = path
                .strip_prefix(&root)
                .unwrap_or(path)
                .to_string_lossy()
                .replace('\\', "/");
            let name = path
                .file_name()
                .and_then(|x| x.to_str())
                .unwrap_or_default();
            if name == ".tiny-note.json"
                || (!query.is_empty() && !name.to_lowercase().contains(&query))
            {
                continue;
            }
            let meta = fs::metadata(path).map_err(AppError::fs)?;
            let kind = if meta.is_dir() { "folder" } else { "file" }.to_string();
            let ext = path
                .extension()
                .and_then(|x| x.to_str())
                .map(str::to_lowercase);
            out.push(LibraryEntryDto {
                name: name.into(),
                relative_path: relpath,
                kind,
                size: meta.len(),
                modified_at: meta.modified().ok().map(|t| format!("{:?}", t)),
                extension: ext,
            });
        }
        out.sort_by(|a, b| {
            a.kind
                .cmp(&b.kind)
                .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Ok(out)
    }

    #[tauri::command]
    pub fn library_create_folder(
        state: State<'_, AppState>,
        knowledge_base_id: String,
        relative_path: String,
        name: String,
    ) -> Result<(), AppError> {
        if name.is_empty() || name.contains(['/', '\\']) {
            return Err(AppError::invalid("invalid_name", "Invalid folder name"));
        }
        let root = kb_root(&state, &knowledge_base_id)?;
        let parent = safe_path(&root, &relative_path)?;
        fs::create_dir_all(parent.join(name)).map_err(AppError::fs)
    }

    #[tauri::command]
    pub fn library_write_file(
        state: State<'_, AppState>,
        knowledge_base_id: String,
        relative_path: String,
        content: String,
    ) -> Result<LibraryEntryDto, AppError> {
        let root = kb_root(&state, &knowledge_base_id)?;
        let target = safe_path(&root, &relative_path)?;
        let parent = target.parent().unwrap_or(&root);
        fs::create_dir_all(parent).map_err(AppError::fs)?;
        let mut final_path = target.clone();
        if final_path.exists() {
            let stem = target
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("file");
            let ext = target
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| format!(".{s}"))
                .unwrap_or_default();
            let mut index = 2;
            loop {
                let candidate = parent.join(format!("{stem} ({index}){ext}"));
                if !candidate.exists() {
                    final_path = candidate;
                    break;
                }
                index += 1;
            }
        }
        fs::write(&final_path, content.as_bytes()).map_err(AppError::fs)?;
        let metadata = fs::metadata(&final_path).map_err(AppError::fs)?;
        Ok(LibraryEntryDto {
            name: final_path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or_default()
                .into(),
            relative_path: final_path
                .strip_prefix(&root)
                .unwrap_or(&final_path)
                .to_string_lossy()
                .replace('\\', "/"),
            kind: "file".into(),
            size: metadata.len(),
            modified_at: metadata.modified().ok().map(|t| format!("{t:?}")),
            extension: final_path
                .extension()
                .and_then(|s| s.to_str())
                .map(str::to_lowercase),
        })
    }

    #[tauri::command]
    pub fn library_rename(
        state: State<'_, AppState>,
        knowledge_base_id: String,
        relative_path: String,
        new_name: String,
    ) -> Result<(), AppError> {
        if new_name.is_empty() || new_name.contains(['/', '\\']) {
            return Err(AppError::invalid("invalid_name", "Invalid name"));
        }
        let root = kb_root(&state, &knowledge_base_id)?;
        let path = safe_path(&root, &relative_path)?;
        let target = path.parent().unwrap_or(&root).join(new_name);
        safe_path(
            &root,
            target
                .strip_prefix(&root)
                .unwrap_or(Path::new(""))
                .to_string_lossy()
                .as_ref(),
        )?;
        fs::rename(path, target).map_err(AppError::fs)
    }

    #[tauri::command]
    pub fn library_move_to_trash(
        state: State<'_, AppState>,
        knowledge_base_id: String,
        relative_path: String,
    ) -> Result<(), AppError> {
        let root = kb_root(&state, &knowledge_base_id)?;
        let path = safe_path(&root, &relative_path)?;
        trash::delete(path).map_err(AppError::fs)
    }

    #[tauri::command]
    pub fn library_preview(
        state: State<'_, AppState>,
        knowledge_base_id: String,
        relative_path: String,
    ) -> Result<PreviewDto, AppError> {
        let root = kb_root(&state, &knowledge_base_id)?;
        let path = safe_path(&root, &relative_path)?;
        let ext = path
            .extension()
            .and_then(|x| x.to_str())
            .unwrap_or_default()
            .to_lowercase();
        let content = fs::read_to_string(&path).map_err(AppError::fs)?;
        let kind = match ext.as_str() {
            "md" | "markdown" => "markdown",
            "html" | "htm" => "html",
            "json" => "json",
            "xml" => "xml",
            "note" => "note",
            "txt" | "text" | "log" | "csv" => "txt",
            _ => "text",
        };
        let mime = match kind {
            "html" => "text/html",
            "json" => "application/json",
            "xml" => "application/xml",
            _ => "text/plain",
        };
        Ok(PreviewDto {
            kind: kind.into(),
            title: path
                .file_name()
                .and_then(|x| x.to_str())
                .unwrap_or_default()
                .into(),
            content,
            mime_type: mime.into(),
        })
    }

    #[tauri::command]
    pub fn settings_get(state: State<'_, AppState>) -> Result<SettingsDto, AppError> {
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        let get = |k: &str, d: &str| -> String {
            conn.query_row("SELECT value FROM settings WHERE key=?1", params![k], |r| {
                r.get(0)
            })
            .unwrap_or_else(|_| d.into())
        };
        Ok(SettingsDto {
            theme: get("theme", "system"),
            language: get("language", "zh-CN"),
            fim_enabled: get("fimEnabled", "false") == "true",
        })
    }

    #[tauri::command]
    pub fn settings_update(
        state: State<'_, AppState>,
        settings: SettingsDto,
    ) -> Result<SettingsDto, AppError> {
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        for (k, v) in [
            ("theme", settings.theme.clone()),
            ("language", settings.language.clone()),
            ("fimEnabled", settings.fim_enabled.to_string()),
        ] {
            conn.execute("INSERT INTO settings(key,value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![k,v]).map_err(AppError::db)?;
        }
        drop(conn);
        settings_get(state)
    }

    #[tauri::command]
    pub fn model_list(state: State<'_, AppState>) -> Result<Vec<ModelProfileDto>, AppError> {
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        let result = conn.prepare(
        "SELECT id,name,provider,base_url,model,is_default FROM model_profiles ORDER BY name",
    )
    .map_err(AppError::db)?
    .query_map([], |r| {
        let id: String = r.get(0)?;
        let configured = keyring::Entry::new("tiny-note", &format!("model:{id}"))
            .ok()
            .and_then(|e| e.get_password().ok())
            .is_some();
        Ok(ModelProfileDto {
            id,
            name: r.get(1)?,
            provider: r.get(2)?,
            base_url: r.get(3)?,
            model: r.get(4)?,
            api_key_configured: configured,
            is_default: r.get::<_, i64>(5)? != 0,
        })
    })
    .map_err(AppError::db)?
    .collect::<Result<Vec<_>, _>>()
    .map_err(AppError::db);
        result
    }

    #[tauri::command]
    pub fn model_upsert(
        state: State<'_, AppState>,
        profile: ModelProfileDto,
        api_key: Option<String>,
    ) -> Result<(), AppError> {
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        conn.execute("INSERT INTO model_profiles(id,name,provider,base_url,model,is_default) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO UPDATE SET name=excluded.name,provider=excluded.provider,base_url=excluded.base_url,model=excluded.model,is_default=excluded.is_default",params![profile.id,profile.name,profile.provider,profile.base_url,profile.model,profile.is_default as i64]).map_err(AppError::db)?;
        drop(conn);
        if let Some(key) = api_key.filter(|x| !x.is_empty()) {
            keyring::Entry::new("tiny-note", &format!("model:{}", profile.id))
                .map_err(|_| AppError::Operation {
                    code: "credential_store_unavailable".into(),
                    message: "Credential store unavailable".into(),
                })?
                .set_password(&key)
                .map_err(|_| AppError::Operation {
                    code: "credential_store_unavailable".into(),
                    message: "Credential store unavailable".into(),
                })?;
        }
        Ok(())
    }

    #[tauri::command]
    pub fn model_delete(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        conn.execute("DELETE FROM model_profiles WHERE id=?1", params![id])
            .map_err(AppError::db)?;
        if let Ok(e) = keyring::Entry::new("tiny-note", &format!("model:{id}")) {
            let _ = e.delete_credential();
        }
        Ok(())
    }

    #[tauri::command]
    pub fn note_ai_stream(
        state: State<'_, AppState>,
        request: AiRequest,
        on_event: Channel<AiEvent>,
    ) -> Result<(), AppError> {
        let cancel = Arc::new(AtomicBool::new(false));
        state
            .cancels
            .lock()
            .map_err(|_| AppError::db("cancel lock poisoned"))?
            .insert(request.request_id.clone(), cancel.clone());
        let cancels = state.cancels.clone();
        let state_for_task = state.inner().clone();
        thread::spawn(move || {
            let id = request.request_id.clone();
            let result = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|_| "runtime_unavailable".to_string())
                .and_then(|runtime| {
                    runtime.block_on(stream_ai(
                        &state_for_task,
                        &request,
                        &on_event,
                        cancel.clone(),
                    ))
                });
            if let Err(message) = result {
                let _ = on_event.send(AiEvent::Error {
                    request_id: id.clone(),
                    code: "ai_request_failed".into(),
                    message,
                });
            }
            let _ = cancels.lock().map(|mut m| m.remove(&id));
        });
        Ok(())
    }

    async fn stream_ai(
        state: &AppState,
        request: &AiRequest,
        on_event: &Channel<AiEvent>,
        cancel: Arc<AtomicBool>,
    ) -> Result<(), String> {
        let id = request.request_id.clone();
        let _ = on_event.send(AiEvent::Started {
            request_id: id.clone(),
        });
        let profile = {
            let conn = state
                .db
                .lock()
                .map_err(|_| "database_lock_failed".to_string())?;
            let query = if let Some(profile_id) = &request.model_profile_id {
                conn.query_row(
                    "SELECT id,base_url,model FROM model_profiles WHERE id=?1",
                    params![profile_id],
                    |r| {
                        Ok((
                            r.get::<_, String>(0)?,
                            r.get::<_, String>(1)?,
                            r.get::<_, String>(2)?,
                        ))
                    },
                )
                .optional()
            } else {
                conn.query_row(
                    "SELECT id,base_url,model FROM model_profiles WHERE is_default=1 LIMIT 1",
                    [],
                    |r| {
                        Ok((
                            r.get::<_, String>(0)?,
                            r.get::<_, String>(1)?,
                            r.get::<_, String>(2)?,
                        ))
                    },
                )
                .optional()
            };
            query.map_err(|_| "model_profile_unavailable".to_string())?
        };
        let Some((profile_id, base_url, model)) = profile else {
            return demo_ai(request, on_event, cancel).await;
        };
        let key = keyring::Entry::new("tiny-note", &format!("model:{profile_id}"))
            .map_err(|_| "credential_store_unavailable".to_string())?
            .get_password()
            .map_err(|_| "api_key_not_configured".to_string())?;
        let endpoint = if base_url.ends_with("/chat/completions") {
            base_url
        } else {
            format!("{}/chat/completions", base_url.trim_end_matches('/'))
        };
        let prompt = if request.action == "custom" {
            request.instruction.clone().unwrap_or_default()
        } else {
            format!(
                "Perform the '{}' writing action. Return Markdown only.\n\n{}",
                request.action, request.text
            )
        };
        let body = serde_json::json!({ "model": model, "stream": true, "messages": [{"role":"system","content":"You are Tiny Note writing assistant."},{"role":"user","content":prompt}] });
        let response = reqwest::Client::new()
            .post(endpoint)
            .bearer_auth(key)
            .json(&body)
            .send()
            .await
            .map_err(|_| "provider_request_failed".to_string())?;
        if !response.status().is_success() {
            return Err("provider_request_failed".into());
        }
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        while let Some(chunk) = stream.next().await {
            if cancel.load(Ordering::Relaxed) {
                let _ = on_event.send(AiEvent::Cancelled {
                    request_id: id.clone(),
                });
                return Ok(());
            }
            let bytes = chunk.map_err(|_| "provider_stream_failed".to_string())?;
            buffer.push_str(&String::from_utf8_lossy(&bytes));
            while let Some(pos) = buffer.find('\n') {
                let line = buffer[..pos].trim().to_string();
                buffer.drain(..=pos);
                if let Some(data) = line.strip_prefix("data:") {
                    let data = data.trim();
                    if data == "[DONE]" {
                        continue;
                    }
                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(text) = value["choices"][0]["delta"]["content"].as_str() {
                            let _ = on_event.send(AiEvent::Delta {
                                request_id: id.clone(),
                                text: text.into(),
                            });
                        }
                    }
                }
            }
        }
        let _ = on_event.send(AiEvent::Completed { request_id: id });
        Ok(())
    }

    async fn demo_ai(
        request: &AiRequest,
        on_event: &Channel<AiEvent>,
        cancel: Arc<AtomicBool>,
    ) -> Result<(), String> {
        let id = request.request_id.clone();
        let text = if request.action == "custom" {
            request.instruction.clone().unwrap_or_default()
        } else {
            format!("（{}）\n{}", request.action, request.text)
        };
        for chunk in text.as_bytes().chunks(24) {
            if cancel.load(Ordering::Relaxed) {
                let _ = on_event.send(AiEvent::Cancelled {
                    request_id: id.clone(),
                });
                return Ok(());
            }
            let _ = on_event.send(AiEvent::Delta {
                request_id: id.clone(),
                text: String::from_utf8_lossy(chunk).into_owned(),
            });
            tokio::time::sleep(std::time::Duration::from_millis(16)).await;
        }
        let _ = on_event.send(AiEvent::Completed { request_id: id });
        Ok(())
    }

    #[tauri::command]
    pub fn note_ai_cancel(state: State<'_, AppState>, request_id: String) -> Result<(), AppError> {
        if let Some(c) = state
            .cancels
            .lock()
            .map_err(|_| AppError::db("cancel lock poisoned"))?
            .get(&request_id)
        {
            c.store(true, Ordering::Relaxed);
        }
        Ok(())
    }

    #[tauri::command]
    pub fn note_fim_stream(
        state: State<'_, AppState>,
        request: AiRequest,
        on_event: Channel<AiEvent>,
    ) -> Result<(), AppError> {
        note_ai_stream(state, request, on_event)
    }

    #[tauri::command]
    pub fn note_fim_cancel(state: State<'_, AppState>, request_id: String) -> Result<(), AppError> {
        note_ai_cancel(state, request_id)
    }
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let state =
                app_state(app.handle()).map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::note_list,
            commands::note_get,
            commands::note_create,
            commands::note_update,
            commands::note_delete,
            commands::note_copy,
            commands::note_move,
            commands::note_restore,
            commands::note_purge,
            commands::note_purge_expired,
            commands::notebook_list,
            commands::notebook_create,
            commands::notebook_update,
            commands::notebook_delete,
            commands::knowledge_base_list,
            commands::knowledge_base_create,
            commands::knowledge_base_update,
            commands::knowledge_base_delete,
            commands::library_list,
            commands::library_create_folder,
            commands::library_write_file,
            commands::library_rename,
            commands::library_move_to_trash,
            commands::library_preview,
            commands::settings_get,
            commands::settings_update,
            commands::model_list,
            commands::model_upsert,
            commands::model_delete,
            commands::note_ai_stream,
            commands::note_ai_cancel,
            commands::note_fim_stream,
            commands::note_fim_cancel
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tiny Note");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_parent_paths() {
        let root = std::env::temp_dir();
        assert!(commands::safe_path(&root, "../escape").is_err());
    }
    #[test]
    fn rejects_absolute_paths() {
        let root = std::env::temp_dir();
        assert!(commands::safe_path(&root, "/escape").is_err());
        assert!(commands::safe_path(&root, "C:\\escape").is_err());
        assert!(commands::safe_path(&root, "C:escape").is_err());
        assert!(commands::safe_path(&root, "\\\\server\\share").is_err());
    }
    #[test]
    fn migration_seeds_uncategorized_notebook() {
        let c = Connection::open_in_memory().unwrap();
        init_database(&c).unwrap();
        let n: i64 = c
            .query_row("SELECT COUNT(*) FROM notebooks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
    }
}
