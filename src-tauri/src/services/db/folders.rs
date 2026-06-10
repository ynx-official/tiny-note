use chrono::Utc;
use rusqlite::params;
use uuid::Uuid;

use super::Database;
use crate::services::models::Folder;
use serde_json::json;

impl Database {
    pub fn create_folder(&self, name: &str, parent_id: Option<&str>) -> Result<Folder, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let count: i64 = if let Some(pid) = parent_id {
            conn.query_row(
                "SELECT COUNT(*) FROM folders WHERE name = ?1 AND parent_id = ?2 AND deleted_at IS NULL",
                params![name, pid],
                |row| row.get(0),
            ).map_err(|e| e.to_string())?
        } else {
            conn.query_row(
                "SELECT COUNT(*) FROM folders WHERE name = ?1 AND parent_id IS NULL AND deleted_at IS NULL",
                params![name],
                |row| row.get(0),
            ).map_err(|e| e.to_string())?
        };
        if count > 0 {
            return Err("同级下已存在同名文件夹".to_string());
        }

        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let device_id = Self::ensure_device_id(&conn)?;

        conn.execute(
            "INSERT INTO folders (id, name, parent_id, created_at, updated_at, sync_status, sync_version, device_id)
             VALUES (?1, ?2, ?3, ?4, ?5, 'pending', 0, ?6)",
            params![id, name, parent_id, now, now, device_id],
        ).map_err(|e| e.to_string())?;

        let payload = json!({
            "id": id,
            "name": name,
            "parent_id": parent_id,
            "created_at": now,
            "updated_at": now,
        }).to_string();
        Self::record_sync_change(&conn, "folder", &id, "create", &payload, 0)?;

        Ok(Folder {
            id, name: name.to_string(), parent_id: parent_id.map(|s| s.to_string()),
            created_at: now.clone(), updated_at: now,
        })
    }

    pub fn get_folders(&self) -> Result<Vec<Folder>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare("SELECT id, name, parent_id, created_at, updated_at FROM folders WHERE deleted_at IS NULL ORDER BY name").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok(Folder {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_id: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut folders = Vec::new();
        for row in rows { folders.push(row.map_err(|e| e.to_string())?); }
        Ok(folders)
    }

    pub fn update_folder(&self, id: &str, name: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        let device_id = Self::ensure_device_id(&conn)?;
        conn.execute(
            "UPDATE folders SET name = ?1, updated_at = ?2, sync_status = 'pending', device_id = ?3 WHERE id = ?4 AND deleted_at IS NULL",
            params![name, now, device_id, id],
        ).map_err(|e| e.to_string())?;

        let folder = conn.query_row(
            "SELECT id, name, parent_id, created_at, updated_at FROM folders WHERE id = ?1 AND deleted_at IS NULL",
            params![id],
            |row| {
                Ok(Folder {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    parent_id: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            },
        ).map_err(|e| format!("文件夹不存在: {}", e))?;
        let payload = json!({
            "id": folder.id,
            "name": folder.name,
            "parent_id": folder.parent_id,
            "updated_at": folder.updated_at,
        }).to_string();
        Self::record_sync_change(&conn, "folder", id, "update", &payload, 0)?;
        Ok(())
    }

    pub fn delete_folder(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        let device_id = Self::ensure_device_id(&conn)?;

        let moved_note_payloads = {
            let mut stmt = conn.prepare(
                "SELECT id, title, content, tags, created_at FROM notes WHERE folder_id = ?1 AND deleted_at IS NULL"
            ).map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params![id], |row| {
                let note_id: String = row.get(0)?;
                let title: String = row.get(1)?;
                let content: String = row.get(2)?;
                let tags_str: String = row.get(3)?;
                let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
                let created_at: String = row.get(4)?;
                Ok((note_id.clone(), json!({
                    "id": note_id,
                    "title": title,
                    "content": content,
                    "tags": tags,
                    "folder_id": null,
                    "created_at": created_at,
                    "updated_at": now,
                }).to_string()))
            }).map_err(|e| e.to_string())?;

            let mut payloads = Vec::new();
            for row in rows {
                payloads.push(row.map_err(|e| e.to_string())?);
            }
            payloads
        };
        let moved_folder_payloads = {
            let mut stmt = conn.prepare(
                "SELECT id, name, created_at FROM folders WHERE parent_id = ?1 AND deleted_at IS NULL"
            ).map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params![id], |row| {
                let folder_id: String = row.get(0)?;
                let name: String = row.get(1)?;
                let created_at: String = row.get(2)?;
                Ok((folder_id.clone(), json!({
                    "id": folder_id,
                    "name": name,
                    "parent_id": null,
                    "created_at": created_at,
                    "updated_at": now,
                }).to_string()))
            }).map_err(|e| e.to_string())?;

            let mut payloads = Vec::new();
            for row in rows {
                payloads.push(row.map_err(|e| e.to_string())?);
            }
            payloads
        };

        conn.execute(
            "UPDATE notes SET folder_id = NULL, updated_at = ?1, sync_status = 'pending', device_id = ?2 WHERE folder_id = ?3 AND deleted_at IS NULL",
            params![now, device_id, id],
        ).map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE folders SET parent_id = NULL, updated_at = ?1, sync_status = 'pending', device_id = ?2 WHERE parent_id = ?3 AND deleted_at IS NULL",
            params![now, device_id, id],
        ).map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE folders SET deleted_at = ?1, updated_at = ?1, sync_status = 'deleted', device_id = ?2 WHERE id = ?3 AND deleted_at IS NULL",
            params![now, device_id, id],
        ).map_err(|e| e.to_string())?;

        for (note_id, payload) in moved_note_payloads {
            Self::record_sync_change(&conn, "note", &note_id, "update", &payload, 0)?;
        }
        for (folder_id, payload) in moved_folder_payloads {
            Self::record_sync_change(&conn, "folder", &folder_id, "update", &payload, 0)?;
        }
        let payload = json!({ "id": id, "deleted_at": now }).to_string();
        Self::record_sync_change(&conn, "folder", id, "delete", &payload, 0)?;
        Ok(())
    }
}
