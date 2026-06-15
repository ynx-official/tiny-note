use chrono::Utc;
use rusqlite::params;
use uuid::Uuid;

use super::Database;
use crate::services::models::{Conversation, ChatMessage};

impl Database {
    pub fn create_conversation(&self, title: Option<&str>) -> Result<Conversation, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let title = title.unwrap_or("新对话");

        conn.execute(
            "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, title, now, now],
        ).map_err(|e| e.to_string())?;

        Ok(Conversation { id, title: title.to_string(), summary: String::new(), pinned: false, created_at: now.clone(), updated_at: now })
    }

    pub fn get_conversations(&self) -> Result<Vec<Conversation>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare("SELECT id, title, summary, pinned, created_at, updated_at FROM conversations ORDER BY pinned DESC, updated_at DESC").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok(Conversation {
                id: row.get(0)?,
                title: row.get(1)?,
                summary: row.get(2)?,
                pinned: row.get::<_, i32>(3)? != 0,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut convs = Vec::new();
        for row in rows { convs.push(row.map_err(|e| e.to_string())?); }
        Ok(convs)
    }

    pub fn update_conversation_title(&self, id: &str, title: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        conn.execute("UPDATE conversations SET title = ?1, updated_at = ?2 WHERE id = ?3", params![title, now, id]).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_conversation_summary(&self, id: &str, summary: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        conn.execute("UPDATE conversations SET summary = ?1, updated_at = ?2 WHERE id = ?3", params![summary, now, id]).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn toggle_conversation_pinned(&self, id: &str) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let current: i32 = conn.query_row("SELECT pinned FROM conversations WHERE id = ?1", params![id], |row| row.get(0))
            .map_err(|e| format!("对话不存在: {}", e))?;
        let new_val = if current == 0 { 1 } else { 0 };
        conn.execute("UPDATE conversations SET pinned = ?1 WHERE id = ?2", params![new_val, id]).map_err(|e| e.to_string())?;
        Ok(new_val != 0)
    }

    pub fn delete_conversation(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM messages WHERE conversation_id = ?1", params![id]).map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM note_conversations WHERE conversation_id = ?1", params![id]).map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM conversations WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_note_conversation(&self, note_id: &str) -> Result<Option<Conversation>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT c.id, c.title, c.summary, c.pinned, c.created_at, c.updated_at
             FROM note_conversations nc
             JOIN conversations c ON c.id = nc.conversation_id
             WHERE nc.note_id = ?1"
        ).map_err(|e| e.to_string())?;
        let mut rows = stmt.query(params![note_id]).map_err(|e| e.to_string())?;
        let row = match rows.next().map_err(|e| e.to_string())? {
            Some(row) => row,
            None => return Ok(None),
        };

        Ok(Some(Conversation {
            id: row.get(0).map_err(|e| e.to_string())?,
            title: row.get(1).map_err(|e| e.to_string())?,
            summary: row.get(2).map_err(|e| e.to_string())?,
            pinned: row.get::<_, i32>(3).map_err(|e| e.to_string())? != 0,
            created_at: row.get(4).map_err(|e| e.to_string())?,
            updated_at: row.get(5).map_err(|e| e.to_string())?,
        }))
    }

    pub fn get_or_create_note_conversation(&self, note_id: &str) -> Result<Conversation, String> {
        if let Some(conversation) = self.get_note_conversation(note_id)? {
            return Ok(conversation);
        }

        let conversation = self.create_conversation(Some("文章对话"))?;
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO note_conversations (note_id, conversation_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            params![note_id, conversation.id, now, now],
        ).map_err(|e| e.to_string())?;
        Ok(conversation)
    }

    pub fn clear_conversation_messages(&self, conversation_id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        conn.execute("DELETE FROM messages WHERE conversation_id = ?1", params![conversation_id]).map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE conversations SET summary = '', updated_at = ?1 WHERE id = ?2",
            params![now, conversation_id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn clear_note_conversation_messages(&self, note_id: &str) -> Result<(), String> {
        let conversation = self.get_note_conversation(note_id)?
            .ok_or_else(|| format!("文章对话不存在: {}", note_id))?;
        self.clear_conversation_messages(&conversation.id)
    }

    pub fn add_message(&self, conversation_id: &str, role: &str, content: &str, tool_calls: Option<&str>, tool_call_id: Option<&str>) -> Result<ChatMessage, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, tool_calls, tool_call_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, conversation_id, role, content, tool_calls, tool_call_id, now],
        ).map_err(|e| e.to_string())?;

        // Update conversation timestamp
        conn.execute("UPDATE conversations SET updated_at = ?1 WHERE id = ?2", params![now, conversation_id]).map_err(|e| e.to_string())?;

        Ok(ChatMessage {
            id, conversation_id: conversation_id.to_string(),
            role: role.to_string(), content: content.to_string(),
            tool_calls: tool_calls.map(|s| s.to_string()),
            tool_call_id: tool_call_id.map(|s| s.to_string()),
            created_at: now,
        })
    }

    pub fn get_messages(&self, conversation_id: &str) -> Result<Vec<ChatMessage>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, conversation_id, role, content, tool_calls, tool_call_id, created_at FROM messages WHERE conversation_id = ?1 ORDER BY created_at"
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map(params![conversation_id], |row| {
            Ok(ChatMessage {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                tool_calls: row.get(4)?,
                tool_call_id: row.get(5)?,
                created_at: row.get(6)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut msgs = Vec::new();
        for row in rows { msgs.push(row.map_err(|e| e.to_string())?); }
        Ok(msgs)
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Mutex;

    use rusqlite::Connection;

    use super::*;

    fn test_db() -> Database {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(
            "CREATE TABLE conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT '新对话',
                summary TEXT NOT NULL DEFAULT '',
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                tool_calls TEXT,
                tool_call_id TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE note_conversations (
                note_id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );"
        ).expect("create schema");

        Database {
            conn: Mutex::new(conn),
            data_dir: PathBuf::from("test-data"),
        }
    }

    #[test]
    fn get_or_create_note_conversation_reuses_existing_binding() {
        let db = test_db();

        let first = db.get_or_create_note_conversation("note-1").expect("create note conversation");
        let second = db.get_or_create_note_conversation("note-1").expect("reuse note conversation");

        assert_eq!(first.id, second.id);
        assert_eq!(db.get_conversations().expect("list conversations").len(), 1);
    }

    #[test]
    fn clear_note_conversation_messages_removes_messages_and_summary_but_keeps_binding() {
        let db = test_db();
        let conversation = db.get_or_create_note_conversation("note-1").expect("create note conversation");

        db.add_message(&conversation.id, "user", "hello", None, None).expect("insert message");
        db.update_conversation_summary(&conversation.id, "summary").expect("set summary");

        db.clear_note_conversation_messages("note-1").expect("clear note conversation messages");

        assert!(db.get_messages(&conversation.id).expect("load messages").is_empty());

        let conn = db.conn.lock().expect("lock conn");
        let summary: String = conn
            .query_row(
                "SELECT summary FROM conversations WHERE id = ?1",
                params![conversation.id],
                |row| row.get(0),
            )
            .expect("load summary");
        let binding_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_conversations WHERE note_id = ?1 AND conversation_id = ?2",
                params!["note-1", conversation.id],
                |row| row.get(0),
            )
            .expect("load binding count");

        assert_eq!(summary, "");
        assert_eq!(binding_count, 1);
    }
}
