use crate::{AppError, AppState};
use chrono::{DateTime, Duration, Local, NaiveDate, NaiveDateTime, TimeZone, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};
use tauri_plugin_notification::NotificationExt;
use uuid::Uuid;

const OWNER_EVENT: &str = "calendarEvent";
const OWNER_TODO: &str = "todo";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderDto {
    pub id: String,
    pub owner_type: String,
    pub owner_id: String,
    pub mode: String,
    pub trigger_at: Option<String>,
    pub offset_minutes: Option<i64>,
    pub interval_minutes: Option<i64>,
    pub next_fire_at: Option<String>,
    pub enabled: bool,
    pub last_fired_at: Option<String>,
    pub stopped_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderInput {
    pub mode: String,
    pub trigger_at: Option<String>,
    pub offset_minutes: Option<i64>,
    pub interval_minutes: Option<i64>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEventDto {
    pub id: String,
    pub title: String,
    pub start_date: String,
    pub end_date: String,
    pub start_time: String,
    pub end_time: String,
    pub all_day: bool,
    pub description: String,
    pub color: String,
    pub priority: String,
    pub completed: bool,
    pub reminder: Option<ReminderDto>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEventInput {
    pub title: String,
    pub start_date: String,
    pub end_date: String,
    #[serde(default)]
    pub start_time: String,
    #[serde(default)]
    pub end_time: String,
    #[serde(default)]
    pub all_day: bool,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_event_color")]
    pub color: String,
    #[serde(default = "default_event_priority")]
    pub priority: String,
    #[serde(default)]
    pub completed: bool,
    #[serde(default)]
    pub reminder: Option<ReminderInput>,
}

fn default_event_color() -> String {
    "#1E88E5".into()
}

fn default_event_priority() -> String {
    "important".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoDto {
    pub id: String,
    pub title: String,
    pub notes: String,
    pub due_at: Option<String>,
    pub priority: String,
    pub completed_at: Option<String>,
    pub reminder: Option<ReminderDto>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoInput {
    pub title: String,
    #[serde(default)]
    pub notes: String,
    pub due_at: Option<String>,
    #[serde(default = "default_todo_priority")]
    pub priority: String,
    #[serde(default)]
    pub reminder: Option<ReminderInput>,
}

fn default_todo_priority() -> String {
    "none".into()
}

#[derive(Debug, Clone)]
pub struct DueReminder {
    pub title: String,
    pub body: String,
}

pub type PlannerBackupData = (Vec<CalendarEventDto>, Vec<TodoDto>, Vec<ReminderDto>);

pub fn init_schema(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS calendar_events (
           id TEXT PRIMARY KEY,
           title TEXT NOT NULL,
           start_date TEXT NOT NULL,
           end_date TEXT NOT NULL,
           start_time TEXT NOT NULL DEFAULT '',
           end_time TEXT NOT NULL DEFAULT '',
           all_day INTEGER NOT NULL DEFAULT 0,
           description TEXT NOT NULL DEFAULT '',
           color TEXT NOT NULL DEFAULT '#1E88E5',
           priority TEXT NOT NULL DEFAULT 'important' CHECK(priority IN ('urgent','important','minor')),
           completed INTEGER NOT NULL DEFAULT 0,
           created_at TEXT NOT NULL,
           updated_at TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_calendar_events_range ON calendar_events(start_date,end_date);
         CREATE TABLE IF NOT EXISTS todos (
           id TEXT PRIMARY KEY,
           title TEXT NOT NULL,
           notes TEXT NOT NULL DEFAULT '',
           due_at TEXT,
           priority TEXT NOT NULL DEFAULT 'none' CHECK(priority IN ('none','low','medium','high')),
           completed_at TEXT,
           created_at TEXT NOT NULL,
           updated_at TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_todos_due ON todos(completed_at,due_at);
         CREATE TABLE IF NOT EXISTS reminders (
           id TEXT PRIMARY KEY,
           owner_type TEXT NOT NULL CHECK(owner_type IN ('calendarEvent','todo')),
           owner_id TEXT NOT NULL,
           mode TEXT NOT NULL CHECK(mode IN ('at','before','interval')),
           trigger_at TEXT,
           offset_minutes INTEGER,
           interval_minutes INTEGER,
           next_fire_at TEXT,
           enabled INTEGER NOT NULL DEFAULT 1,
           last_fired_at TEXT,
           stopped_at TEXT,
           created_at TEXT NOT NULL,
           updated_at TEXT NOT NULL,
           UNIQUE(owner_type,owner_id)
         );
         CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(enabled,next_fire_at);",
    )
    .map_err(AppError::db)
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn validate_date(value: &str, field: &str) -> Result<(), AppError> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map(|_| ())
        .map_err(|_| AppError::invalid("invalid_date", &format!("{field} 日期格式无效")))
}

fn validate_event(input: &CalendarEventInput) -> Result<(), AppError> {
    if input.title.trim().is_empty() {
        return Err(AppError::invalid(
            "event_title_required",
            "日程标题不能为空",
        ));
    }
    validate_date(&input.start_date, "开始")?;
    validate_date(&input.end_date, "结束")?;
    if input.end_date < input.start_date {
        return Err(AppError::invalid(
            "event_range_invalid",
            "结束日期不能早于开始日期",
        ));
    }
    if !matches!(input.priority.as_str(), "urgent" | "important" | "minor") {
        return Err(AppError::invalid(
            "event_priority_invalid",
            "日程优先级无效",
        ));
    }
    Ok(())
}

fn validate_todo(input: &TodoInput) -> Result<(), AppError> {
    if input.title.trim().is_empty() {
        return Err(AppError::invalid("todo_title_required", "待办标题不能为空"));
    }
    if !matches!(input.priority.as_str(), "none" | "low" | "medium" | "high") {
        return Err(AppError::invalid("todo_priority_invalid", "待办优先级无效"));
    }
    if let Some(due_at) = &input.due_at {
        DateTime::parse_from_rfc3339(due_at)
            .map_err(|_| AppError::invalid("todo_due_invalid", "待办截止时间无效"))?;
    }
    Ok(())
}

fn event_anchor(input: &CalendarEventInput) -> Result<Option<DateTime<Utc>>, AppError> {
    if input.all_day || input.start_time.trim().is_empty() {
        return Ok(None);
    }
    let naive = NaiveDateTime::parse_from_str(
        &format!("{} {}", input.start_date, input.start_time),
        "%Y-%m-%d %H:%M",
    )
    .map_err(|_| AppError::invalid("event_time_invalid", "日程开始时间无效"))?;
    let local = Local
        .from_local_datetime(&naive)
        .single()
        .ok_or_else(|| AppError::invalid("event_time_invalid", "日程开始时间无效"))?;
    Ok(Some(local.with_timezone(&Utc)))
}

fn todo_anchor(input: &TodoInput) -> Result<Option<DateTime<Utc>>, AppError> {
    input
        .due_at
        .as_deref()
        .map(|value| {
            DateTime::parse_from_rfc3339(value)
                .map(|value| value.with_timezone(&Utc))
                .map_err(|_| AppError::invalid("todo_due_invalid", "待办截止时间无效"))
        })
        .transpose()
}

fn reminder_next_fire(
    input: &ReminderInput,
    anchor: Option<DateTime<Utc>>,
) -> Result<Option<String>, AppError> {
    if !input.enabled {
        return Ok(None);
    }
    let next = match input.mode.as_str() {
        "at" => DateTime::parse_from_rfc3339(
            input
                .trigger_at
                .as_deref()
                .ok_or_else(|| AppError::invalid("reminder_time_required", "请选择提醒时间"))?,
        )
        .map_err(|_| AppError::invalid("reminder_time_invalid", "提醒时间无效"))?
        .with_timezone(&Utc),
        "before" => {
            let minutes = input
                .offset_minutes
                .filter(|value| *value > 0)
                .ok_or_else(|| {
                    AppError::invalid("reminder_offset_invalid", "提前分钟数必须大于 0")
                })?;
            anchor.ok_or_else(|| {
                AppError::invalid(
                    "reminder_anchor_required",
                    "提前提醒需要具体的开始或截止时间",
                )
            })? - Duration::minutes(minutes)
        }
        "interval" => {
            input
                .interval_minutes
                .filter(|value| *value > 0)
                .ok_or_else(|| {
                    AppError::invalid("reminder_interval_invalid", "提醒间隔必须大于 0")
                })?;
            match input.trigger_at.as_deref() {
                Some(value) if !value.is_empty() => DateTime::parse_from_rfc3339(value)
                    .map_err(|_| AppError::invalid("reminder_time_invalid", "首次提醒时间无效"))?
                    .with_timezone(&Utc),
                _ => Utc::now() + Duration::minutes(input.interval_minutes.unwrap_or(1)),
            }
        }
        _ => return Err(AppError::invalid("reminder_mode_invalid", "提醒方式无效")),
    };
    Ok(Some(next.to_rfc3339()))
}

fn reminder_from_row(row: &Row<'_>) -> rusqlite::Result<ReminderDto> {
    Ok(ReminderDto {
        id: row.get(0)?,
        owner_type: row.get(1)?,
        owner_id: row.get(2)?,
        mode: row.get(3)?,
        trigger_at: row.get(4)?,
        offset_minutes: row.get(5)?,
        interval_minutes: row.get(6)?,
        next_fire_at: row.get(7)?,
        enabled: row.get::<_, i64>(8)? != 0,
        last_fired_at: row.get(9)?,
        stopped_at: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn get_reminder(
    conn: &Connection,
    owner_type: &str,
    owner_id: &str,
) -> Result<Option<ReminderDto>, AppError> {
    conn.query_row(
        "SELECT id,owner_type,owner_id,mode,trigger_at,offset_minutes,interval_minutes,next_fire_at,enabled,last_fired_at,stopped_at,created_at,updated_at FROM reminders WHERE owner_type=?1 AND owner_id=?2",
        params![owner_type, owner_id],
        reminder_from_row,
    )
    .optional()
    .map_err(AppError::db)
}

fn replace_reminder(
    conn: &Connection,
    owner_type: &str,
    owner_id: &str,
    input: Option<&ReminderInput>,
    anchor: Option<DateTime<Utc>>,
) -> Result<(), AppError> {
    let Some(input) = input else {
        conn.execute(
            "DELETE FROM reminders WHERE owner_type=?1 AND owner_id=?2",
            params![owner_type, owner_id],
        )
        .map_err(AppError::db)?;
        return Ok(());
    };
    let next_fire_at = reminder_next_fire(input, anchor)?;
    let timestamp = now();
    let existing_id = conn
        .query_row(
            "SELECT id FROM reminders WHERE owner_type=?1 AND owner_id=?2",
            params![owner_type, owner_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(AppError::db)?;
    let id = existing_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    conn.execute(
        "INSERT INTO reminders(id,owner_type,owner_id,mode,trigger_at,offset_minutes,interval_minutes,next_fire_at,enabled,last_fired_at,stopped_at,created_at,updated_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,NULL,NULL,?10,?10)
         ON CONFLICT(owner_type,owner_id) DO UPDATE SET mode=excluded.mode,trigger_at=excluded.trigger_at,offset_minutes=excluded.offset_minutes,interval_minutes=excluded.interval_minutes,next_fire_at=excluded.next_fire_at,enabled=excluded.enabled,last_fired_at=NULL,stopped_at=NULL,updated_at=excluded.updated_at",
        params![id, owner_type, owner_id, input.mode, input.trigger_at, input.offset_minutes, input.interval_minutes, next_fire_at, input.enabled as i64, timestamp],
    )
    .map_err(AppError::db)?;
    Ok(())
}

fn event_from_row(conn: &Connection, row: &Row<'_>) -> Result<CalendarEventDto, AppError> {
    let id: String = row.get(0).map_err(AppError::db)?;
    Ok(CalendarEventDto {
        reminder: get_reminder(conn, OWNER_EVENT, &id)?,
        id,
        title: row.get(1).map_err(AppError::db)?,
        start_date: row.get(2).map_err(AppError::db)?,
        end_date: row.get(3).map_err(AppError::db)?,
        start_time: row.get(4).map_err(AppError::db)?,
        end_time: row.get(5).map_err(AppError::db)?,
        all_day: row.get::<_, i64>(6).map_err(AppError::db)? != 0,
        description: row.get(7).map_err(AppError::db)?,
        color: row.get(8).map_err(AppError::db)?,
        priority: row.get(9).map_err(AppError::db)?,
        completed: row.get::<_, i64>(10).map_err(AppError::db)? != 0,
        created_at: row.get(11).map_err(AppError::db)?,
        updated_at: row.get(12).map_err(AppError::db)?,
    })
}

fn get_event(conn: &Connection, id: &str) -> Result<Option<CalendarEventDto>, AppError> {
    let mut statement = conn
        .prepare("SELECT id,title,start_date,end_date,start_time,end_time,all_day,description,color,priority,completed,created_at,updated_at FROM calendar_events WHERE id=?1")
        .map_err(AppError::db)?;
    let mut rows = statement.query(params![id]).map_err(AppError::db)?;
    rows.next()
        .map_err(AppError::db)?
        .map(|row| event_from_row(conn, row))
        .transpose()
}

fn todo_from_row(conn: &Connection, row: &Row<'_>) -> Result<TodoDto, AppError> {
    let id: String = row.get(0).map_err(AppError::db)?;
    Ok(TodoDto {
        reminder: get_reminder(conn, OWNER_TODO, &id)?,
        id,
        title: row.get(1).map_err(AppError::db)?,
        notes: row.get(2).map_err(AppError::db)?,
        due_at: row.get(3).map_err(AppError::db)?,
        priority: row.get(4).map_err(AppError::db)?,
        completed_at: row.get(5).map_err(AppError::db)?,
        created_at: row.get(6).map_err(AppError::db)?,
        updated_at: row.get(7).map_err(AppError::db)?,
    })
}

fn get_todo(conn: &Connection, id: &str) -> Result<Option<TodoDto>, AppError> {
    let mut statement = conn
        .prepare("SELECT id,title,notes,due_at,priority,completed_at,created_at,updated_at FROM todos WHERE id=?1")
        .map_err(AppError::db)?;
    let mut rows = statement.query(params![id]).map_err(AppError::db)?;
    rows.next()
        .map_err(AppError::db)?
        .map(|row| todo_from_row(conn, row))
        .transpose()
}

#[tauri::command]
pub fn calendar_event_list(
    state: State<'_, AppState>,
    start: Option<String>,
    end: Option<String>,
) -> Result<Vec<CalendarEventDto>, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    let sql = if start.is_some() && end.is_some() {
        "SELECT id,title,start_date,end_date,start_time,end_time,all_day,description,color,priority,completed,created_at,updated_at FROM calendar_events WHERE start_date<=?2 AND end_date>=?1 ORDER BY start_date,start_time"
    } else {
        "SELECT id,title,start_date,end_date,start_time,end_time,all_day,description,color,priority,completed,created_at,updated_at FROM calendar_events ORDER BY start_date,start_time"
    };
    let mut statement = conn.prepare(sql).map_err(AppError::db)?;
    let mut rows = if start.is_some() && end.is_some() {
        statement.query(params![start, end]).map_err(AppError::db)?
    } else {
        statement.query([]).map_err(AppError::db)?
    };
    let mut items = Vec::new();
    while let Some(row) = rows.next().map_err(AppError::db)? {
        items.push(event_from_row(&conn, row)?);
    }
    Ok(items)
}

#[tauri::command]
pub fn calendar_event_get(
    state: State<'_, AppState>,
    id: String,
) -> Result<CalendarEventDto, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    get_event(&conn, &id)?
        .ok_or_else(|| AppError::not_found("calendar_event_not_found", "日程不存在"))
}

#[tauri::command]
pub fn calendar_event_create(
    state: State<'_, AppState>,
    input: CalendarEventInput,
) -> Result<CalendarEventDto, AppError> {
    validate_event(&input)?;
    let anchor = event_anchor(&input)?;
    let id = Uuid::new_v4().to_string();
    let timestamp = now();
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    conn.execute(
        "INSERT INTO calendar_events(id,title,start_date,end_date,start_time,end_time,all_day,description,color,priority,completed,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12)",
        params![id, input.title.trim(), input.start_date, input.end_date, input.start_time, input.end_time, input.all_day as i64, input.description, input.color, input.priority, input.completed as i64, timestamp],
    ).map_err(AppError::db)?;
    if let Err(error) = replace_reminder(&conn, OWNER_EVENT, &id, input.reminder.as_ref(), anchor) {
        let _ = conn.execute("DELETE FROM calendar_events WHERE id=?1", params![id]);
        return Err(error);
    }
    get_event(&conn, &id)?
        .ok_or_else(|| AppError::not_found("calendar_event_not_found", "日程不存在"))
}

#[tauri::command]
pub fn calendar_event_update(
    state: State<'_, AppState>,
    id: String,
    input: CalendarEventInput,
) -> Result<CalendarEventDto, AppError> {
    validate_event(&input)?;
    let anchor = event_anchor(&input)?;
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    let changed = conn.execute(
        "UPDATE calendar_events SET title=?2,start_date=?3,end_date=?4,start_time=?5,end_time=?6,all_day=?7,description=?8,color=?9,priority=?10,completed=?11,updated_at=?12 WHERE id=?1",
        params![id, input.title.trim(), input.start_date, input.end_date, input.start_time, input.end_time, input.all_day as i64, input.description, input.color, input.priority, input.completed as i64, now()],
    ).map_err(AppError::db)?;
    if changed == 0 {
        return Err(AppError::not_found(
            "calendar_event_not_found",
            "日程不存在",
        ));
    }
    replace_reminder(&conn, OWNER_EVENT, &id, input.reminder.as_ref(), anchor)?;
    if input.completed {
        stop_reminder_conn(&conn, OWNER_EVENT, &id)?;
    }
    get_event(&conn, &id)?
        .ok_or_else(|| AppError::not_found("calendar_event_not_found", "日程不存在"))
}

#[tauri::command]
pub fn calendar_event_delete(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    conn.execute(
        "DELETE FROM reminders WHERE owner_type=?1 AND owner_id=?2",
        params![OWNER_EVENT, id],
    )
    .map_err(AppError::db)?;
    conn.execute("DELETE FROM calendar_events WHERE id=?1", params![id])
        .map_err(AppError::db)?;
    Ok(())
}

#[tauri::command]
pub fn todo_list(state: State<'_, AppState>) -> Result<Vec<TodoDto>, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    let mut statement = conn.prepare("SELECT id,title,notes,due_at,priority,completed_at,created_at,updated_at FROM todos ORDER BY completed_at IS NOT NULL,due_at IS NULL,due_at,created_at DESC").map_err(AppError::db)?;
    let mut rows = statement.query([]).map_err(AppError::db)?;
    let mut items = Vec::new();
    while let Some(row) = rows.next().map_err(AppError::db)? {
        items.push(todo_from_row(&conn, row)?);
    }
    Ok(items)
}

#[tauri::command]
pub fn todo_get(state: State<'_, AppState>, id: String) -> Result<TodoDto, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    get_todo(&conn, &id)?.ok_or_else(|| AppError::not_found("todo_not_found", "待办不存在"))
}

#[tauri::command]
pub fn todo_create(state: State<'_, AppState>, input: TodoInput) -> Result<TodoDto, AppError> {
    validate_todo(&input)?;
    let anchor = todo_anchor(&input)?;
    let id = Uuid::new_v4().to_string();
    let timestamp = now();
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    conn.execute(
        "INSERT INTO todos(id,title,notes,due_at,priority,completed_at,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,NULL,?6,?6)",
        params![id, input.title.trim(), input.notes, input.due_at, input.priority, timestamp],
    ).map_err(AppError::db)?;
    if let Err(error) = replace_reminder(&conn, OWNER_TODO, &id, input.reminder.as_ref(), anchor) {
        let _ = conn.execute("DELETE FROM todos WHERE id=?1", params![id]);
        return Err(error);
    }
    get_todo(&conn, &id)?.ok_or_else(|| AppError::not_found("todo_not_found", "待办不存在"))
}

#[tauri::command]
pub fn todo_update(
    state: State<'_, AppState>,
    id: String,
    input: TodoInput,
) -> Result<TodoDto, AppError> {
    validate_todo(&input)?;
    let anchor = todo_anchor(&input)?;
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    let changed = conn
        .execute(
            "UPDATE todos SET title=?2,notes=?3,due_at=?4,priority=?5,updated_at=?6 WHERE id=?1",
            params![
                id,
                input.title.trim(),
                input.notes,
                input.due_at,
                input.priority,
                now()
            ],
        )
        .map_err(AppError::db)?;
    if changed == 0 {
        return Err(AppError::not_found("todo_not_found", "待办不存在"));
    }
    replace_reminder(&conn, OWNER_TODO, &id, input.reminder.as_ref(), anchor)?;
    get_todo(&conn, &id)?.ok_or_else(|| AppError::not_found("todo_not_found", "待办不存在"))
}

#[tauri::command]
pub fn todo_delete(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    conn.execute(
        "DELETE FROM reminders WHERE owner_type=?1 AND owner_id=?2",
        params![OWNER_TODO, id],
    )
    .map_err(AppError::db)?;
    conn.execute("DELETE FROM todos WHERE id=?1", params![id])
        .map_err(AppError::db)?;
    Ok(())
}

#[tauri::command]
pub fn todo_set_completed(
    state: State<'_, AppState>,
    id: String,
    completed: bool,
) -> Result<TodoDto, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    let completed_at = completed.then(now);
    let changed = conn
        .execute(
            "UPDATE todos SET completed_at=?2,updated_at=?3 WHERE id=?1",
            params![id, completed_at, now()],
        )
        .map_err(AppError::db)?;
    if changed == 0 {
        return Err(AppError::not_found("todo_not_found", "待办不存在"));
    }
    if completed {
        stop_reminder_conn(&conn, OWNER_TODO, &id)?;
    }
    get_todo(&conn, &id)?.ok_or_else(|| AppError::not_found("todo_not_found", "待办不存在"))
}

fn stop_reminder_conn(conn: &Connection, owner_type: &str, owner_id: &str) -> Result<(), AppError> {
    let timestamp = now();
    conn.execute(
        "UPDATE reminders SET enabled=0,next_fire_at=NULL,stopped_at=?3,updated_at=?3 WHERE owner_type=?1 AND owner_id=?2",
        params![owner_type, owner_id, timestamp],
    ).map_err(AppError::db)?;
    Ok(())
}

#[tauri::command]
pub fn reminder_stop(
    state: State<'_, AppState>,
    owner_type: String,
    owner_id: String,
) -> Result<(), AppError> {
    if !matches!(owner_type.as_str(), OWNER_EVENT | OWNER_TODO) {
        return Err(AppError::invalid("reminder_owner_invalid", "提醒对象无效"));
    }
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    stop_reminder_conn(&conn, &owner_type, &owner_id)
}

pub fn take_due_reminders(
    conn: &Connection,
    fired_at: DateTime<Utc>,
) -> Result<Vec<DueReminder>, AppError> {
    let mut statement = conn.prepare(
        "SELECT id,owner_type,owner_id,mode,interval_minutes FROM reminders WHERE enabled=1 AND next_fire_at IS NOT NULL AND next_fire_at<=?1 ORDER BY next_fire_at LIMIT 64",
    ).map_err(AppError::db)?;
    let rows = statement
        .query_map(params![fired_at.to_rfc3339()], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<i64>>(4)?,
            ))
        })
        .map_err(AppError::db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::db)?;
    drop(statement);
    let mut due = Vec::new();
    for (id, owner_type, owner_id, mode, interval) in rows {
        let owner = if owner_type == OWNER_EVENT {
            conn.query_row(
                "SELECT title,completed FROM calendar_events WHERE id=?1",
                params![owner_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? != 0)),
            )
            .optional()
            .map_err(AppError::db)?
        } else {
            conn.query_row(
                "SELECT title,completed_at IS NOT NULL FROM todos WHERE id=?1",
                params![owner_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? != 0)),
            )
            .optional()
            .map_err(AppError::db)?
        };
        let Some((title, completed)) = owner else {
            conn.execute(
                "UPDATE reminders SET enabled=0,next_fire_at=NULL,updated_at=?2 WHERE id=?1",
                params![id, fired_at.to_rfc3339()],
            )
            .map_err(AppError::db)?;
            continue;
        };
        if completed {
            conn.execute("UPDATE reminders SET enabled=0,next_fire_at=NULL,stopped_at=?2,updated_at=?2 WHERE id=?1", params![id, fired_at.to_rfc3339()]).map_err(AppError::db)?;
            continue;
        }
        let next = if mode == "interval" {
            Some((fired_at + Duration::minutes(interval.unwrap_or(1).max(1))).to_rfc3339())
        } else {
            None
        };
        conn.execute(
            "UPDATE reminders SET enabled=?2,next_fire_at=?3,last_fired_at=?4,updated_at=?4 WHERE id=?1",
            params![id, (next.is_some()) as i64, next, fired_at.to_rfc3339()],
        ).map_err(AppError::db)?;
        due.push(DueReminder {
            body: if mode == "interval" {
                "循环提醒：完成或手动停止后将不再提醒".into()
            } else {
                "该事项已到提醒时间".into()
            },
            title,
        });
    }
    Ok(due)
}

pub fn start_reminder_scheduler(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(15));
        let due = {
            let state = app.state::<AppState>();
            let result = match state.db.lock() {
                Ok(conn) => take_due_reminders(&conn, Utc::now()).unwrap_or_default(),
                Err(_) => Vec::new(),
            };
            result
        };
        for reminder in due {
            let _ = app
                .notification()
                .builder()
                .title(reminder.title)
                .body(reminder.body)
                .show();
        }
    });
}

pub fn export_data(conn: &Connection) -> Result<PlannerBackupData, AppError> {
    let mut event_statement = conn.prepare("SELECT id,title,start_date,end_date,start_time,end_time,all_day,description,color,priority,completed,created_at,updated_at FROM calendar_events ORDER BY created_at").map_err(AppError::db)?;
    let mut event_rows = event_statement.query([]).map_err(AppError::db)?;
    let mut events = Vec::new();
    while let Some(row) = event_rows.next().map_err(AppError::db)? {
        events.push(event_from_row(conn, row)?);
    }
    drop(event_rows);
    drop(event_statement);

    let mut todo_statement = conn.prepare("SELECT id,title,notes,due_at,priority,completed_at,created_at,updated_at FROM todos ORDER BY created_at").map_err(AppError::db)?;
    let mut todo_rows = todo_statement.query([]).map_err(AppError::db)?;
    let mut todos = Vec::new();
    while let Some(row) = todo_rows.next().map_err(AppError::db)? {
        todos.push(todo_from_row(conn, row)?);
    }
    drop(todo_rows);
    drop(todo_statement);

    let reminders = conn.prepare("SELECT id,owner_type,owner_id,mode,trigger_at,offset_minutes,interval_minutes,next_fire_at,enabled,last_fired_at,stopped_at,created_at,updated_at FROM reminders ORDER BY created_at")
        .map_err(AppError::db)?
        .query_map([], reminder_from_row)
        .map_err(AppError::db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::db)?;
    for event in &mut events {
        event.reminder = None;
    }
    for todo in &mut todos {
        todo.reminder = None;
    }
    Ok((events, todos, reminders))
}

pub fn import_data(
    conn: &Connection,
    events: &[CalendarEventDto],
    todos: &[TodoDto],
    reminders: &[ReminderDto],
) -> Result<(), AppError> {
    conn.execute("DELETE FROM reminders", [])
        .map_err(AppError::db)?;
    conn.execute("DELETE FROM calendar_events", [])
        .map_err(AppError::db)?;
    conn.execute("DELETE FROM todos", [])
        .map_err(AppError::db)?;
    for event in events {
        conn.execute("INSERT INTO calendar_events(id,title,start_date,end_date,start_time,end_time,all_day,description,color,priority,completed,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)", params![event.id,event.title,event.start_date,event.end_date,event.start_time,event.end_time,event.all_day as i64,event.description,event.color,event.priority,event.completed as i64,event.created_at,event.updated_at]).map_err(AppError::db)?;
    }
    for todo in todos {
        conn.execute("INSERT INTO todos(id,title,notes,due_at,priority,completed_at,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)", params![todo.id,todo.title,todo.notes,todo.due_at,todo.priority,todo.completed_at,todo.created_at,todo.updated_at]).map_err(AppError::db)?;
    }
    for reminder in reminders {
        let valid_owner = if reminder.owner_type == OWNER_EVENT {
            events.iter().any(|item| item.id == reminder.owner_id)
        } else if reminder.owner_type == OWNER_TODO {
            todos.iter().any(|item| item.id == reminder.owner_id)
        } else {
            false
        };
        if !valid_owner {
            return Err(AppError::invalid(
                "invalid_backup_reminder",
                "备份中的提醒引用无效",
            ));
        }
        conn.execute("INSERT INTO reminders(id,owner_type,owner_id,mode,trigger_at,offset_minutes,interval_minutes,next_fire_at,enabled,last_fired_at,stopped_at,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)", params![reminder.id,reminder.owner_type,reminder.owner_id,reminder.mode,reminder.trigger_at,reminder.offset_minutes,reminder.interval_minutes,reminder.next_fire_at,reminder.enabled as i64,reminder.last_fired_at,reminder.stopped_at,reminder.created_at,reminder.updated_at]).map_err(AppError::db)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn schema_and_reminder_rules_work() {
        let conn = db();
        let input = TodoInput {
            title: "交报告".into(),
            notes: String::new(),
            due_at: Some((Utc::now() + Duration::hours(2)).to_rfc3339()),
            priority: "high".into(),
            reminder: Some(ReminderInput {
                mode: "before".into(),
                trigger_at: None,
                offset_minutes: Some(30),
                interval_minutes: None,
                enabled: true,
            }),
        };
        let anchor = todo_anchor(&input).unwrap();
        conn.execute("INSERT INTO todos(id,title,notes,due_at,priority,created_at,updated_at) VALUES('todo-1',?1,'',?2,'high',?3,?3)", params![input.title, input.due_at, now()]).unwrap();
        replace_reminder(&conn, OWNER_TODO, "todo-1", input.reminder.as_ref(), anchor).unwrap();
        let reminder = get_reminder(&conn, OWNER_TODO, "todo-1").unwrap().unwrap();
        assert_eq!(reminder.mode, "before");
        assert!(reminder.enabled);
    }

    #[test]
    fn interval_due_reminder_advances_once() {
        let conn = db();
        let fired_at = Utc::now();
        conn.execute("INSERT INTO todos(id,title,notes,priority,created_at,updated_at) VALUES('todo-1','喝水','','none',?1,?1)", params![now()]).unwrap();
        conn.execute("INSERT INTO reminders(id,owner_type,owner_id,mode,interval_minutes,next_fire_at,enabled,created_at,updated_at) VALUES('r1','todo','todo-1','interval',5,?1,1,?1,?1)", params![(fired_at - Duration::minutes(1)).to_rfc3339()]).unwrap();
        let due = take_due_reminders(&conn, fired_at).unwrap();
        assert_eq!(due.len(), 1);
        let reminder = get_reminder(&conn, OWNER_TODO, "todo-1").unwrap().unwrap();
        assert!(reminder.next_fire_at.unwrap() > fired_at.to_rfc3339());
    }

    #[test]
    fn completing_owner_suppresses_due_reminder() {
        let conn = db();
        let fired_at = Utc::now();
        conn.execute("INSERT INTO todos(id,title,notes,priority,completed_at,created_at,updated_at) VALUES('todo-1','完成项','','none',?1,?1,?1)", params![now()]).unwrap();
        conn.execute("INSERT INTO reminders(id,owner_type,owner_id,mode,trigger_at,next_fire_at,enabled,created_at,updated_at) VALUES('r1','todo','todo-1','at',?1,?1,1,?1,?1)", params![(fired_at - Duration::minutes(1)).to_rfc3339()]).unwrap();
        assert!(take_due_reminders(&conn, fired_at).unwrap().is_empty());
        assert!(
            !get_reminder(&conn, OWNER_TODO, "todo-1")
                .unwrap()
                .unwrap()
                .enabled
        );
    }
}
