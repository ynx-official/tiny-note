mod notes;
mod folders;
mod conversations;
mod config;
mod io;
mod sync;

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use rusqlite::Connection;
use uuid::Uuid;

use crate::services::models::{AppConfig, BackupManifest, BackupManifestIncludes, RestoreInspection, RestoreInspectionItems, RestoreResult};

pub struct Database {
    pub(crate) conn: Mutex<Connection>,
    pub(crate) data_dir: PathBuf,
}

impl Database {
    pub fn new() -> Self {
        let default_dir = Self::default_data_dir();
        fs::create_dir_all(&default_dir).ok();

        // Read config to get custom data dir
        let config_path = default_dir.join("config.json");
        let config: AppConfig = if config_path.exists() {
            fs::read_to_string(&config_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or(AppConfig { data_dir: String::new(), quick_width: 0.0, quick_height: 0.0, ai_base_url: String::new(), ai_api_key: String::new(), ai_model: String::new(), ai_profiles: Vec::new(), active_ai_profile_id: String::new() })
        } else {
            AppConfig { data_dir: String::new(), quick_width: 0.0, quick_height: 0.0, ai_base_url: String::new(), ai_api_key: String::new(), ai_model: String::new(), ai_profiles: Vec::new(), active_ai_profile_id: String::new() }
        };

        let data_dir = if config.data_dir.is_empty() {
            default_dir.clone()
        } else {
            PathBuf::from(&config.data_dir)
        };
        fs::create_dir_all(&data_dir).ok();

        let db_path = data_dir.join("kova.db");
        let conn = Connection::open(&db_path).expect("Failed to open database");

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL,
                note_type TEXT NOT NULL DEFAULT 'note',
                tags TEXT NOT NULL DEFAULT '[]',
                done INTEGER NOT NULL DEFAULT 0,
                due_date TEXT,
                folder_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                sync_status TEXT NOT NULL DEFAULT 'pending',
                sync_version INTEGER NOT NULL DEFAULT 0,
                cloud_id TEXT,
                deleted_at TEXT,
                last_synced_at TEXT,
                device_id TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(note_type);
            CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);

            CREATE TABLE IF NOT EXISTS folders (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                parent_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                sync_status TEXT NOT NULL DEFAULT 'pending',
                sync_version INTEGER NOT NULL DEFAULT 0,
                cloud_id TEXT,
                deleted_at TEXT,
                last_synced_at TEXT,
                device_id TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);

            CREATE TABLE IF NOT EXISTS sync_changes (
                id TEXT PRIMARY KEY,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                operation TEXT NOT NULL,
                payload TEXT NOT NULL DEFAULT '{}',
                base_version INTEGER NOT NULL DEFAULT 0,
                device_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                synced_at TEXT,
                error TEXT,
                retry_count INTEGER NOT NULL DEFAULT 0,
                last_attempt_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_sync_changes_status ON sync_changes(status, created_at);
            CREATE INDEX IF NOT EXISTS idx_sync_changes_entity ON sync_changes(entity_type, entity_id);

            CREATE TABLE IF NOT EXISTS attachment_index (
                asset_path TEXT PRIMARY KEY,
                note_id TEXT NOT NULL,
                file_name TEXT NOT NULL DEFAULT '',
                mime_type TEXT,
                file_size INTEGER NOT NULL DEFAULT 0,
                sha256 TEXT,
                cloud_url TEXT,
                cloud_file_id TEXT,
                upload_status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                deleted_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_attachment_index_note ON attachment_index(note_id);
            CREATE INDEX IF NOT EXISTS idx_attachment_index_status ON attachment_index(upload_status, updated_at);

            CREATE TABLE IF NOT EXISTS sync_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sync_conflicts (
                id TEXT PRIMARY KEY,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                local_payload TEXT NOT NULL DEFAULT '{}',
                remote_payload TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                resolved_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status ON sync_conflicts(status, created_at);

            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT '新对话',
                summary TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS note_conversations (
                note_id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_note_conversations_conversation ON note_conversations(conversation_id);

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                tool_calls TEXT,
                tool_call_id TEXT,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);"
        ).expect("Failed to create tables");

        // Migrate: add title column if missing
        let has_title = conn.prepare("SELECT title FROM notes LIMIT 0").is_ok();
        if !has_title {
            let _ = conn.execute_batch("ALTER TABLE notes ADD COLUMN title TEXT NOT NULL DEFAULT ''");
        }

        // Migrate: add folder_id column if missing
        let has_folder_id = conn.prepare("SELECT folder_id FROM notes LIMIT 0").is_ok();
        if !has_folder_id {
            let _ = conn.execute_batch("ALTER TABLE notes ADD COLUMN folder_id TEXT");
        }

        // Create folder index (after migration ensures column exists)
        let _ = conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id)");

        // Migrate: add summary column to conversations if missing
        let has_summary = conn.prepare("SELECT summary FROM conversations LIMIT 0").is_ok();
        if !has_summary {
            let _ = conn.execute_batch("ALTER TABLE conversations ADD COLUMN summary TEXT NOT NULL DEFAULT ''");
        }

        // Migrate: add pinned column to conversations if missing
        let has_pinned = conn.prepare("SELECT pinned FROM conversations LIMIT 0").is_ok();
        if !has_pinned {
            let _ = conn.execute_batch("ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
        }

        let sync_columns = [
            ("notes", "sync_status", "TEXT NOT NULL DEFAULT 'pending'"),
            ("notes", "sync_version", "INTEGER NOT NULL DEFAULT 0"),
            ("notes", "cloud_id", "TEXT"),
            ("notes", "deleted_at", "TEXT"),
            ("notes", "last_synced_at", "TEXT"),
            ("notes", "device_id", "TEXT"),
            ("folders", "sync_status", "TEXT NOT NULL DEFAULT 'pending'"),
            ("folders", "sync_version", "INTEGER NOT NULL DEFAULT 0"),
            ("folders", "cloud_id", "TEXT"),
            ("folders", "deleted_at", "TEXT"),
            ("folders", "last_synced_at", "TEXT"),
            ("folders", "device_id", "TEXT"),
        ];
        for (table, column, definition) in sync_columns {
            if conn.prepare(&format!("SELECT {} FROM {} LIMIT 0", column, table)).is_err() {
                let _ = conn.execute_batch(&format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, definition));
            }
        }
        let sync_change_columns = [
            ("retry_count", "INTEGER NOT NULL DEFAULT 0"),
            ("last_attempt_at", "TEXT"),
        ];
        for (column, definition) in sync_change_columns {
            if conn.prepare(&format!("SELECT {} FROM sync_changes LIMIT 0", column)).is_err() {
                let _ = conn.execute_batch(&format!("ALTER TABLE sync_changes ADD COLUMN {} {}", column, definition));
            }
        }
        let attachment_index_columns = [
            ("cloud_url", "TEXT"),
            ("cloud_file_id", "TEXT"),
            ("upload_status", "TEXT NOT NULL DEFAULT 'pending'"),
            ("deleted_at", "TEXT"),
        ];
        for (column, definition) in attachment_index_columns {
            if conn.prepare(&format!("SELECT {} FROM attachment_index LIMIT 0", column)).is_err() {
                let _ = conn.execute_batch(&format!("ALTER TABLE attachment_index ADD COLUMN {} {}", column, definition));
            }
        }
        let _ = conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_notes_deleted ON notes(deleted_at)");
        let _ = conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_folders_deleted ON folders(deleted_at)");

        Database { conn: Mutex::new(conn), data_dir }
    }

    pub fn default_data_dir() -> PathBuf {
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.join("data")))
            .unwrap_or_else(|| PathBuf::from("data"))
    }

    pub fn data_dir(&self) -> &PathBuf {
        &self.data_dir
    }

    fn add_dir_to_zip(
        zip: &mut zip::ZipWriter<fs::File>,
        base_dir: &std::path::Path,
        current_dir: &std::path::Path,
        options: zip::write::SimpleFileOptions,
    ) -> Result<(), String> {
        for entry in fs::read_dir(current_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                Self::add_dir_to_zip(zip, base_dir, &path, options)?;
                continue;
            }
            if !path.is_file() {
                continue;
            }
            let rel = path
                .strip_prefix(base_dir)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            let data = fs::read(&path).map_err(|e| format!("读取附件失败: {}", e))?;
            zip.start_file(format!("attachments/{}", rel), options).map_err(|e| e.to_string())?;
            zip.write_all(&data).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn quick_window_size(&self) -> (f64, f64) {
        let config = self.read_config();
        let w = if config.quick_width > 0.0 { config.quick_width } else { 320.0 };
        let h = if config.quick_height > 0.0 { config.quick_height } else { 360.0 };
        (w, h)
    }

    pub fn save_quick_window_size(&self, width: f64, height: f64) -> Result<(), String> {
        let mut config = self.read_config();
        config.quick_width = width;
        config.quick_height = height;
        self.save_config_file(&config)
    }

    pub fn set_data_dir(&self, new_dir: &str) -> Result<String, String> {
        let new_path = PathBuf::from(new_dir);
        fs::create_dir_all(&new_path).map_err(|e| format!("Cannot create directory: {}", e))?;

        // Move database file if it exists in old location
        let old_db = self.data_dir.join("kova.db");
        let new_db = new_path.join("kova.db");
        if old_db.exists() && old_db != new_db {
            fs::copy(&old_db, &new_db).map_err(|e| format!("Failed to copy database: {}", e))?;
            let _ = fs::remove_file(&old_db);
        }

        let mut config = self.read_config();
        config.data_dir = new_dir.to_string();
        self.save_config_file(&config)?;

        Ok(new_path.to_string_lossy().to_string())
    }

    fn count_tables(conn: &Connection) -> Result<(i64, i64), String> {
        let note_count = conn
            .query_row("SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL", [], |row| row.get(0))
            .or_else(|_| conn.query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0)))
            .map_err(|e| format!("统计笔记数量失败: {}", e))?;
        let folder_count = conn
            .query_row("SELECT COUNT(*) FROM folders WHERE deleted_at IS NULL", [], |row| row.get(0))
            .or_else(|_| conn.query_row("SELECT COUNT(*) FROM folders", [], |row| row.get(0)))
            .map_err(|e| format!("统计目录数量失败: {}", e))?;
        Ok((note_count, folder_count))
    }

    fn collect_attachment_file_count(base_dir: &Path) -> Result<i64, String> {
        if !base_dir.exists() {
            return Ok(0);
        }
        let mut count = 0i64;
        for entry in fs::read_dir(base_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                count += Self::collect_attachment_file_count(&path)?;
            } else if path.is_file() {
                count += 1;
            }
        }
        Ok(count)
    }

    fn validate_sqlite_db(path: &Path) -> Result<(i64, i64), String> {
        let conn = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|_| "备份中的数据库无法打开".to_string())?;
        let table_check: String = conn
            .query_row("SELECT name FROM sqlite_master WHERE type='table' AND name='notes'", [], |row| row.get(0))
            .map_err(|_| "备份中的数据库缺少 notes 表".to_string())?;
        if table_check != "notes" {
            return Err("备份中的数据库结构不正确".into());
        }
        Self::count_tables(&conn)
    }

    fn read_json_file_if_valid(path: &Path, error_message: &str) -> Result<Option<String>, String> {
        if !path.exists() {
            return Ok(None);
        }
        let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
        serde_json::from_str::<serde_json::Value>(&content).map_err(|_| error_message.to_string())?;
        Ok(Some(content))
    }

    fn make_restore_temp_dir(&self) -> Result<PathBuf, String> {
        let temp_dir = self
            .data_dir
            .join(format!("restore-temp-{}", Uuid::new_v4().simple()));
        fs::create_dir_all(&temp_dir).map_err(|e| format!("创建恢复临时目录失败: {}", e))?;
        Ok(temp_dir)
    }

    fn inspect_zip_restore(&self, src: &Path) -> Result<RestoreInspection, String> {
        let file = fs::File::open(src).map_err(|e| format!("打开备份文件失败: {}", e))?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("解析备份文件失败: {}", e))?;

        let names = archive.file_names().map(|name| name.to_string()).collect::<Vec<_>>();
        let has_database = names.iter().any(|name| name == "kova.db");
        let has_config = names.iter().any(|name| name == "kova-config.json");
        let has_settings = names.iter().any(|name| name == "kova-settings.json");
        let attachment_file_count = names
            .iter()
            .filter(|name| name.starts_with("attachments/") && !name.ends_with('/'))
            .count() as i64;
        let has_attachments = attachment_file_count > 0;
        let manifest_present = names.iter().any(|name| name == "manifest.json");
        let mut warnings = Vec::new();
        let mut manifest = None;
        let mut note_count = None;
        let mut folder_count = None;

        if !has_database {
            return Ok(RestoreInspection {
                source_path: src.to_string_lossy().to_string(),
                archive_kind: "zip".into(),
                can_restore: false,
                summary: "备份包缺少数据库文件，不能恢复".into(),
                warnings,
                manifest_present,
                manifest,
                items: RestoreInspectionItems {
                    has_database,
                    has_config,
                    has_settings,
                    has_attachments,
                    attachment_file_count,
                },
            });
        }

        if manifest_present {
            let mut manifest_entry = archive.by_name("manifest.json").map_err(|e| e.to_string())?;
            let mut manifest_buf = Vec::new();
            manifest_entry.read_to_end(&mut manifest_buf).map_err(|e| e.to_string())?;
            let parsed_manifest: BackupManifest = serde_json::from_slice(&manifest_buf)
                .map_err(|_| "备份 manifest.json 格式无效".to_string())?;
            if parsed_manifest.format != "kova-backup" {
                return Err("备份 manifest.json 类型不匹配".into());
            }
            if !parsed_manifest.includes.database {
                return Err("备份 manifest.json 缺少数据库声明".into());
            }
            if parsed_manifest.includes.attachments && !has_attachments {
                warnings.push("manifest 标记包含附件，但压缩包内未发现附件文件".into());
            }
            note_count = Some(parsed_manifest.note_count);
            folder_count = Some(parsed_manifest.folder_count);
            manifest = Some(parsed_manifest);
        } else {
            warnings.push("备份包缺少 manifest.json，将按兼容模式恢复".into());
        }

        let temp_dir = self.make_restore_temp_dir()?;
        let temp_db = temp_dir.join("kova.db");
        let validate_result = (|| -> Result<(i64, i64), String> {
            let mut db_entry = archive.by_name("kova.db").map_err(|e| e.to_string())?;
            let mut db_buf = Vec::new();
            db_entry.read_to_end(&mut db_buf).map_err(|e| e.to_string())?;
            fs::write(&temp_db, &db_buf).map_err(|e| e.to_string())?;
            Self::validate_sqlite_db(&temp_db)
        })();
        let _ = fs::remove_dir_all(&temp_dir);
        let (validated_notes, validated_folders) = validate_result?;

        let summary = format!(
            "可恢复：{} 条笔记、{} 个目录、{} 个附件文件{}{}",
            note_count.unwrap_or(validated_notes),
            folder_count.unwrap_or(validated_folders),
            attachment_file_count,
            if has_settings { "，包含本地设置" } else { "" },
            if has_config { "，包含应用配置" } else { "" }
        );

        Ok(RestoreInspection {
            source_path: src.to_string_lossy().to_string(),
            archive_kind: "zip".into(),
            can_restore: true,
            summary,
            warnings,
            manifest_present,
            manifest,
            items: RestoreInspectionItems {
                has_database,
                has_config,
                has_settings,
                has_attachments,
                attachment_file_count,
            },
        })
    }

    fn inspect_legacy_restore(&self, src: &Path) -> Result<RestoreInspection, String> {
        let (note_count, folder_count) = Self::validate_sqlite_db(src)?;
        let src_dir = src.parent().unwrap_or(src);
        let has_config = src_dir.join("kova-config.json").exists();
        let has_settings = src_dir.join("kova-settings.json").exists();
        let has_attachments = src_dir.join("attachments").exists();
        let attachment_file_count = Self::collect_attachment_file_count(&src_dir.join("attachments"))?;

        Ok(RestoreInspection {
            source_path: src.to_string_lossy().to_string(),
            archive_kind: "legacy-db".into(),
            can_restore: true,
            summary: format!(
                "可恢复：{} 条笔记、{} 个目录、{} 个附件文件（兼容模式）",
                note_count,
                folder_count,
                attachment_file_count
            ),
            warnings: vec!["这是旧版恢复格式，缺少完整 manifest 信息".into()],
            manifest_present: false,
            manifest: None,
            items: RestoreInspectionItems {
                has_database: true,
                has_config,
                has_settings,
                has_attachments,
                attachment_file_count,
            },
        })
    }

    pub fn inspect_restore(&self, src_path: &str) -> Result<RestoreInspection, String> {
        let src = PathBuf::from(src_path);
        if !src.exists() {
            return Err("备份文件不存在".into());
        }
        if src.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("zip")) {
            return self.inspect_zip_restore(&src);
        }
        if src.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("db")) {
            return self.inspect_legacy_restore(&src);
        }
        Err("仅支持 zip 或 db 备份文件".into())
    }

    pub fn backup(&self, dest_dir: &str, settings_json: Option<&str>) -> Result<String, String> {
        let src = self.data_dir.join("kova.db");
        if !src.exists() {
            return Err("数据库文件不存在".into());
        }

        let now = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        let random = Uuid::new_v4().simple().to_string()[..4].to_string();
        let zip_name = format!("kova-backup-{}_{}.zip", now, random);
        let dest = PathBuf::from(dest_dir).join(&zip_name);
        let file = fs::File::create(&dest).map_err(|e| format!("创建备份文件失败: {}", e))?;
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        let db_data = fs::read(&src).map_err(|e| format!("读取数据库失败: {}", e))?;
        zip.start_file("kova.db", options).map_err(|e| e.to_string())?;
        zip.write_all(&db_data).map_err(|e| e.to_string())?;

        let config_path = self.data_dir.join("config.json");
        if config_path.exists() {
            let config_data = fs::read(&config_path).map_err(|e| format!("读取配置失败: {}", e))?;
            zip.start_file("kova-config.json", options).map_err(|e| e.to_string())?;
            zip.write_all(&config_data).map_err(|e| e.to_string())?;
        }

        let mut settings_included = false;
        if let Some(settings_json) = settings_json {
            serde_json::from_str::<serde_json::Value>(settings_json)
                .map_err(|_| "备份设置快照不是合法 JSON".to_string())?;
            zip.start_file("kova-settings.json", options).map_err(|e| e.to_string())?;
            zip.write_all(settings_json.as_bytes()).map_err(|e| e.to_string())?;
            settings_included = true;
        } else {
            let settings_path = self.data_dir.join("kova-settings.json");
            if settings_path.exists() {
                let settings_data = fs::read(&settings_path).map_err(|e| format!("读取设置失败: {}", e))?;
                zip.start_file("kova-settings.json", options).map_err(|e| e.to_string())?;
                zip.write_all(&settings_data).map_err(|e| e.to_string())?;
                settings_included = true;
            }
        }

        let attachments_path = self.data_dir.join("attachments");
        let attachment_file_count = Self::collect_attachment_file_count(&attachments_path)?;
        if attachments_path.exists() {
            Self::add_dir_to_zip(&mut zip, &attachments_path, &attachments_path, options)?;
        }

        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let (note_count, folder_count) = Self::count_tables(&conn)?;
        drop(conn);

        let manifest = BackupManifest {
            format: "kova-backup".into(),
            version: 2,
            created_at: chrono::Utc::now().to_rfc3339(),
            note_count,
            folder_count,
            attachment_file_count,
            includes: BackupManifestIncludes {
                database: true,
                config: config_path.exists(),
                settings: settings_included,
                attachments: attachment_file_count > 0,
            },
        };
        zip.start_file("manifest.json", options).map_err(|e| e.to_string())?;
        zip.write_all(serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?.as_bytes())
            .map_err(|e| e.to_string())?;

        zip.finish().map_err(|e| e.to_string())?;
        Ok(dest.to_string_lossy().to_string())
    }

    pub fn restore(&self, src_path: &str) -> Result<RestoreResult, String> {
        let inspection = self.inspect_restore(src_path)?;
        if !inspection.can_restore {
            return Err(inspection.summary);
        }

        let pre_restore_backup_path = self.backup(
            self.data_dir
                .to_str()
                .ok_or_else(|| "当前数据目录无效，无法创建恢复前备份".to_string())?,
            None,
        )?;

        let src = PathBuf::from(src_path);
        let temp_dir = self.make_restore_temp_dir()?;
        let temp_db = temp_dir.join("kova.db");
        let temp_config = temp_dir.join("config.json");
        let temp_settings = temp_dir.join("kova-settings.json");
        let temp_attachments = temp_dir.join("attachments");

        let restore_stage = (|| -> Result<RestoreResult, String> {
            let mut restored_config = false;
            let mut restored_settings = false;
            let mut restored_attachment_files = 0i64;
            let mut restored_settings_json = None;

            if inspection.archive_kind == "zip" {
                let file = fs::File::open(&src).map_err(|e| format!("打开备份文件失败: {}", e))?;
                let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("解析备份文件失败: {}", e))?;
                fs::create_dir_all(&temp_attachments).map_err(|e| e.to_string())?;
                for index in 0..archive.len() {
                    let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
                    let entry_name = entry.name().to_string();
                    match entry_name.as_str() {
                        "kova.db" => {
                            let mut buf = Vec::new();
                            entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
                            fs::write(&temp_db, &buf).map_err(|e| e.to_string())?;
                        }
                        "kova-config.json" => {
                            let mut buf = Vec::new();
                            entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
                            serde_json::from_slice::<serde_json::Value>(&buf)
                                .map_err(|_| "恢复包中的应用配置 JSON 无效".to_string())?;
                            fs::write(&temp_config, &buf).map_err(|e| e.to_string())?;
                            restored_config = true;
                        }
                        "kova-settings.json" => {
                            let mut buf = Vec::new();
                            entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
                            let settings_text = String::from_utf8(buf).map_err(|_| "恢复包中的本地设置编码无效".to_string())?;
                            serde_json::from_str::<serde_json::Value>(&settings_text)
                                .map_err(|_| "恢复包中的本地设置 JSON 无效".to_string())?;
                            fs::write(&temp_settings, settings_text.as_bytes()).map_err(|e| e.to_string())?;
                            restored_settings = true;
                            restored_settings_json = Some(settings_text);
                        }
                        _ if entry_name.starts_with("attachments/") && entry.is_file() => {
                            let rel = Path::new(&entry_name["attachments/".len()..]);
                            if rel.components().any(|c| matches!(c, std::path::Component::ParentDir | std::path::Component::RootDir | std::path::Component::Prefix(_))) {
                                return Err("恢复包中的附件路径非法".into());
                            }
                            let dest = temp_attachments.join(rel);
                            if let Some(parent) = dest.parent() {
                                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                            }
                            let mut buf = Vec::new();
                            entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
                            fs::write(&dest, &buf).map_err(|e| e.to_string())?;
                            restored_attachment_files += 1;
                        }
                        _ => {}
                    }
                }
            } else {
                fs::copy(&src, &temp_db).map_err(|e| format!("复制恢复数据库失败: {}", e))?;
                let src_dir = src.parent().unwrap_or(&src);
                if let Some(config_text) = Self::read_json_file_if_valid(&src_dir.join("kova-config.json"), "恢复目录中的应用配置 JSON 无效")? {
                    fs::write(&temp_config, config_text.as_bytes()).map_err(|e| e.to_string())?;
                    restored_config = true;
                }
                if let Some(settings_text) = Self::read_json_file_if_valid(&src_dir.join("kova-settings.json"), "恢复目录中的本地设置 JSON 无效")? {
                    fs::write(&temp_settings, settings_text.as_bytes()).map_err(|e| e.to_string())?;
                    restored_settings = true;
                    restored_settings_json = Some(settings_text);
                }
                let src_attachments = src_dir.join("attachments");
                if src_attachments.exists() {
                    fs::create_dir_all(&temp_attachments).map_err(|e| e.to_string())?;
                    for file in fs::read_dir(&src_attachments).map_err(|e| e.to_string())? {
                        let file = file.map_err(|e| e.to_string())?;
                        let path = file.path();
                        if path.is_file() {
                            let dest = temp_attachments.join(file.file_name());
                            fs::copy(&path, dest).map_err(|e| e.to_string())?;
                            restored_attachment_files += 1;
                        }
                    }
                }
            }

            Self::validate_sqlite_db(&temp_db)?;

            let final_db = self.data_dir.join("kova.db");
            let final_config = self.data_dir.join("config.json");
            let final_settings = self.data_dir.join("kova-settings.json");
            let final_attachments = self.data_dir.join("attachments");

            {
                let mut locked = self.conn.lock().map_err(|e| e.to_string())?;
                let dummy = Connection::open_in_memory().map_err(|e| e.to_string())?;
                let _old = std::mem::replace(&mut *locked, dummy);
            }

            fs::rename(&temp_db, &final_db).or_else(|_| {
                fs::copy(&temp_db, &final_db).map(|_| ())
            }).map_err(|e| format!("替换数据库失败: {}", e))?;

            if restored_config {
                fs::copy(&temp_config, &final_config).map_err(|e| format!("写入应用配置失败: {}", e))?;
            }
            if restored_settings {
                fs::copy(&temp_settings, &final_settings).map_err(|e| format!("写入本地设置失败: {}", e))?;
            }
            if restored_attachment_files > 0 {
                fs::create_dir_all(&final_attachments).map_err(|e| e.to_string())?;
                Self::copy_dir_recursive(&temp_attachments, &final_attachments)?;
            }

            let new_conn = Connection::open(&final_db).map_err(|e| format!("恢复后重新打开数据库失败: {}", e))?;
            let mut locked = self.conn.lock().map_err(|e| e.to_string())?;
            let _old = std::mem::replace(&mut *locked, new_conn);

            Ok(RestoreResult {
                source_path: src.to_string_lossy().to_string(),
                restored_database: true,
                restored_config,
                restored_settings,
                restored_attachment_files,
                restored_settings_json,
                pre_restore_backup_path,
                message: format!(
                    "恢复完成：数据库已替换{}{}{}",
                    if restored_config { "，应用配置已恢复" } else { "" },
                    if restored_settings { "，本地设置已恢复" } else { "" },
                    if restored_attachment_files > 0 { format!("，附件已写入 {} 个文件", restored_attachment_files) } else { String::new() }
                ),
            })
        })();

        let _ = fs::remove_dir_all(&temp_dir);
        restore_stage
    }

    fn copy_dir_recursive(src_dir: &Path, dest_dir: &Path) -> Result<(), String> {
        if !src_dir.exists() {
            return Ok(());
        }
        for entry in fs::read_dir(src_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            let dest = dest_dir.join(entry.file_name());
            if path.is_dir() {
                fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
                Self::copy_dir_recursive(&path, &dest)?;
            } else if path.is_file() {
                if let Some(parent) = dest.parent() {
                    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
                fs::copy(&path, &dest).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }
}

// Re-export for backward compatibility
pub use crate::services::models::*;
