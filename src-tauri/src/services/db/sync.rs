use chrono::Utc;
use rusqlite::{params, Connection};
use serde_json::Value;
use uuid::Uuid;

use super::Database;
use crate::services::models::{SyncAck, SyncApplyPayload, SyncApplyResult, SyncAttachmentIndexItem, SyncChange, SyncFolderSnapshot, SyncNoteSnapshot, SyncRewriteNoteContentPayload, SyncStatus, UpsertAttachmentIndexPayload};

impl Database {
    pub fn mark_attachment_index_deleted(&self, asset_paths: Vec<String>) -> Result<(), String> {
        if asset_paths.is_empty() {
            return Ok(());
        }
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        for asset_path in asset_paths {
            tx.execute(
                "UPDATE attachment_index SET upload_status = 'deleted', deleted_at = ?1, updated_at = ?1 WHERE asset_path = ?2",
                params![now, asset_path],
            ).map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn replace_note_attachment_url(&self, note_id: String, source_url: String, target_url: String) -> Result<(), String> {
        if source_url.is_empty() || target_url.is_empty() || source_url == target_url {
            return Ok(());
        }
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE notes SET content = REPLACE(content, ?1, ?2), updated_at = ?3
             WHERE id = ?4 AND deleted_at IS NULL AND content LIKE '%' || ?1 || '%'",
            params![source_url, target_url, now, note_id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn upsert_attachment_index(&self, payload: UpsertAttachmentIndexPayload) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO attachment_index (
                asset_path, note_id, file_name, mime_type, file_size, sha256, cloud_url, cloud_file_id,
                upload_status, created_at, updated_at, deleted_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10, NULL)
             ON CONFLICT(asset_path) DO UPDATE SET
                note_id = excluded.note_id,
                file_name = excluded.file_name,
                mime_type = excluded.mime_type,
                file_size = excluded.file_size,
                sha256 = excluded.sha256,
                cloud_url = excluded.cloud_url,
                cloud_file_id = excluded.cloud_file_id,
                upload_status = excluded.upload_status,
                updated_at = excluded.updated_at,
                deleted_at = NULL",
            params![
                payload.asset_path,
                payload.note_id,
                payload.file_name,
                payload.mime_type,
                payload.file_size,
                payload.sha256,
                payload.cloud_url,
                payload.cloud_file_id,
                payload.upload_status,
                now,
            ],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_attachment_index(&self) -> Result<Vec<SyncAttachmentIndexItem>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT asset_path, note_id, file_name, mime_type, file_size, sha256, cloud_url, cloud_file_id,
                    upload_status, updated_at, deleted_at
             FROM attachment_index
             WHERE deleted_at IS NULL
             ORDER BY updated_at ASC"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok(SyncAttachmentIndexItem {
                asset_path: row.get(0)?,
                note_id: row.get(1)?,
                file_name: row.get(2)?,
                mime_type: row.get(3)?,
                file_size: row.get(4)?,
                sha256: row.get(5)?,
                cloud_url: row.get(6)?,
                cloud_file_id: row.get(7)?,
                upload_status: row.get(8)?,
                updated_at: row.get(9)?,
                deleted_at: row.get(10)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut items = Vec::new();
        for row in rows {
            items.push(row.map_err(|e| e.to_string())?);
        }
        Ok(items)
    }

    pub fn get_sync_status(&self) -> Result<SyncStatus, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let device_id = Self::ensure_device_id(&conn)?;
        let pending_changes = conn.query_row(
            "SELECT COUNT(*) FROM sync_changes WHERE status IN ('pending', 'failed')",
            [],
            |row| row.get::<_, i64>(0),
        ).map_err(|e| e.to_string())?;
        let conflict_count = conn.query_row(
            "SELECT COUNT(*) FROM sync_conflicts WHERE status = 'pending'",
            [],
            |row| row.get::<_, i64>(0),
        ).map_err(|e| e.to_string())?;
        let last_synced_at = Self::get_sync_state_value(&conn, "last_synced_at")?;
        let last_push_cursor = Self::get_sync_state_value(&conn, "last_push_cursor")?
            .and_then(|value| value.parse::<i64>().ok())
            .unwrap_or(0);
        let last_pull_cursor = Self::get_sync_state_value(&conn, "last_pull_cursor")?
            .and_then(|value| value.parse::<i64>().ok())
            .unwrap_or(0);
        Ok(SyncStatus {
            mode: "local".into(),
            device_id,
            pending_changes,
            conflict_count,
            last_push_cursor,
            last_pull_cursor,
            last_synced_at,
        })
    }

    pub fn list_pending_sync_changes(&self) -> Result<Vec<SyncChange>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, entity_type, entity_id, operation, payload, base_version, device_id, status, created_at, synced_at, error
             FROM sync_changes
             WHERE status IN ('pending', 'failed')
             ORDER BY COALESCE(last_attempt_at, created_at) ASC"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok(SyncChange {
                id: row.get(0)?,
                entity_type: row.get(1)?,
                entity_id: row.get(2)?,
                operation: row.get(3)?,
                payload: row.get(4)?,
                base_version: row.get(5)?,
                device_id: row.get(6)?,
                status: row.get(7)?,
                created_at: row.get(8)?,
                synced_at: row.get(9)?,
                error: row.get(10)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut changes = Vec::new();
        for row in rows {
            changes.push(row.map_err(|e| e.to_string())?);
        }
        Ok(changes)
    }

    pub fn list_sync_folder_snapshots(&self) -> Result<Vec<SyncFolderSnapshot>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, name, parent_id, created_at, updated_at, sync_version, cloud_id, deleted_at
             FROM folders
             ORDER BY created_at ASC"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok(SyncFolderSnapshot {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_id: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                sync_version: row.get(5)?,
                cloud_id: row.get(6)?,
                deleted_at: row.get(7)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut folders = Vec::new();
        for row in rows {
            folders.push(row.map_err(|e| e.to_string())?);
        }
        Ok(folders)
    }

    pub fn list_sync_note_snapshots(&self) -> Result<Vec<SyncNoteSnapshot>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, title, content, tags, folder_id, created_at, updated_at, sync_version, cloud_id, deleted_at
             FROM notes
             ORDER BY created_at ASC"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            let tags_str: String = row.get(3)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
            Ok(SyncNoteSnapshot {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                tags,
                folder_id: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                sync_version: row.get(7)?,
                cloud_id: row.get(8)?,
                deleted_at: row.get(9)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut notes = Vec::new();
        for row in rows {
            notes.push(row.map_err(|e| e.to_string())?);
        }
        Ok(notes)
    }

    pub fn acknowledge_sync_push(&self, acknowledgements: Vec<SyncAck>, cursor: i64) -> Result<(), String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();

        for ack in acknowledgements {
            if ack.status == "conflict" {
                tx.execute(
                    "UPDATE sync_changes SET status = 'conflict', error = 'server conflict', synced_at = ?1
                     WHERE entity_type = ?2 AND entity_id = ?3 AND status IN ('pending', 'failed')",
                    params![now, ack.entity_type, ack.client_id],
                ).map_err(|e| e.to_string())?;
                continue;
            }

            let table = match ack.entity_type.as_str() {
                "note" => Some("notes"),
                "folder" => Some("folders"),
                _ => None,
            };
            if let Some(table) = table {
                tx.execute(
                    &format!("UPDATE {} SET cloud_id = ?1, sync_version = ?2, sync_status = 'synced', last_synced_at = ?3 WHERE id = ?4", table),
                    params![ack.cloud_id, ack.sync_version, now, ack.client_id],
                ).map_err(|e| e.to_string())?;
            }

            if ack.entity_type == "attachment" && ack.status != "conflict" {
                tx.execute(
                    "UPDATE attachment_index SET upload_status = 'synced', cloud_file_id = COALESCE(?1, cloud_file_id), updated_at = ?2
                     WHERE asset_path = ?3",
                    params![ack.cloud_id, now, ack.client_id],
                ).map_err(|e| e.to_string())?;
            }

            tx.execute(
                "UPDATE sync_changes SET status = 'synced', synced_at = ?1, error = NULL
                 WHERE entity_type = ?2 AND entity_id = ?3 AND status IN ('pending', 'failed')",
                params![now, ack.entity_type, ack.client_id],
            ).map_err(|e| e.to_string())?;
        }

        tx.execute(
            "INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_push_cursor', ?1)",
            params![cursor.to_string()],
        ).map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_synced_at', ?1)",
            params![now],
        ).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn mark_sync_push_failed(&self, change_ids: Vec<String>, error: String) -> Result<(), String> {
        if change_ids.is_empty() {
            return Ok(());
        }
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        for change_id in change_ids {
            tx.execute(
                "UPDATE sync_changes
                 SET status = 'failed', error = ?1, retry_count = retry_count + 1, last_attempt_at = ?2
                 WHERE id = ?3 AND status IN ('pending', 'failed')",
                params![&error, &now, change_id],
            ).map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_pull_cursor(&self, cursor: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_pull_cursor', ?1)",
            params![cursor.to_string()],
        ).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_synced_at', ?1)",
            params![now],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn rewrite_note_content_after_sync(&self, payload: SyncRewriteNoteContentPayload) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE notes SET content = ?1, sync_status = 'synced', sync_version = ?2,
             cloud_id = COALESCE(?3, cloud_id), last_synced_at = ?4
             WHERE id = ?5 AND deleted_at IS NULL",
            params![payload.content, payload.sync_version, payload.cloud_id, now, payload.client_id],
        ).map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM sync_changes WHERE entity_type = 'note' AND entity_id = ?1 AND status IN ('pending', 'failed', 'conflict')",
            params![payload.client_id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn apply_sync_payload(&self, payload: SyncApplyPayload) -> Result<SyncApplyResult, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let data: Value = serde_json::from_str(&payload.payload).map_err(|e| format!("同步内容格式错误: {}", e))?;
        match payload.entity_type.as_str() {
            "note" => Self::apply_note_payload(&conn, &data),
            "folder" => Self::apply_folder_payload(&conn, &data),
            "attachment" => Self::apply_attachment_payload(&conn, &data),
            _ => Ok(SyncApplyResult { applied: false, skipped: false, reason: None }),
        }
    }

    fn entity_has_local_changes(conn: &Connection, entity_type: &str, entity_id: &str, cloud_id: Option<&str>) -> Result<bool, String> {
        let by_id: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sync_changes WHERE entity_type = ?1 AND entity_id = ?2 AND status IN ('pending', 'failed', 'conflict')",
            params![entity_type, entity_id],
            |row| row.get(0),
        ).map_err(|e| e.to_string())?;
        if by_id > 0 {
            return Ok(true);
        }
        if let Some(cloud_id) = cloud_id {
            let table = match entity_type {
                "note" => "notes",
                "folder" => "folders",
                _ => return Ok(false),
            };
            let local_id: Option<String> = conn
                .query_row(&format!("SELECT id FROM {} WHERE cloud_id = ?1", table), params![cloud_id], |row| row.get(0))
                .ok();
            if let Some(local_id) = local_id {
                let by_cloud_id: i64 = conn.query_row(
                    "SELECT COUNT(*) FROM sync_changes WHERE entity_type = ?1 AND entity_id = ?2 AND status IN ('pending', 'failed', 'conflict')",
                    params![entity_type, local_id],
                    |row| row.get(0),
                ).map_err(|e| e.to_string())?;
                return Ok(by_cloud_id > 0);
            }
        }
        Ok(false)
    }

    fn skip_local_change_conflict(entity_type: &str, entity_id: &str) -> SyncApplyResult {
        SyncApplyResult {
            applied: false,
            skipped: true,
            reason: Some(format!("{}:{} 存在本地未同步变更，已跳过远端覆盖", entity_type, entity_id)),
        }
    }

    fn apply_note_payload(conn: &Connection, data: &Value) -> Result<SyncApplyResult, String> {
        let now = Utc::now().to_rfc3339();
        let id = value_string(data, &["clientId", "client_id", "id"])
            .ok_or_else(|| "缺少笔记本地 ID".to_string())?;
        let cloud_id = value_string(data, &["cloudId", "cloud_id"]);
        let title = value_string(data, &["title"]).unwrap_or_default();
        let content = value_string(data, &["content"]).unwrap_or_default();
        let tags = normalize_tags(data.get("tags"));
        let folder_id = value_string(data, &["folderClientId", "folder_client_id", "folder_id"]);
        let sync_version = value_i64(data, &["syncVersion", "sync_version"]).unwrap_or(0);
        let deleted_at = value_string(data, &["deletedAt", "deleted_at"]);
        let updated_at = value_string(data, &["clientUpdatedAt", "client_updated_at", "updated_at"]).unwrap_or_else(|| now.clone());
        let created_at = value_string(data, &["clientCreatedAt", "client_created_at", "created_at"]).unwrap_or_else(|| updated_at.clone());

        if Self::entity_has_local_changes(conn, "note", &id, cloud_id.as_deref())? {
            return Ok(Self::skip_local_change_conflict("note", &id));
        }

        let existing_id: Option<String> = if let Some(cloud_id) = cloud_id.as_deref() {
            conn.query_row("SELECT id FROM notes WHERE cloud_id = ?1", params![cloud_id], |row| row.get(0)).ok()
        } else {
            None
        }.or_else(|| conn.query_row("SELECT id FROM notes WHERE id = ?1", params![id], |row| row.get(0)).ok());

        if let Some(existing_id) = existing_id {
            conn.execute(
                "UPDATE notes SET title = ?1, content = ?2, tags = ?3, folder_id = ?4, updated_at = ?5,
                 sync_status = 'synced', sync_version = ?6, cloud_id = COALESCE(?7, cloud_id), deleted_at = ?8,
                 last_synced_at = ?9 WHERE id = ?10",
                params![title, content, tags, folder_id, updated_at, sync_version, cloud_id, deleted_at, now, existing_id],
            ).map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "INSERT INTO notes (id, title, content, tags, folder_id, created_at, updated_at, sync_status, sync_version, cloud_id, deleted_at, last_synced_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'synced', ?8, ?9, ?10, ?11)",
                params![id, title, content, tags, folder_id, created_at, updated_at, sync_version, cloud_id, deleted_at, now],
            ).map_err(|e| e.to_string())?;
        }
        conn.execute("DELETE FROM sync_changes WHERE entity_type = 'note' AND entity_id = ?1 AND status IN ('pending', 'failed', 'conflict')", params![id])
            .map_err(|e| e.to_string())?;
        Ok(SyncApplyResult { applied: true, skipped: false, reason: None })
    }

    fn apply_folder_payload(conn: &Connection, data: &Value) -> Result<SyncApplyResult, String> {
        let now = Utc::now().to_rfc3339();
        let id = value_string(data, &["clientId", "client_id", "id"])
            .ok_or_else(|| "缺少目录本地 ID".to_string())?;
        let cloud_id = value_string(data, &["cloudId", "cloud_id"]);
        let name = value_string(data, &["name"]).unwrap_or_else(|| "未命名目录".to_string());
        let parent_id = value_string(data, &["parentClientId", "parent_client_id", "parent_id"]);
        let sync_version = value_i64(data, &["syncVersion", "sync_version"]).unwrap_or(0);
        let deleted_at = value_string(data, &["deletedAt", "deleted_at"]);
        let updated_at = value_string(data, &["clientUpdatedAt", "client_updated_at", "updated_at"]).unwrap_or_else(|| now.clone());
        let created_at = value_string(data, &["clientCreatedAt", "client_created_at", "created_at"]).unwrap_or_else(|| updated_at.clone());

        if Self::entity_has_local_changes(conn, "folder", &id, cloud_id.as_deref())? {
            return Ok(Self::skip_local_change_conflict("folder", &id));
        }

        let existing_id: Option<String> = if let Some(cloud_id) = cloud_id.as_deref() {
            conn.query_row("SELECT id FROM folders WHERE cloud_id = ?1", params![cloud_id], |row| row.get(0)).ok()
        } else {
            None
        }.or_else(|| conn.query_row("SELECT id FROM folders WHERE id = ?1", params![id], |row| row.get(0)).ok());

        if let Some(existing_id) = existing_id {
            conn.execute(
                "UPDATE folders SET name = ?1, parent_id = ?2, updated_at = ?3, sync_status = 'synced',
                 sync_version = ?4, cloud_id = COALESCE(?5, cloud_id), deleted_at = ?6, last_synced_at = ?7 WHERE id = ?8",
                params![name, parent_id, updated_at, sync_version, cloud_id, deleted_at, now, existing_id],
            ).map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "INSERT INTO folders (id, name, parent_id, created_at, updated_at, sync_status, sync_version, cloud_id, deleted_at, last_synced_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'synced', ?6, ?7, ?8, ?9)",
                params![id, name, parent_id, created_at, updated_at, sync_version, cloud_id, deleted_at, now],
            ).map_err(|e| e.to_string())?;
        }
        conn.execute("DELETE FROM sync_changes WHERE entity_type = 'folder' AND entity_id = ?1 AND status IN ('pending', 'failed', 'conflict')", params![id])
            .map_err(|e| e.to_string())?;
        Ok(SyncApplyResult { applied: true, skipped: false, reason: None })
    }

    fn apply_attachment_payload(conn: &Connection, data: &Value) -> Result<SyncApplyResult, String> {
        let now = Utc::now().to_rfc3339();
        let asset_path = value_string(data, &["assetPath", "asset_path"])
            .or_else(|| value_string(data, &["storageKey", "storage_key"]))
            .ok_or_else(|| "缺少附件路径".to_string())?;
        let note_id = value_string(data, &["noteClientId", "note_client_id", "note_id"])
            .unwrap_or_default();
        let file_name = value_string(data, &["fileName", "file_name"])
            .unwrap_or_else(|| asset_path.rsplit('/').next().unwrap_or("attachment").to_string());
        let mime_type = value_string(data, &["mimeType", "mime_type"]);
        let file_size = value_i64(data, &["fileSize", "file_size"]).unwrap_or(0);
        let sha256 = value_string(data, &["sha256"]);
        let cloud_url = value_string(data, &["storageKey", "storage_key", "cloudUrl", "cloud_url"]);
        let cloud_file_id = value_string(data, &["fileId", "file_id", "cloudId", "cloud_id"]);
        let deleted_at = value_string(data, &["deletedAt", "deleted_at"]);
        let upload_status = if deleted_at.is_some() { "deleted" } else { "synced" };

        conn.execute(
            "INSERT INTO attachment_index (
                asset_path, note_id, file_name, mime_type, file_size, sha256, cloud_url, cloud_file_id,
                upload_status, created_at, updated_at, deleted_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10, ?11)
             ON CONFLICT(asset_path) DO UPDATE SET
                note_id = excluded.note_id,
                file_name = excluded.file_name,
                mime_type = excluded.mime_type,
                file_size = excluded.file_size,
                sha256 = excluded.sha256,
                cloud_url = excluded.cloud_url,
                cloud_file_id = excluded.cloud_file_id,
                upload_status = excluded.upload_status,
                updated_at = excluded.updated_at,
                deleted_at = excluded.deleted_at",
            params![asset_path, note_id, file_name, mime_type, file_size, sha256, cloud_url, cloud_file_id, upload_status, now, deleted_at],
        ).map_err(|e| e.to_string())?;
        Ok(SyncApplyResult { applied: true, skipped: false, reason: None })
    }

    pub(crate) fn ensure_device_id(conn: &Connection) -> Result<String, String> {
        if let Some(existing) = Self::get_sync_state_value(conn, "device_id")? {
            return Ok(existing);
        }
        let device_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT OR REPLACE INTO sync_state (key, value) VALUES ('device_id', ?1)",
            params![device_id],
        ).map_err(|e| e.to_string())?;
        Ok(device_id)
    }

    pub(crate) fn record_sync_change(
        conn: &Connection,
        entity_type: &str,
        entity_id: &str,
        operation: &str,
        payload: &str,
        base_version: i64,
    ) -> Result<(), String> {
        let now = Utc::now().to_rfc3339();
        let device_id = Self::ensure_device_id(conn)?;
        let existing: Option<(String, String, i64)> = conn.query_row(
            "SELECT id, operation, base_version FROM sync_changes
             WHERE entity_type = ?1 AND entity_id = ?2 AND status IN ('pending', 'failed')
             ORDER BY created_at ASC LIMIT 1",
            params![entity_type, entity_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).ok();

        if let Some((existing_id, existing_operation, existing_base_version)) = existing {
            if existing_operation == "create" && operation == "delete" {
                conn.execute("DELETE FROM sync_changes WHERE id = ?1", params![existing_id])
                    .map_err(|e| e.to_string())?;
                return Ok(());
            }
            let next_operation = if existing_operation == "create" && operation != "delete" {
                "create"
            } else {
                operation
            };
            let next_base_version = if existing_operation == "create" { existing_base_version } else { base_version };
            conn.execute(
                "UPDATE sync_changes
                 SET operation = ?1, payload = ?2, base_version = ?3, device_id = ?4, status = 'pending',
                     created_at = ?5, synced_at = NULL, error = NULL, last_attempt_at = NULL
                 WHERE id = ?6",
                params![next_operation, payload, next_base_version, device_id, now, existing_id],
            ).map_err(|e| e.to_string())?;
            conn.execute(
                "DELETE FROM sync_changes
                 WHERE entity_type = ?1 AND entity_id = ?2 AND status IN ('pending', 'failed') AND id <> ?3",
                params![entity_type, entity_id, existing_id],
            ).map_err(|e| e.to_string())?;
            return Ok(());
        }

        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO sync_changes (id, entity_type, entity_id, operation, payload, base_version, device_id, status, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8)",
            params![id, entity_type, entity_id, operation, payload, base_version, device_id, now],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn get_sync_state_value(conn: &Connection, key: &str) -> Result<Option<String>, String> {
        let mut stmt = conn.prepare("SELECT value FROM sync_state WHERE key = ?1").map_err(|e| e.to_string())?;
        let mut rows = stmt.query(params![key]).map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            Ok(Some(row.get(0).map_err(|e| e.to_string())?))
        } else {
            Ok(None)
        }
    }
}

fn value_string(data: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| data.get(*key))
        .and_then(|value| match value {
            Value::String(text) => Some(text.clone()),
            Value::Null => None,
            other => Some(other.to_string()),
        })
        .filter(|value| !value.is_empty())
}

fn value_i64(data: &Value, keys: &[&str]) -> Option<i64> {
    keys.iter()
        .find_map(|key| data.get(*key))
        .and_then(|value| value.as_i64().or_else(|| value.as_str().and_then(|text| text.parse::<i64>().ok())))
}

fn normalize_tags(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(text)) => text.clone(),
        Some(other) => other.to_string(),
        None => "[]".to_string(),
    }
}
