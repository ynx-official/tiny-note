use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupManifest {
    pub format: String,
    pub version: i64,
    pub created_at: String,
    pub note_count: i64,
    pub folder_count: i64,
    pub attachment_file_count: i64,
    pub includes: BackupManifestIncludes,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupManifestIncludes {
    pub database: bool,
    pub config: bool,
    pub settings: bool,
    pub attachments: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreInspection {
    pub source_path: String,
    pub archive_kind: String,
    pub can_restore: bool,
    pub summary: String,
    pub warnings: Vec<String>,
    pub manifest_present: bool,
    pub manifest: Option<BackupManifest>,
    pub items: RestoreInspectionItems,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreInspectionItems {
    pub has_database: bool,
    pub has_config: bool,
    pub has_settings: bool,
    pub has_attachments: bool,
    pub attachment_file_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreResult {
    pub source_path: String,
    pub restored_database: bool,
    pub restored_config: bool,
    pub restored_settings: bool,
    pub restored_attachment_files: i64,
    pub restored_settings_json: Option<String>,
    pub pre_restore_backup_path: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncAck {
    pub entity_type: String,
    pub client_id: String,
    pub cloud_id: String,
    pub sync_version: i64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub mode: String,
    pub device_id: String,
    pub pending_changes: i64,
    pub conflict_count: i64,
    pub last_push_cursor: i64,
    pub last_pull_cursor: i64,
    pub last_synced_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncChange {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub operation: String,
    pub payload: String,
    pub base_version: i64,
    pub device_id: String,
    pub status: String,
    pub created_at: String,
    pub synced_at: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncFolderSnapshot {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub sync_version: i64,
    pub cloud_id: Option<String>,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncNoteSnapshot {
    pub id: String,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    pub folder_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub sync_version: i64,
    pub cloud_id: Option<String>,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncAttachmentIndexItem {
    pub asset_path: String,
    pub note_id: String,
    pub file_name: String,
    pub mime_type: Option<String>,
    pub file_size: i64,
    pub sha256: Option<String>,
    pub cloud_url: Option<String>,
    pub cloud_file_id: Option<String>,
    pub upload_status: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpsertAttachmentIndexPayload {
    pub asset_path: String,
    pub note_id: String,
    pub file_name: String,
    pub mime_type: Option<String>,
    pub file_size: i64,
    pub sha256: Option<String>,
    pub cloud_url: Option<String>,
    pub cloud_file_id: Option<String>,
    pub upload_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncApplyPayload {
    pub entity_type: String,
    pub payload: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncApplyResult {
    pub applied: bool,
    #[serde(default)]
    pub skipped: bool,
    #[serde(default)]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncRewriteNoteContentPayload {
    pub client_id: String,
    pub content: String,
    pub sync_version: i64,
    pub cloud_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    pub folder_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIProfile {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    #[serde(default)]
    pub system_prompt: String,
    #[serde(default)]
    pub max_context_messages: usize,
    #[serde(default)]
    pub enable_summary: bool,
    #[serde(default)]
    pub enable_thinking: bool,
    #[serde(default)]
    pub temperature: f32,
    #[serde(default)]
    pub max_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default)]
    pub data_dir: String,
    #[serde(default)]
    pub quick_width: f64,
    #[serde(default)]
    pub quick_height: f64,
    #[serde(default)]
    pub ai_base_url: String,
    #[serde(default)]
    pub ai_api_key: String,
    #[serde(default)]
    pub ai_model: String,
    #[serde(default)]
    pub ai_profiles: Vec<AIProfile>,
    #[serde(default)]
    pub active_ai_profile_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub summary: String,
    #[serde(default)]
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub tool_calls: Option<String>,
    pub tool_call_id: Option<String>,
    pub created_at: String,
}
