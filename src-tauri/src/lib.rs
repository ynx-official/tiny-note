use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::Utc;
use serde::{ser::SerializeStruct, Deserialize, Serialize, Serializer};
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::Write,
    path::{Component, Path, PathBuf},
    sync::Mutex,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, State, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use thiserror::Error;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalMarkdownSelectionDto {
    selected: bool,
    files: Vec<PendingMarkdownFileDto>,
}

fn markdown_paths_in_folder(root: &Path) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let mut folders = vec![root.to_path_buf()];
    while let Some(folder) = folders.pop() {
        let Ok(entries) = fs::read_dir(folder) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            if kind.is_dir() {
                folders.push(entry.path());
            } else if kind.is_file() && is_markdown_path(&entry.path()) {
                paths.push(entry.path());
            }
        }
    }
    paths.sort();
    paths.dedup();
    paths
}

fn remove_external_markdown_mapping(
    mappings: &ExternalMarkdownMappings,
    id: &str,
) -> Result<(), AppError> {
    let mut records = mappings.records.lock().map_err(|_| AppError::Operation {
        code: "external_mapping_lock_failed".into(),
        message: "无法移除外部 Markdown 映射".into(),
    })?;
    let mut next = records.clone();
    next.retain(|record| record.id != id);
    if next.len() == records.len() {
        return Err(AppError::not_found(
            "external_source_not_found",
            "外部来源记录不存在",
        ));
    }
    mappings.save(&next)?;
    *records = next;
    Ok(())
}

#[tauri::command]
fn external_markdown_remove(
    mappings: State<'_, ExternalMarkdownMappings>,
    id: String,
) -> Result<(), AppError> {
    remove_external_markdown_mapping(&mappings, &id)
}

mod update;

#[derive(Debug, Error, Clone)]
pub enum AppError {
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
            Self::NotFound { code, message }
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
    fn fs(error: impl std::fmt::Display) -> Self {
        Self::Filesystem {
            code: "filesystem_error".into(),
            message: error.to_string(),
        }
    }
}

#[derive(Default)]
struct PendingMarkdownState {
    queue: Vec<PathBuf>,
    authorized: HashSet<PathBuf>,
}
#[derive(Default)]
pub struct PendingMarkdownFiles(Mutex<PendingMarkdownState>);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingMarkdownFileDto {
    path: String,
    file_name: String,
    content: Option<String>,
    error: Option<String>,
    changed: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalMarkdownSourceDto {
    id: String,
    title: String,
    path: String,
    file_name: String,
    updated_at: String,
    available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExternalMarkdownRecord {
    id: String,
    title: String,
    path: String,
    fingerprint: String,
    updated_at: String,
}

pub struct ExternalMarkdownMappings {
    file_path: PathBuf,
    records: Mutex<Vec<ExternalMarkdownRecord>>,
}

impl ExternalMarkdownMappings {
    fn load(data_dir: &Path) -> Self {
        let file_path = data_dir.join("external-markdown-mappings.json");
        let mut records: Vec<ExternalMarkdownRecord> = fs::read(&file_path)
            .ok()
            .and_then(|content| serde_json::from_slice(&content).ok())
            .unwrap_or_default();
        for record in &mut records {
            if !record.id.starts_with("external:") {
                record.id = format!("external:{}", record.id);
            }
        }
        Self {
            file_path,
            records: Mutex::new(records),
        }
    }
    fn save(&self, records: &[ExternalMarkdownRecord]) -> Result<(), AppError> {
        if let Some(parent) = self.file_path.parent() {
            fs::create_dir_all(parent).map_err(AppError::fs)?;
        }
        let temporary = self.file_path.with_extension("json.tmp");
        fs::write(
            &temporary,
            serde_json::to_vec_pretty(records).map_err(AppError::fs)?,
        )
        .map_err(AppError::fs)?;
        fs::rename(temporary, &self.file_path).map_err(AppError::fs)
    }
}

#[derive(Default)]
pub struct DesktopState {
    exported_files: Mutex<HashSet<PathBuf>>,
}

const MAX_EXTERNAL_MARKDOWN_BYTES: u64 = 10 * 1024 * 1024;
const MAX_EXPORT_FILE_BYTES: usize = 64 * 1024 * 1024;
const TRAY_PANEL_LABEL: &str = "tray-panel";

fn now() -> String {
    Utc::now().to_rfc3339()
}
fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| {
            value.eq_ignore_ascii_case("md") || value.eq_ignore_ascii_case("markdown")
        })
}
fn read_external_markdown(path: &Path) -> Result<(PathBuf, String), AppError> {
    let path = fs::canonicalize(path).map_err(|_| AppError::Filesystem {
        code: "external_file_missing".into(),
        message: "Markdown 源文件不存在或无法访问".into(),
    })?;
    if !is_markdown_path(&path) {
        return Err(AppError::invalid(
            "external_file_type_invalid",
            "只支持 .md 或 .markdown 文件",
        ));
    }
    let metadata = fs::metadata(&path).map_err(AppError::fs)?;
    if !metadata.is_file() {
        return Err(AppError::invalid(
            "external_file_not_regular",
            "Markdown 源路径不是普通文件",
        ));
    }
    if metadata.len() > MAX_EXTERNAL_MARKDOWN_BYTES {
        return Err(AppError::invalid(
            "external_file_too_large",
            "Markdown 源文件超过 10 MB 限制",
        ));
    }
    let text = String::from_utf8(fs::read(&path).map_err(AppError::fs)?).map_err(|_| {
        AppError::invalid(
            "external_file_encoding_invalid",
            "Markdown 源文件不是 UTF-8 编码",
        )
    })?;
    Ok((
        path,
        text.strip_prefix('\u{feff}').unwrap_or(&text).to_string(),
    ))
}
fn pending_markdown_file(path: PathBuf) -> PendingMarkdownFileDto {
    let path = fs::canonicalize(&path).unwrap_or(path);
    let display_path = path.to_string_lossy().into_owned();
    let file_name = path
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Markdown 文件".into());
    match read_external_markdown(&path) {
        Ok((_, content)) => PendingMarkdownFileDto {
            path: display_path,
            file_name,
            content: Some(content),
            error: None,
            changed: true,
        },
        Err(error) => PendingMarkdownFileDto {
            path: display_path,
            file_name,
            content: None,
            error: Some(error.to_string()),
            changed: true,
        },
    }
}
fn enqueue_markdown_paths<I>(pending: &PendingMarkdownFiles, paths: I, cwd: &Path) -> usize
where
    I: IntoIterator<Item = PathBuf>,
{
    let Ok(mut state) = pending.0.lock() else {
        return 0;
    };
    let before = state.queue.len();
    for argument in paths {
        let path = if argument.is_absolute() {
            argument
        } else {
            cwd.join(argument)
        };
        if is_markdown_path(&path) && !state.queue.contains(&path) {
            state.queue.push(path);
        }
    }
    state.queue.len() - before
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenExternalMarkdown {
    path: String,
    content_markdown: String,
}

#[tauri::command]
fn app_take_pending_markdown_files(
    pending: State<'_, PendingMarkdownFiles>,
) -> Result<Vec<PendingMarkdownFileDto>, AppError> {
    let paths = {
        let mut state = pending.0.lock().map_err(|_| AppError::Operation {
            code: "pending_file_lock_failed".into(),
            message: "无法读取待打开文件队列".into(),
        })?;
        std::mem::take(&mut state.queue)
    };
    let files = paths
        .into_iter()
        .map(pending_markdown_file)
        .collect::<Vec<_>>();
    let mut state = pending.0.lock().map_err(|_| AppError::Operation {
        code: "pending_file_lock_failed".into(),
        message: "无法更新待打开文件授权".into(),
    })?;
    for file in &files {
        if file.content.is_some() {
            state.authorized.insert(PathBuf::from(&file.path));
        }
    }
    Ok(files)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalMarkdownBinding {
    id: String,
    fingerprint: String,
    updated_at: String,
}

fn bind_external_markdown(
    mappings: &ExternalMarkdownMappings,
    pending: &PendingMarkdownFiles,
    input: OpenExternalMarkdown,
    id: String,
    title: String,
) -> Result<ExternalMarkdownBinding, AppError> {
    if !id.starts_with("external:") || id.len() > 128 {
        return Err(AppError::invalid(
            "external_mapping_invalid",
            "外部文档标识无效",
        ));
    }
    let (path, content) = read_external_markdown(Path::new(&input.path))?;
    let mut authorization = pending.0.lock().map_err(AppError::fs)?;
    if !authorization.authorized.contains(&path) {
        return Err(AppError::invalid(
            "external_file_not_authorized",
            "该文件不是本次系统打开请求",
        ));
    }
    if content != input.content_markdown {
        return Err(AppError::invalid(
            "external_file_changed",
            "Markdown 源文件在打开期间发生变化，请重新打开",
        ));
    }
    let fingerprint = format!("{:x}", md5::compute(content.as_bytes()));
    let mut records = mappings.records.lock().map_err(AppError::fs)?;
    let display_path = path.to_string_lossy().into_owned();
    let id = records
        .iter()
        .find(|record| record.path == display_path)
        .map(|record| record.id.clone())
        .unwrap_or(id);
    if records
        .iter()
        .any(|record| record.id == id && record.path != display_path)
    {
        return Err(AppError::invalid(
            "external_mapping_invalid",
            "外部文档标识已被使用",
        ));
    }
    let updated_at = now();
    let mut next = records.clone();
    next.retain(|record| record.path != display_path);
    next.push(ExternalMarkdownRecord {
        id: id.clone(),
        title,
        path: display_path,
        fingerprint: fingerprint.clone(),
        updated_at: updated_at.clone(),
    });
    mappings.save(&next)?;
    *records = next;
    authorization.authorized.remove(&path);
    Ok(ExternalMarkdownBinding {
        id,
        fingerprint,
        updated_at,
    })
}

#[tauri::command]
fn external_markdown_bind(
    mappings: State<'_, ExternalMarkdownMappings>,
    pending: State<'_, PendingMarkdownFiles>,
    input: OpenExternalMarkdown,
    id: String,
    title: String,
) -> Result<ExternalMarkdownBinding, AppError> {
    bind_external_markdown(&mappings, &pending, input, id, title)
}

fn write_external_markdown(
    mappings: &ExternalMarkdownMappings,
    id: &str,
    content: &str,
    expected_fingerprint: &str,
) -> Result<ExternalMarkdownBinding, AppError> {
    if content.len() as u64 > MAX_EXTERNAL_MARKDOWN_BYTES {
        return Err(AppError::invalid(
            "external_file_too_large",
            "Markdown 源文件超过 10 MB 限制",
        ));
    }
    let mut records = mappings.records.lock().map_err(AppError::fs)?;
    let record = records
        .iter()
        .find(|record| record.id == id)
        .ok_or_else(|| AppError::not_found("external_source_not_found", "外部来源记录不存在"))?;
    let source = Path::new(&record.path);
    let (canonical, current) = read_external_markdown(source)?;
    // CodeMirror normalizes its document to LF. Keep the source file's first
    // established line ending when persisting editor content and fingerprints.
    let normalized = content.replace("\r\n", "\n");
    let content = if current
        .split_once('\n')
        .is_some_and(|(line, _)| line.ends_with('\r'))
    {
        normalized.replace('\n', "\r\n")
    } else {
        normalized
    };
    if content.len() as u64 > MAX_EXTERNAL_MARKDOWN_BYTES {
        return Err(AppError::invalid(
            "external_file_too_large",
            "Markdown 源文件超过 10 MB 限制",
        ));
    }
    if canonical != source {
        return Err(AppError::invalid(
            "external_file_changed",
            "Markdown 源路径已发生变化，请重新打开",
        ));
    }
    let current_fingerprint = format!("{:x}", md5::compute(current.as_bytes()));
    if current_fingerprint != expected_fingerprint && current != content {
        return Err(AppError::invalid(
            "external_file_changed",
            "源文件已被其他程序修改，请重新打开确认",
        ));
    }
    if current != content {
        let metadata = fs::metadata(source).map_err(AppError::fs)?;
        let has_bom = fs::read(source)
            .map_err(AppError::fs)?
            .starts_with(&[0xef, 0xbb, 0xbf]);
        let mut temporary = tempfile::NamedTempFile::new_in(
            source
                .parent()
                .ok_or_else(|| AppError::invalid("external_path_invalid", "源文件目录无效"))?,
        )
        .map_err(AppError::fs)?;
        if has_bom {
            temporary
                .write_all(&[0xef, 0xbb, 0xbf])
                .map_err(AppError::fs)?;
        }
        temporary
            .write_all(content.as_bytes())
            .map_err(AppError::fs)?;
        temporary
            .as_file()
            .set_permissions(metadata.permissions())
            .map_err(AppError::fs)?;
        temporary.as_file().sync_all().map_err(AppError::fs)?;
        // Recheck immediately before replacement, including a replaced symlink.
        let (latest_path, latest) = read_external_markdown(source)?;
        if latest_path != canonical || latest != current {
            return Err(AppError::invalid(
                "external_file_changed",
                "源文件在保存期间发生变化，请重新打开",
            ));
        }
        temporary.persist(source).map_err(AppError::fs)?;
    }
    let fingerprint = format!("{:x}", md5::compute(content.as_bytes()));
    let updated_at = now();
    let mut next = records.clone();
    let updated = next
        .iter_mut()
        .find(|record| record.id == id)
        .expect("locked record exists");
    updated.fingerprint = fingerprint.clone();
    updated.updated_at = updated_at.clone();
    mappings.save(&next)?;
    *records = next;
    Ok(ExternalMarkdownBinding {
        id: id.into(),
        fingerprint,
        updated_at,
    })
}

#[tauri::command]
fn external_markdown_write(
    mappings: State<'_, ExternalMarkdownMappings>,
    id: String,
    content: String,
    expected_fingerprint: String,
) -> Result<ExternalMarkdownBinding, AppError> {
    write_external_markdown(&mappings, &id, &content, &expected_fingerprint)
}

#[tauri::command]
fn external_markdown_list(
    mappings: State<'_, ExternalMarkdownMappings>,
) -> Result<Vec<ExternalMarkdownSourceDto>, AppError> {
    let records = mappings.records.lock().map_err(|_| AppError::Operation {
        code: "external_mapping_lock_failed".into(),
        message: "无法读取外部 Markdown 映射".into(),
    })?;
    let mut result = records
        .iter()
        .map(|record| ExternalMarkdownSourceDto {
            id: record.id.clone(),
            title: record.title.clone(),
            path: record.path.clone(),
            file_name: Path::new(&record.path)
                .file_name()
                .map(|value| value.to_string_lossy().into_owned())
                .unwrap_or_else(|| "Markdown 文件".into()),
            updated_at: record.updated_at.clone(),
            available: Path::new(&record.path).is_file(),
        })
        .collect::<Vec<_>>();
    result.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(result)
}

#[tauri::command]
fn external_markdown_read(
    mappings: State<'_, ExternalMarkdownMappings>,
    pending: State<'_, PendingMarkdownFiles>,
    id: String,
) -> Result<PendingMarkdownFileDto, AppError> {
    let (path, fingerprint) = mappings
        .records
        .lock()
        .map_err(|_| AppError::Operation {
            code: "external_mapping_lock_failed".into(),
            message: "无法读取外部 Markdown 映射".into(),
        })?
        .iter()
        .find(|record| record.id == id)
        .map(|record| (record.path.clone(), record.fingerprint.clone()))
        .ok_or_else(|| AppError::not_found("external_source_not_found", "外部来源记录不存在"))?;
    let mut file = pending_markdown_file(PathBuf::from(path));
    if let Some(content) = file.content.as_deref() {
        file.changed = format!("{:x}", md5::compute(content.as_bytes())) != fingerprint;
    }
    if file.content.is_some() {
        pending
            .0
            .lock()
            .map_err(|_| AppError::Operation {
                code: "pending_file_lock_failed".into(),
                message: "无法授权打开外部文件".into(),
            })?
            .authorized
            .insert(PathBuf::from(&file.path));
    }
    Ok(file)
}

#[tauri::command]
fn external_markdown_pick_files(
    app: tauri::AppHandle,
    pending: State<'_, PendingMarkdownFiles>,
) -> Result<ExternalMarkdownSelectionDto, AppError> {
    let Some(paths) = app
        .dialog()
        .file()
        .set_title("打开 Markdown 文件")
        .add_filter("Markdown", &["md", "markdown"])
        .blocking_pick_files()
    else {
        return Ok(ExternalMarkdownSelectionDto {
            selected: false,
            files: Vec::new(),
        });
    };
    let paths = paths
        .into_iter()
        .map(|path| path.into_path().map_err(AppError::fs))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ExternalMarkdownSelectionDto {
        selected: true,
        files: authorize_selected_markdown_files(&pending, paths)?,
    })
}

#[tauri::command]
fn external_markdown_pick_folder(
    app: tauri::AppHandle,
    pending: State<'_, PendingMarkdownFiles>,
) -> Result<ExternalMarkdownSelectionDto, AppError> {
    let Some(folder) = app
        .dialog()
        .file()
        .set_title("打开 Markdown 文件夹")
        .blocking_pick_folder()
    else {
        return Ok(ExternalMarkdownSelectionDto {
            selected: false,
            files: Vec::new(),
        });
    };
    let folder = folder.into_path().map_err(AppError::fs)?;
    Ok(ExternalMarkdownSelectionDto {
        selected: true,
        files: authorize_selected_markdown_files(&pending, markdown_paths_in_folder(&folder))?,
    })
}

fn authorize_selected_markdown_files(
    pending: &PendingMarkdownFiles,
    paths: impl IntoIterator<Item = PathBuf>,
) -> Result<Vec<PendingMarkdownFileDto>, AppError> {
    let files = paths
        .into_iter()
        .scan(HashSet::new(), |seen, path| {
            let key = fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
            Some(seen.insert(key).then_some(path))
        })
        .flatten()
        .map(pending_markdown_file)
        .collect::<Vec<_>>();
    let mut pending = pending.0.lock().map_err(|_| AppError::Operation {
        code: "pending_file_lock_failed".into(),
        message: "无法授权打开外部文件".into(),
    })?;
    for file in &files {
        if file.content.is_some() {
            pending.authorized.insert(PathBuf::from(&file.path));
        }
    }
    Ok(files)
}

#[tauri::command]
fn external_markdown_clear(mappings: State<'_, ExternalMarkdownMappings>) -> Result<u64, AppError> {
    let mut records = mappings.records.lock().map_err(|_| AppError::Operation {
        code: "external_mapping_lock_failed".into(),
        message: "无法清除外部 Markdown 映射".into(),
    })?;
    let count = records.len() as u64;
    records.clear();
    mappings.save(&records)?;
    Ok(count)
}

fn sanitized_credential_account(account: &str) -> Result<String, AppError> {
    let account = account.trim();
    if account.is_empty()
        || account.len() > 128
        || !account
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_' | '.'))
    {
        return Err(AppError::invalid(
            "credential_account_invalid",
            "凭据账户名称无效",
        ));
    }
    Ok(account.to_owned())
}
fn credential_entry(app: &AppHandle, account: &str) -> Result<keyring::Entry, AppError> {
    keyring::Entry::new(
        &app.config().identifier,
        &sanitized_credential_account(account)?,
    )
    .map_err(|error| AppError::Operation {
        code: "credential_store_unavailable".into(),
        message: error.to_string(),
    })
}
#[tauri::command]
fn credential_get(app: AppHandle, account: String) -> Result<Option<String>, AppError> {
    match credential_entry(&app, &account)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(AppError::Operation {
            code: "credential_read_failed".into(),
            message: error.to_string(),
        }),
    }
}
#[tauri::command]
fn credential_set(app: AppHandle, account: String, secret: String) -> Result<(), AppError> {
    if secret.is_empty() || secret.len() > 16 * 1024 {
        return Err(AppError::invalid(
            "credential_secret_invalid",
            "凭据内容无效",
        ));
    }
    credential_entry(&app, &account)?
        .set_password(&secret)
        .map_err(|error| AppError::Operation {
            code: "credential_write_failed".into(),
            message: error.to_string(),
        })
}
#[tauri::command]
fn credential_delete(app: AppHandle, account: String) -> Result<(), AppError> {
    match credential_entry(&app, &account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(AppError::Operation {
            code: "credential_delete_failed".into(),
            message: error.to_string(),
        }),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportWriteRequest {
    directory: String,
    file_name: String,
    content_base64: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportWriteResult {
    path: String,
    file_name: String,
}

fn write_export_file(
    directory: &Path,
    file_name: &str,
    bytes: &[u8],
) -> Result<ExportWriteResult, AppError> {
    if bytes.len() > MAX_EXPORT_FILE_BYTES {
        return Err(AppError::invalid(
            "export_too_large",
            "导出文件超过 64 MB 限制",
        ));
    }
    let file_path = Path::new(file_name);
    if file_name.is_empty()
        || file_name.contains('\0')
        || file_path.components().count() != 1
        || !matches!(file_path.components().next(), Some(Component::Normal(_)))
    {
        return Err(AppError::invalid(
            "invalid_export_filename",
            "导出文件名无效",
        ));
    }
    let directory = fs::canonicalize(directory).map_err(AppError::fs)?;
    if !directory.is_dir() {
        return Err(AppError::invalid(
            "invalid_export_directory",
            "导出位置不是文件夹",
        ));
    }
    let stem = file_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("note");
    let extension = file_path.extension().and_then(|value| value.to_str());
    for copy in 1..=10_000_u32 {
        let candidate_name = if copy == 1 {
            file_name.to_owned()
        } else if let Some(extension) = extension {
            format!("{stem} ({copy}).{extension}")
        } else {
            format!("{stem} ({copy})")
        };
        let candidate = directory.join(&candidate_name);
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(mut file) => {
                if let Err(error) = file.write_all(bytes).and_then(|_| file.sync_all()) {
                    let _ = fs::remove_file(&candidate);
                    return Err(AppError::fs(error));
                }
                return Ok(ExportWriteResult {
                    path: candidate.to_string_lossy().into_owned(),
                    file_name: candidate_name,
                });
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(AppError::fs(error)),
        }
    }
    Err(AppError::Operation {
        code: "export_name_exhausted".into(),
        message: "无法生成可用的导出文件名".into(),
    })
}

#[tauri::command]
fn export_write_file(
    state: State<'_, DesktopState>,
    request: ExportWriteRequest,
) -> Result<ExportWriteResult, AppError> {
    if request.content_base64.len() > (MAX_EXPORT_FILE_BYTES * 4 / 3) + 8 {
        return Err(AppError::invalid(
            "export_too_large",
            "导出文件超过 64 MB 限制",
        ));
    }
    let bytes = BASE64
        .decode(request.content_base64)
        .map_err(|_| AppError::invalid("invalid_export_content", "导出文件内容无效"))?;
    let result = write_export_file(Path::new(&request.directory), &request.file_name, &bytes)?;
    let path = fs::canonicalize(&result.path).map_err(AppError::fs)?;
    let mut exported = state
        .exported_files
        .lock()
        .map_err(|_| AppError::fs("导出授权锁不可用"))?;
    if exported.len() >= 256 {
        exported.clear();
    }
    exported.insert(path);
    Ok(result)
}
fn authorized_export_path(state: &DesktopState, path: &str) -> Result<PathBuf, AppError> {
    let path = fs::canonicalize(path).map_err(AppError::fs)?;
    if !state
        .exported_files
        .lock()
        .map_err(|_| AppError::fs("导出授权锁不可用"))?
        .contains(&path)
    {
        return Err(AppError::invalid(
            "export_file_not_authorized",
            "只能打开本次运行中由 Tiny Note 导出的文件",
        ));
    }
    Ok(path)
}
#[tauri::command]
fn export_open_file(
    app: AppHandle,
    state: State<'_, DesktopState>,
    path: String,
) -> Result<(), AppError> {
    let path = authorized_export_path(&state, &path)?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|error| AppError::Operation {
            code: "export_open_failed".into(),
            message: error.to_string(),
        })
}
#[tauri::command]
fn export_reveal_file(
    app: AppHandle,
    state: State<'_, DesktopState>,
    path: String,
) -> Result<(), AppError> {
    let path = authorized_export_path(&state, &path)?;
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|error| AppError::Operation {
            code: "export_reveal_failed".into(),
            message: error.to_string(),
        })
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "打开 Tiny Note", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "彻底退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let mut tray = TrayIconBuilder::with_id("tiny-note-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                position,
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_tray_panel(tray.app_handle(), position);
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}
fn toggle_tray_panel(app: &AppHandle, click_position: PhysicalPosition<f64>) {
    let window = match app.get_webview_window(TRAY_PANEL_LABEL) {
        Some(window) => window,
        None => match WebviewWindowBuilder::new(
            app,
            TRAY_PANEL_LABEL,
            WebviewUrl::App("tray.html".into()),
        )
        .title("Tiny Note 待办")
        .inner_size(400.0, 640.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .closable(false)
        .decorations(false)
        .shadow(true)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .visible(false)
        .build()
        {
            Ok(window) => window,
            Err(_) => return,
        },
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
        return;
    }
    if let (Ok(size), Ok(Some(monitor))) = (
        window.outer_size(),
        app.monitor_from_point(click_position.x, click_position.y),
    ) {
        let area = monitor.work_area();
        let margin = 8;
        let min_x = area.position.x + margin;
        let max_x =
            (area.position.x + area.size.width as i32 - size.width as i32 - margin).max(min_x);
        let x = (click_position.x.round() as i32 - size.width as i32 / 2).clamp(min_x, max_x);
        let _ = window.set_position(PhysicalPosition::new(x, area.position.y + margin));
    }
    let _ = app.emit_to(TRAY_PANEL_LABEL, "tiny-note://tray-open", ());
    let _ = window.show();
    let _ = window.set_focus();
}
#[tauri::command]
fn tray_open_main(app: AppHandle, route: String) -> Result<(), AppError> {
    if !matches!(
        route.split('?').next().unwrap_or_default(),
        "/todos" | "/calendar" | "/settings"
    ) {
        return Err(AppError::invalid(
            "tray_route_invalid",
            "状态栏面板只能打开待办、日历或设置页面",
        ));
    }
    if let Some(panel) = app.get_webview_window(TRAY_PANEL_LABEL) {
        let _ = panel.hide();
    }
    app.emit_to("main", "tiny-note://navigate", route)
        .map_err(|error| AppError::Operation {
            code: "tray_navigation_failed".into(),
            message: error.to_string(),
        })?;
    show_main_window(&app);
    Ok(())
}
#[tauri::command]
fn startup_probe(state: String, browser_timestamp: f64) {
    if !matches!(
        state.as_str(),
        "static-shell" | "shell-ready" | "ready" | "error"
    ) {
        return;
    }
    let Ok(report_path) = std::env::var("TINY_NOTE_STARTUP_REPORT") else {
        return;
    };
    let path = PathBuf::from(report_path);
    let Some(parent) = path.parent() else { return };
    if path.extension().and_then(|value| value.to_str()) != Some("jsonl")
        || fs::canonicalize(parent).ok() != fs::canonicalize(std::env::temp_dir()).ok()
    {
        return;
    }
    let Ok(mut report) = OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };
    let _ = writeln!(
        report,
        "{}",
        serde_json::json!({ "state": state, "browserTimestamp": browser_timestamp })
    );
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceSnapshot {
    os_name: String,
    os_version: String,
    architecture: String,
    app_version: String,
}

#[tauri::command]
fn device_snapshot(app: AppHandle) -> DeviceSnapshot {
    DeviceSnapshot {
        os_name: std::env::consts::OS.to_owned(),
        // Rust's standard library intentionally does not expose a stable OS-version API.
        os_version: String::new(),
        architecture: std::env::consts::ARCH.to_owned(),
        app_version: app.package_info().version.to_string(),
    }
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let added = enqueue_markdown_paths(
                &app.state::<PendingMarkdownFiles>(),
                args.into_iter().map(PathBuf::from),
                Path::new(&cwd),
            );
            show_main_window(app);
            if added > 0 {
                let _ = app.emit("tiny-note://open-markdown", ());
            }
        }))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .on_window_event(|window, event| {
            if window.label() == TRAY_PANEL_LABEL
                && matches!(event, tauri::WindowEvent::Focused(false))
            {
                let _ = window.hide();
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            app.manage(ExternalMarkdownMappings::load(&data_dir));
            app.manage(DesktopState::default());
            let pending = PendingMarkdownFiles::default();
            let cwd = std::env::current_dir().unwrap_or_default();
            enqueue_markdown_paths(
                &pending,
                std::env::args_os().skip(1).map(PathBuf::from),
                &cwd,
            );
            app.manage(pending);
            create_tray(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_take_pending_markdown_files,
            external_markdown_bind,
            external_markdown_write,
            external_markdown_list,
            external_markdown_read,
            external_markdown_clear,
            external_markdown_pick_files,
            external_markdown_pick_folder,
            external_markdown_remove,
            export_write_file,
            export_open_file,
            export_reveal_file,
            tray_open_main,
            startup_probe,
            device_snapshot,
            credential_get,
            credential_set,
            credential_delete,
            update::app_update_check,
            update::app_update_download
        ])
        .build(tauri::generate_context!())
        .expect("error while building Tiny Note");
    #[cfg(target_os = "macos")]
    app.run(|app, event| {
        if let tauri::RunEvent::Opened { urls, .. } = event {
            let paths = urls
                .into_iter()
                .filter_map(|url| url.to_file_path().ok())
                .collect::<Vec<_>>();
            let cwd = std::env::current_dir().unwrap_or_default();
            if enqueue_markdown_paths(&app.state::<PendingMarkdownFiles>(), paths, &cwd) > 0 {
                let _ = app.emit("tiny-note://open-markdown", ());
            }
        }
    });
    #[cfg(not(target_os = "macos"))]
    app.run(|_, _| {});
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selected_folder_authorizes_only_markdown_files_and_deduplicates_paths() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join("child")).unwrap();
        fs::write(directory.path().join("one.md"), "# One").unwrap();
        fs::write(directory.path().join("child/two.MARKDOWN"), "# Two").unwrap();
        fs::write(directory.path().join("ignored.txt"), "ignored").unwrap();
        let mut paths = markdown_paths_in_folder(directory.path());
        assert_eq!(paths.len(), 2);
        paths.push(paths[0].clone());
        let pending = PendingMarkdownFiles::default();
        let files = authorize_selected_markdown_files(&pending, paths).unwrap();
        assert_eq!(files.len(), 2);
        assert!(files.iter().all(|file| file.content.is_some()));
        assert_eq!(pending.0.lock().unwrap().authorized.len(), 2);
    }

    #[test]
    fn removing_external_mapping_preserves_source_and_persists_removal() {
        let (directory, mappings, source, _) = external_fixture();
        let original = fs::read(&source).unwrap();
        remove_external_markdown_mapping(&mappings, "external:test").unwrap();
        assert_eq!(fs::read(&source).unwrap(), original);
        assert!(mappings.records.lock().unwrap().is_empty());
        assert!(
            ExternalMarkdownMappings::load(&directory.path().join("app"))
                .records
                .lock()
                .unwrap()
                .is_empty()
        );
        assert!(remove_external_markdown_mapping(&mappings, "external:missing").is_err());
    }

    fn external_fixture() -> (tempfile::TempDir, ExternalMarkdownMappings, PathBuf, String) {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("note.md");
        fs::write(&source, b"\xef\xbb\xbf# Original\r\n").unwrap();
        let source = fs::canonicalize(source).unwrap();
        let mappings = ExternalMarkdownMappings::load(&directory.path().join("app"));
        let pending = PendingMarkdownFiles::default();
        pending.0.lock().unwrap().authorized.insert(source.clone());
        let binding = bind_external_markdown(
            &mappings,
            &pending,
            OpenExternalMarkdown {
                path: source.to_string_lossy().into_owned(),
                content_markdown: "# Original\r\n".into(),
            },
            "external:test".into(),
            "Original".into(),
        )
        .unwrap();
        (directory, mappings, source, binding.fingerprint)
    }

    #[test]
    fn external_save_preserves_source_bom_and_crlf_from_editor_lf_after_restart() {
        let (directory, mappings, source, fingerprint) = external_fixture();
        let binding = write_external_markdown(
            &mappings,
            "external:test",
            "# Edited\n\n> a\n> b\n",
            &fingerprint,
        )
        .unwrap();
        assert_eq!(
            fs::read(&source).unwrap(),
            b"\xef\xbb\xbf# Edited\r\n\r\n> a\r\n> b\r\n"
        );
        let restored = ExternalMarkdownMappings::load(&directory.path().join("app"));
        assert_eq!(
            restored.records.lock().unwrap()[0].fingerprint,
            binding.fingerprint
        );
        let repeated = write_external_markdown(
            &restored,
            "external:test",
            "# Edited\n\n> a\n> b\n",
            &binding.fingerprint,
        )
        .unwrap();
        assert_eq!(binding.fingerprint, repeated.fingerprint);
        assert_eq!(
            fs::read(&source).unwrap(),
            b"\xef\xbb\xbf# Edited\r\n\r\n> a\r\n> b\r\n"
        );
        write_external_markdown(&restored, "external:test", "next", &binding.fingerprint).unwrap();
        assert_eq!(fs::read(&source).unwrap(), b"\xef\xbb\xbfnext");
    }

    #[test]
    fn external_save_rejects_changed_missing_and_unbound_sources() {
        let (_directory, mappings, source, fingerprint) = external_fixture();
        fs::write(&source, "Changed elsewhere").unwrap();
        assert!(
            matches!(write_external_markdown(&mappings, "external:test", "Overwrite", &fingerprint), Err(AppError::InvalidInput { code, .. }) if code == "external_file_changed")
        );
        assert_eq!(fs::read_to_string(&source).unwrap(), "Changed elsewhere");
        assert!(
            write_external_markdown(&mappings, "external:unknown", "Overwrite", &fingerprint)
                .is_err()
        );
        fs::remove_file(&source).unwrap();
        assert!(
            write_external_markdown(&mappings, "external:test", "Overwrite", &fingerprint).is_err()
        );
        assert!(!source.exists());
    }

    #[test]
    fn external_binding_requires_a_system_authorization_and_checks_contents() {
        let (_directory, mappings, source, _) = external_fixture();
        let pending = PendingMarkdownFiles::default();
        let input = || OpenExternalMarkdown {
            path: source.to_string_lossy().into_owned(),
            content_markdown: "# Original\r\n".into(),
        };
        assert!(bind_external_markdown(
            &mappings,
            &pending,
            input(),
            "external:new".into(),
            "title".into()
        )
        .is_err());
        pending.0.lock().unwrap().authorized.insert(source.clone());
        let mut stale = input();
        stale.content_markdown = "stale".into();
        assert!(bind_external_markdown(
            &mappings,
            &pending,
            stale,
            "external:new".into(),
            "title".into()
        )
        .is_err());
        let binding = bind_external_markdown(
            &mappings,
            &pending,
            input(),
            "external:new".into(),
            "title".into(),
        )
        .unwrap();
        assert_eq!(binding.id, "external:test");
        assert!(pending.0.lock().unwrap().authorized.is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn external_save_rejects_a_replaced_symlink_without_touching_its_target() {
        let (directory, mappings, source, fingerprint) = external_fixture();
        let target = directory.path().join("other.md");
        fs::write(&target, "# Original\r\n").unwrap();
        fs::remove_file(&source).unwrap();
        std::os::unix::fs::symlink(&target, &source).unwrap();
        assert!(
            write_external_markdown(&mappings, "external:test", "Overwrite", &fingerprint).is_err()
        );
        assert_eq!(fs::read_to_string(target).unwrap(), "# Original\r\n");
    }
    #[test]
    fn credential_accounts_are_scoped() {
        assert!(sanitized_credential_account("access-token").is_ok());
        assert!(sanitized_credential_account("../other-service").is_err());
    }
    #[test]
    fn export_names_cannot_escape() {
        let directory = tempfile::tempdir().unwrap();
        assert!(write_export_file(directory.path(), "backup.json", b"{}").is_ok());
        assert!(write_export_file(directory.path(), "../backup.json", b"{}").is_err());
    }
}
