use crate::{now, AppError, AppState};
use chrono::{Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use uuid::Uuid;

const KINDS: [&str; 2] = ["conversation_summary", "note_ai"];
const STATUSES: [&str; 8] = [
    "queued",
    "running",
    "awaiting_approval",
    "awaiting_input",
    "succeeded",
    "failed",
    "cancelled",
    "interrupted",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundTaskDto {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub status: String,
    pub payload: Value,
    pub output: String,
    pub result: Option<Value>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub conversation_id: Option<String>,
    pub target_note_id: Option<String>,
    pub resource_key: String,
    pub model_profile_id: Option<String>,
    pub agent_run_id: Option<String>,
    pub retry_of: Option<String>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueBackgroundTask {
    pub kind: String,
    pub title: String,
    #[serde(default)]
    pub payload: Value,
    #[serde(default)]
    pub conversation_id: Option<String>,
    #[serde(default)]
    pub target_note_id: Option<String>,
    #[serde(default)]
    pub model_profile_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundTaskFilter {
    #[serde(default)]
    pub statuses: Vec<String>,
    #[serde(default)]
    pub kinds: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitionBackgroundTask {
    pub id: String,
    pub status: String,
    #[serde(default)]
    pub output_delta: Option<String>,
    #[serde(default)]
    pub result: Option<Value>,
    #[serde(default)]
    pub error_code: Option<String>,
    #[serde(default)]
    pub error_message: Option<String>,
    #[serde(default)]
    pub agent_run_id: Option<String>,
}

pub fn init_schema(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS background_tasks (
           id TEXT PRIMARY KEY,
           kind TEXT NOT NULL CHECK(kind IN ('agent_run','conversation_summary','note_ai')),
           title TEXT NOT NULL,
           status TEXT NOT NULL CHECK(status IN ('queued','running','awaiting_approval','awaiting_input','succeeded','failed','cancelled','interrupted')),
           payload_json TEXT NOT NULL DEFAULT '{}',
           output TEXT NOT NULL DEFAULT '',
           result_json TEXT,
           error_code TEXT,
           error_message TEXT,
           conversation_id TEXT,
           target_note_id TEXT,
           resource_key TEXT NOT NULL,
           model_profile_id TEXT,
           agent_run_id TEXT,
           retry_of TEXT REFERENCES background_tasks(id) ON DELETE SET NULL,
           created_at TEXT NOT NULL,
           started_at TEXT,
           completed_at TEXT,
           updated_at TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_background_tasks_status_created ON background_tasks(status,created_at DESC);
         CREATE INDEX IF NOT EXISTS idx_background_tasks_resource ON background_tasks(resource_key,status);
         CREATE INDEX IF NOT EXISTS idx_background_tasks_conversation ON background_tasks(conversation_id,created_at DESC);",
    )
    .map_err(AppError::db)?;
    // The previous process cannot still own workers once a new application
    // process has opened the database. Never auto-replay potentially mutating work.
    conn.execute(
        "UPDATE background_tasks SET status='interrupted',error_code='app_restarted',error_message='应用退出时任务尚未完成，可手动重试',completed_at=?1,updated_at=?1 WHERE status IN ('running','awaiting_approval','awaiting_input')",
        params![now()],
    )
    .map_err(AppError::db)?;
    // 普通对话与 Tiny Agent 都在对话页内执行，不属于后台任务。清理
    // 早期版本产生的任务记录不会影响已经落库的对话消息或 Agent 审计。
    conn.execute(
        "DELETE FROM background_tasks WHERE kind IN ('chat_response','agent_run')",
        [],
    )
    .map_err(AppError::db)?;
    let cutoff = (Utc::now() - Duration::days(30)).to_rfc3339();
    delete_finished_tasks(conn, Some(&cutoff))?;
    Ok(())
}

fn delete_finished_tasks(
    conn: &Connection,
    completed_before: Option<&str>,
) -> Result<u64, AppError> {
    let removed = if let Some(cutoff) = completed_before {
        conn.execute(
            "DELETE FROM background_tasks WHERE status IN ('succeeded','failed','cancelled','interrupted') AND completed_at < ?1",
            params![cutoff],
        )
    } else {
        conn.execute(
            "DELETE FROM background_tasks WHERE status IN ('succeeded','failed','cancelled','interrupted')",
            [],
        )
    }
    .map_err(AppError::db)?;
    Ok(removed as u64)
}

fn parse_json(value: String) -> Value {
    serde_json::from_str(&value).unwrap_or(Value::Null)
}

fn task_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<BackgroundTaskDto> {
    let payload: String = row.get(4)?;
    let result: Option<String> = row.get(6)?;
    Ok(BackgroundTaskDto {
        id: row.get(0)?,
        kind: row.get(1)?,
        title: row.get(2)?,
        status: row.get(3)?,
        payload: parse_json(payload),
        output: row.get(5)?,
        result: result.map(parse_json),
        error_code: row.get(7)?,
        error_message: row.get(8)?,
        conversation_id: row.get(9)?,
        target_note_id: row.get(10)?,
        resource_key: row.get(11)?,
        model_profile_id: row.get(12)?,
        agent_run_id: row.get(13)?,
        retry_of: row.get(14)?,
        created_at: row.get(15)?,
        started_at: row.get(16)?,
        completed_at: row.get(17)?,
        updated_at: row.get(18)?,
    })
}

const TASK_SELECT: &str = "SELECT id,kind,title,status,payload_json,output,result_json,error_code,error_message,conversation_id,target_note_id,resource_key,model_profile_id,agent_run_id,retry_of,created_at,started_at,completed_at,updated_at FROM background_tasks";

fn validate_kind(kind: &str) -> Result<(), AppError> {
    if KINDS.contains(&kind) {
        Ok(())
    } else {
        Err(AppError::invalid(
            "invalid_task_kind",
            "不支持的后台任务类型",
        ))
    }
}

fn validate_payload(value: &Value) -> Result<(), AppError> {
    match value {
        Value::Object(map) => {
            for (key, nested) in map {
                let normalized = key.to_ascii_lowercase().replace(['_', '-'], "");
                if ["apikey", "token", "password", "secret"].contains(&normalized.as_str()) {
                    return Err(AppError::invalid(
                        "task_payload_contains_secret",
                        "后台任务不能保存密钥或凭据",
                    ));
                }
                validate_payload(nested)?;
            }
        }
        Value::Array(items) => {
            for item in items {
                validate_payload(item)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn resource_key(input: &EnqueueBackgroundTask, id: &str) -> String {
    if let Some(conversation_id) = input.conversation_id.as_deref() {
        format!("conversation:{conversation_id}")
    } else if let Some(note_id) = input.target_note_id.as_deref() {
        format!("note:{note_id}")
    } else {
        format!("task:{id}")
    }
}

fn insert_task(
    conn: &Connection,
    input: &EnqueueBackgroundTask,
    retry_of: Option<&str>,
) -> Result<BackgroundTaskDto, AppError> {
    validate_kind(&input.kind)?;
    validate_payload(&input.payload)?;
    let title = input.title.trim();
    if title.is_empty() || title.chars().count() > 120 {
        return Err(AppError::invalid(
            "invalid_task_title",
            "任务标题长度必须为 1–120 个字符",
        ));
    }
    if input.kind == "conversation_summary" {
        if let Some(conversation_id) = input.conversation_id.as_deref() {
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM background_tasks WHERE kind='conversation_summary' AND conversation_id=?1 AND status IN ('queued','running','awaiting_approval','awaiting_input'))",
                    params![conversation_id],
                    |row| row.get(0),
                )
                .map_err(AppError::db)?;
            if exists {
                return Err(AppError::invalid(
                    "summary_task_already_active",
                    "当前对话已有正在处理的总结任务",
                ));
            }
        }
    }
    let id = Uuid::new_v4().to_string();
    let timestamp = now();
    let payload = serde_json::to_string(&input.payload)
        .map_err(|_| AppError::invalid("invalid_task_payload", "任务输入无法序列化"))?;
    conn.execute(
        "INSERT INTO background_tasks(id,kind,title,status,payload_json,resource_key,conversation_id,target_note_id,model_profile_id,retry_of,created_at,updated_at) VALUES(?1,?2,?3,'queued',?4,?5,?6,?7,?8,?9,?10,?10)",
        params![id,input.kind,title,payload,resource_key(input,&id),input.conversation_id,input.target_note_id,input.model_profile_id,retry_of,timestamp],
    )
    .map_err(AppError::db)?;
    load_task(conn, &id)?.ok_or_else(|| AppError::db("task insert was not readable"))
}

fn load_task(conn: &Connection, id: &str) -> Result<Option<BackgroundTaskDto>, AppError> {
    conn.query_row(
        &format!("{TASK_SELECT} WHERE id=?1"),
        params![id],
        task_from_row,
    )
    .optional()
    .map_err(AppError::db)
}

#[tauri::command]
pub fn background_task_enqueue(
    state: State<'_, AppState>,
    input: EnqueueBackgroundTask,
) -> Result<BackgroundTaskDto, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    insert_task(&conn, &input, None)
}

#[tauri::command]
pub fn background_task_list(
    state: State<'_, AppState>,
    filter: Option<BackgroundTaskFilter>,
) -> Result<Vec<BackgroundTaskDto>, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    let filter = filter.unwrap_or(BackgroundTaskFilter {
        statuses: vec![],
        kinds: vec![],
    });
    for status in &filter.statuses {
        if !STATUSES.contains(&status.as_str()) {
            return Err(AppError::invalid("invalid_task_status", "不支持的任务状态"));
        }
    }
    for kind in &filter.kinds {
        validate_kind(kind)?;
    }
    let mut statement = conn
        .prepare(&format!("{TASK_SELECT} ORDER BY created_at DESC LIMIT 500"))
        .map_err(AppError::db)?;
    let tasks = statement
        .query_map([], task_from_row)
        .map_err(AppError::db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::db)?;
    Ok(tasks
        .into_iter()
        .filter(|task| {
            (filter.statuses.is_empty() || filter.statuses.contains(&task.status))
                && (filter.kinds.is_empty() || filter.kinds.contains(&task.kind))
        })
        .collect())
}

#[tauri::command]
pub fn background_task_get(
    state: State<'_, AppState>,
    id: String,
) -> Result<BackgroundTaskDto, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    load_task(&conn, &id)?
        .ok_or_else(|| AppError::not_found("background_task_not_found", "后台任务不存在"))
}

fn transition_allowed(from: &str, to: &str) -> bool {
    matches!(
        (from, to),
        ("queued", "running")
            | ("queued", "cancelled")
            | ("running", "running")
            | ("running", "awaiting_approval")
            | ("running", "awaiting_input")
            | ("running", "succeeded")
            | ("running", "failed")
            | ("running", "cancelled")
            | ("awaiting_approval", "running")
            | ("awaiting_approval", "failed")
            | ("awaiting_approval", "cancelled")
            | ("awaiting_input", "running")
            | ("awaiting_input", "failed")
            | ("awaiting_input", "cancelled")
    )
}

#[tauri::command]
pub fn background_task_transition(
    state: State<'_, AppState>,
    input: TransitionBackgroundTask,
) -> Result<BackgroundTaskDto, AppError> {
    if !STATUSES.contains(&input.status.as_str()) {
        return Err(AppError::invalid("invalid_task_status", "不支持的任务状态"));
    }
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    let current = load_task(&conn, &input.id)?
        .ok_or_else(|| AppError::not_found("background_task_not_found", "后台任务不存在"))?;
    if !transition_allowed(&current.status, &input.status) {
        return Err(AppError::invalid(
            "invalid_task_transition",
            "后台任务状态已变化，请刷新后重试",
        ));
    }
    let timestamp = now();
    let started_at = if current.started_at.is_none() && input.status == "running" {
        Some(timestamp.clone())
    } else {
        current.started_at.clone()
    };
    let terminal = matches!(input.status.as_str(), "succeeded" | "failed" | "cancelled");
    let completed_at = terminal.then_some(timestamp.clone());
    let result_json = input
        .result
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|_| AppError::invalid("invalid_task_result", "任务结果无法序列化"))?;
    conn.execute(
        "UPDATE background_tasks SET status=?2,output=output || ?3,result_json=COALESCE(?4,result_json),error_code=?5,error_message=?6,agent_run_id=COALESCE(?7,agent_run_id),started_at=?8,completed_at=?9,updated_at=?10 WHERE id=?1",
        params![input.id,input.status,input.output_delta.unwrap_or_default(),result_json,input.error_code,input.error_message,input.agent_run_id,started_at,completed_at,timestamp],
    ).map_err(AppError::db)?;
    load_task(&conn, &input.id)?.ok_or_else(|| AppError::db("task transition was not readable"))
}

#[tauri::command]
pub fn background_task_cancel(
    state: State<'_, AppState>,
    id: String,
) -> Result<BackgroundTaskDto, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    let current = load_task(&conn, &id)?
        .ok_or_else(|| AppError::not_found("background_task_not_found", "后台任务不存在"))?;
    if !matches!(
        current.status.as_str(),
        "queued" | "running" | "awaiting_approval" | "awaiting_input"
    ) {
        return Err(AppError::invalid(
            "task_not_cancellable",
            "当前任务不能取消",
        ));
    }
    let timestamp = now();
    conn.execute(
        "UPDATE background_tasks SET status='cancelled',completed_at=?2,updated_at=?2 WHERE id=?1",
        params![id, timestamp],
    )
    .map_err(AppError::db)?;
    load_task(&conn, &id)?.ok_or_else(|| AppError::db("cancelled task was not readable"))
}

#[tauri::command]
pub fn background_task_retry(
    state: State<'_, AppState>,
    id: String,
) -> Result<BackgroundTaskDto, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    let original = load_task(&conn, &id)?
        .ok_or_else(|| AppError::not_found("background_task_not_found", "后台任务不存在"))?;
    if !matches!(
        original.status.as_str(),
        "failed" | "cancelled" | "interrupted"
    ) {
        return Err(AppError::invalid("task_not_retryable", "当前任务不能重试"));
    }
    let input = EnqueueBackgroundTask {
        kind: original.kind,
        title: original.title,
        payload: original.payload,
        conversation_id: original.conversation_id,
        target_note_id: original.target_note_id,
        model_profile_id: original.model_profile_id,
    };
    insert_task(&conn, &input, Some(&id))
}

#[tauri::command]
pub fn background_task_clear_finished(state: State<'_, AppState>) -> Result<u64, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    delete_finished_tasks(&conn, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        init_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn task_payload_rejects_secrets() {
        let conn = database();
        let input = EnqueueBackgroundTask {
            kind: "note_ai".into(),
            title: "test".into(),
            payload: serde_json::json!({"apiKey":"secret"}),
            conversation_id: None,
            target_note_id: None,
            model_profile_id: None,
        };
        assert!(
            matches!(insert_task(&conn, &input, None), Err(AppError::InvalidInput { code, .. }) if code == "task_payload_contains_secret")
        );
    }

    #[test]
    fn normal_conversations_are_not_background_task_kinds() {
        let conn = database();
        for (kind, title) in [("chat_response", "普通对话"), ("agent_run", "Tiny Agent")] {
            let input = EnqueueBackgroundTask {
                kind: kind.into(),
                title: title.into(),
                payload: serde_json::json!({"request": {}}),
                conversation_id: Some("chat-1".into()),
                target_note_id: None,
                model_profile_id: None,
            };
            assert!(
                matches!(insert_task(&conn, &input, None), Err(AppError::InvalidInput { code, .. }) if code == "invalid_task_kind")
            );
        }
    }

    #[test]
    fn startup_removes_legacy_agent_tasks() {
        let conn = database();
        conn.execute(
            "INSERT INTO background_tasks(id,kind,title,status,payload_json,resource_key,created_at,updated_at) VALUES('legacy-agent','agent_run','旧 Agent','failed','{}','conversation:chat-1',?1,?1)",
            params![now()],
        )
        .unwrap();

        init_schema(&conn).unwrap();

        assert!(load_task(&conn, "legacy-agent").unwrap().is_none());
    }

    #[test]
    fn manual_cleanup_removes_all_finished_tasks_immediately() {
        let conn = database();
        let finished = EnqueueBackgroundTask {
            kind: "note_ai".into(),
            title: "已完成".into(),
            payload: serde_json::json!({"request": {}}),
            conversation_id: None,
            target_note_id: Some("note-1".into()),
            model_profile_id: None,
        };
        let active = EnqueueBackgroundTask {
            kind: "note_ai".into(),
            title: "执行中".into(),
            payload: serde_json::json!({"request": {}}),
            conversation_id: None,
            target_note_id: Some("note-2".into()),
            model_profile_id: None,
        };
        let finished_task = insert_task(&conn, &finished, None).unwrap();
        let active_task = insert_task(&conn, &active, None).unwrap();
        conn.execute(
            "UPDATE background_tasks SET status='succeeded',completed_at=?1 WHERE id=?2",
            params![now(), finished_task.id],
        )
        .unwrap();

        assert_eq!(delete_finished_tasks(&conn, None).unwrap(), 1);
        assert!(load_task(&conn, &finished_task.id).unwrap().is_none());
        assert!(load_task(&conn, &active_task.id).unwrap().is_some());
    }

    #[test]
    fn summary_is_unique_while_active_and_retry_links_attempts() {
        let conn = database();
        let input = EnqueueBackgroundTask {
            kind: "conversation_summary".into(),
            title: "总结".into(),
            payload: serde_json::json!({"messages":[]}),
            conversation_id: Some("chat-1".into()),
            target_note_id: None,
            model_profile_id: None,
        };
        let first = insert_task(&conn, &input, None).unwrap();
        assert!(insert_task(&conn, &input, None).is_err());
        conn.execute(
            "UPDATE background_tasks SET status='failed' WHERE id=?1",
            params![first.id],
        )
        .unwrap();
        let retried = insert_task(&conn, &input, Some(&first.id)).unwrap();
        assert_eq!(retried.retry_of.as_deref(), Some(first.id.as_str()));
    }

    #[test]
    fn startup_marks_in_flight_work_interrupted() {
        let conn = database();
        let input = EnqueueBackgroundTask {
            kind: "note_ai".into(),
            title: "润色".into(),
            payload: serde_json::json!({}),
            conversation_id: None,
            target_note_id: Some("note-1".into()),
            model_profile_id: None,
        };
        let task = insert_task(&conn, &input, None).unwrap();
        conn.execute(
            "UPDATE background_tasks SET status='running' WHERE id=?1",
            params![task.id],
        )
        .unwrap();
        init_schema(&conn).unwrap();
        assert_eq!(
            load_task(&conn, &task.id).unwrap().unwrap().status,
            "interrupted"
        );
    }
}
