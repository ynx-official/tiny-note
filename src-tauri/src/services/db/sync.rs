use chrono::Utc;
use rusqlite::{params, Connection};
use uuid::Uuid;

use super::Database;
use crate::services::models::{SyncChange, SyncStatus};

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
        Ok(SyncStatus {
            mode: "local".into(),
            device_id,
            pending_changes,
            conflict_count,
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