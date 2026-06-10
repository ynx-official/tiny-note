use chrono::Utc;
use rusqlite::{params, Connection};
use uuid::Uuid;

use super::Database;
use crate::services::models::{SyncAck, SyncChange, SyncFolderSnapshot, SyncNoteSnapshot, SyncStatus};

impl Database {
    pub fn get_sync_status(&self) -> Result<SyncStatus, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let device_id = Self::ensure_device_id(&conn)?;
        let pending_changes = conn.query_row(
            "SELECT COUNT(*) FROM sync_changes WHERE status = 'pending'",
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
             WHERE status = 'pending'
             ORDER BY created_at ASC"
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
                     WHERE entity_type = ?2 AND entity_id = ?3 AND status = 'pending'",
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

            tx.execute(
                "UPDATE sync_changes SET status = 'synced', synced_at = ?1, error = NULL
                 WHERE entity_type = ?2 AND entity_id = ?3 AND status = 'pending'",
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
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let device_id = Self::ensure_device_id(conn)?;
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