use crate::{now, AppError, AppState};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use futures_util::StreamExt;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, path::PathBuf, sync::atomic::Ordering, time::Duration};
use tauri::State;
use uuid::Uuid;

const MAX_PROMPT_CHARS: usize = 4_000;
const MAX_COUNT: u8 = 4;
const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;
const MAX_RESPONSE_BYTES: usize = 64 * 1024 * 1024;
const MAX_INPUT_IMAGES: usize = 4;
const MAX_INPUT_TOTAL_BYTES: usize = 50 * 1024 * 1024;

fn default_image_mode() -> String {
    "generate".into()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImageInputDto {
    pub name: String,
    pub mime_type: String,
    pub data_url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenerateRequest {
    pub request_id: String,
    pub image_model_profile_id: String,
    pub prompt: String,
    pub size: String,
    pub count: u8,
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub input_images: Vec<ImageInputDto>,
    #[serde(default)]
    pub mask_image: Option<ImageInputDto>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImageAssetDto {
    pub id: String,
    pub generation_id: String,
    pub relative_path: String,
    pub mime_type: String,
    pub byte_size: u64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_uri: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenerationDto {
    pub id: String,
    pub task_id: String,
    pub prompt: String,
    #[serde(default = "default_image_mode")]
    pub mode: String,
    pub image_model_profile_id: String,
    pub size: String,
    pub count: u8,
    pub status: String,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub assets: Vec<ImageAssetDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenerateResult {
    pub generation_id: String,
    pub assets: Vec<ImageAssetDto>,
    pub usage: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BackupImageAssetDto {
    pub id: String,
    pub generation_id: String,
    pub relative_path: String,
    pub mime_type: String,
    pub byte_size: u64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub created_at: String,
    pub content_base64: String,
}

#[derive(Debug)]
struct ImageBytes {
    bytes: Vec<u8>,
    mime_type: String,
}

#[derive(Debug)]
struct ImageUpload {
    bytes: Vec<u8>,
    mime_type: String,
    file_name: String,
}

fn valid_endpoint_type(value: &str) -> bool {
    matches!(value, "openaiChat" | "openaiResponses")
}

fn normalize_base_url(value: &str) -> String {
    let mut base = value.trim().trim_end_matches('/').to_string();
    for suffix in ["/images/generations", "/images/edits", "/images", "/v1"] {
        if let Some(stripped) = base.strip_suffix(suffix) {
            base = stripped.trim_end_matches('/').to_string();
            if suffix == "/v1" {
                base.push_str("/v1");
                break;
            }
        }
    }
    base
}

fn generations_endpoint(base_url: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    if base.ends_with("/images/generations") {
        base.to_string()
    } else {
        format!("{}/images/generations", normalize_base_url(base))
    }
}

fn edits_endpoint(base_url: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    if base.ends_with("/images/edits") {
        base.to_string()
    } else {
        format!("{}/images/edits", normalize_base_url(base))
    }
}

fn validate_generation_request(
    request: &ImageGenerateRequest,
) -> Result<(String, u8, String), AppError> {
    let prompt = request.prompt.trim().to_string();
    if prompt.is_empty() {
        return Err(AppError::invalid("empty_image_prompt", "图片描述不能为空"));
    }
    if prompt.chars().count() > MAX_PROMPT_CHARS {
        return Err(AppError::invalid(
            "image_prompt_too_long",
            "图片描述不能超过 4000 个字符",
        ));
    }
    if !matches!(request.size.as_str(), "square" | "landscape" | "portrait") {
        return Err(AppError::invalid("invalid_image_size", "图片比例无效"));
    }
    if request.count == 0 || request.count > MAX_COUNT {
        return Err(AppError::invalid(
            "invalid_image_count",
            "一次最多生成 4 张图片",
        ));
    }
    let mode = if request.mode.trim().is_empty() {
        "generate"
    } else {
        request.mode.trim()
    };
    if !matches!(mode, "generate" | "reference" | "edit" | "inpaint") {
        return Err(AppError::invalid("invalid_image_mode", "图片生成模式无效"));
    }
    match mode {
        "generate" if !request.input_images.is_empty() || request.mask_image.is_some() => {
            return Err(AppError::invalid(
                "unexpected_image_input",
                "文字生图不需要上传图片",
            ));
        }
        "reference"
            if request.input_images.is_empty()
                || request.input_images.len() > MAX_INPUT_IMAGES
                || request.mask_image.is_some() =>
        {
            return Err(AppError::invalid(
                "invalid_reference_images",
                "参考图模式需要上传 1 至 4 张图片",
            ));
        }
        "edit" if request.input_images.len() != 1 || request.mask_image.is_some() => {
            return Err(AppError::invalid(
                "invalid_edit_image",
                "图片编辑模式需要上传 1 张原图",
            ));
        }
        "inpaint" if request.input_images.len() != 1 || request.mask_image.is_none() => {
            return Err(AppError::invalid(
                "invalid_inpaint_input",
                "局部重绘需要 1 张原图和对应蒙版",
            ));
        }
        _ => {}
    }
    Ok((prompt, request.count, mode.to_string()))
}

fn decode_upload(input: &ImageInputDto, mask: bool) -> Result<ImageUpload, AppError> {
    let (metadata, encoded) = input
        .data_url
        .split_once(',')
        .ok_or_else(|| AppError::invalid("invalid_image_input", "上传图片内容无效"))?;
    if !metadata.starts_with("data:") || !metadata.ends_with(";base64") {
        return Err(AppError::invalid(
            "invalid_image_input",
            "上传图片必须使用 Base64 数据",
        ));
    }
    let declared_mime = metadata
        .trim_start_matches("data:")
        .trim_end_matches(";base64")
        .to_ascii_lowercase();
    if !matches!(
        declared_mime.as_str(),
        "image/png" | "image/jpeg" | "image/webp"
    ) {
        return Err(AppError::invalid(
            "unsupported_image_input",
            "仅支持 PNG、JPEG 或 WebP 图片",
        ));
    }
    let bytes = BASE64
        .decode(encoded)
        .map_err(|_| AppError::invalid("invalid_image_input", "上传图片的 Base64 内容无效"))?;
    if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES {
        return Err(AppError::invalid(
            "image_input_too_large",
            "单张上传图片不能超过 20 MB",
        ));
    }
    let detected = detect_mime(&bytes, None)
        .ok_or_else(|| AppError::invalid("invalid_image_input", "上传内容不是有效图片"))?;
    if detected != declared_mime || (!input.mime_type.is_empty() && input.mime_type != detected) {
        return Err(AppError::invalid(
            "image_input_mismatch",
            "上传图片的格式信息不一致",
        ));
    }
    if mask && detected != "image/png" {
        return Err(AppError::invalid(
            "invalid_image_mask",
            "局部重绘蒙版必须是带透明通道的 PNG",
        ));
    }
    let extension = extension_for_mime(detected);
    let fallback = if mask { "mask" } else { "image" };
    let stem = input
        .name
        .rsplit_once('.')
        .map(|(value, _)| value)
        .unwrap_or(&input.name)
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        .take(48)
        .collect::<String>();
    Ok(ImageUpload {
        bytes,
        mime_type: detected.into(),
        file_name: format!(
            "{}.{}",
            if stem.is_empty() { fallback } else { &stem },
            extension
        ),
    })
}

fn decode_edit_uploads(
    request: &ImageGenerateRequest,
) -> Result<(Vec<ImageUpload>, Option<ImageUpload>), AppError> {
    let images = request
        .input_images
        .iter()
        .map(|input| decode_upload(input, false))
        .collect::<Result<Vec<_>, _>>()?;
    let mask = request
        .mask_image
        .as_ref()
        .map(|input| decode_upload(input, true))
        .transpose()?;
    let total = images.iter().map(|image| image.bytes.len()).sum::<usize>()
        + mask.as_ref().map_or(0, |image| image.bytes.len());
    if total > MAX_INPUT_TOTAL_BYTES {
        return Err(AppError::invalid(
            "image_inputs_too_large",
            "上传图片总大小不能超过 50 MB",
        ));
    }
    if mask.is_some()
        && images
            .first()
            .is_some_and(|image| image.mime_type != "image/png")
    {
        return Err(AppError::invalid(
            "invalid_inpaint_format",
            "局部重绘的原图和蒙版需要统一为 PNG 格式",
        ));
    }
    Ok((images, mask))
}

fn provider_size(size: &str) -> &'static str {
    match size {
        "landscape" => "1536x1024",
        "portrait" => "1024x1536",
        _ => "1024x1024",
    }
}

fn image_profile_config(
    conn: &Connection,
    profile_id: &str,
) -> Result<(String, String, String, String), AppError> {
    conn.query_row(
        "SELECT provider.base_url,profile.model,provider.api_key,provider.endpoint_type
         FROM model_profiles profile JOIN model_providers provider ON provider.id=profile.provider_id
         WHERE profile.id=?1 AND profile.image_enabled=1",
        params![profile_id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        },
    )
    .optional()
    .map_err(AppError::db)?
    .ok_or_else(|| AppError::not_found("image_model_not_found", "图片模型不存在"))
}

pub fn init_schema(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS image_generations (
           id TEXT PRIMARY KEY,
           task_id TEXT NOT NULL UNIQUE,
           prompt TEXT NOT NULL,
           mode TEXT NOT NULL DEFAULT 'generate',
           image_model_profile_id TEXT NOT NULL,
           size TEXT NOT NULL,
           count INTEGER NOT NULL,
           status TEXT NOT NULL,
           error_code TEXT,
           error_message TEXT,
           created_at TEXT NOT NULL,
           completed_at TEXT
         );
         CREATE INDEX IF NOT EXISTS idx_image_generations_created ON image_generations(created_at DESC);
         CREATE TABLE IF NOT EXISTS image_assets (
           id TEXT PRIMARY KEY,
           generation_id TEXT NOT NULL REFERENCES image_generations(id) ON DELETE CASCADE,
           relative_path TEXT NOT NULL UNIQUE,
           mime_type TEXT NOT NULL,
           byte_size INTEGER NOT NULL,
           width INTEGER,
           height INTEGER,
           created_at TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_image_assets_generation ON image_assets(generation_id);
        ",
    )
    .map_err(AppError::db)?;
    let has_mode = conn
        .prepare("PRAGMA table_info(image_generations)")
        .map_err(AppError::db)?
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(AppError::db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::db)?
        .iter()
        .any(|column| column == "mode");
    if !has_mode {
        conn.execute(
            "ALTER TABLE image_generations ADD COLUMN mode TEXT NOT NULL DEFAULT 'generate'",
            [],
        )
        .map_err(AppError::db)?;
    }
    Ok(())
}

#[tauri::command]
pub fn image_model_list(
    state: State<'_, AppState>,
) -> Result<Vec<crate::ModelProfileDto>, AppError> {
    Ok(crate::commands::model_list(state)?
        .into_iter()
        .filter(|model| model.image_enabled)
        .collect())
}

async fn bounded_response_bytes(
    response: reqwest::Response,
    limit: usize,
) -> Result<Vec<u8>, AppError> {
    if response
        .content_length()
        .is_some_and(|length| length > limit as u64)
    {
        return Err(AppError::Operation {
            code: "image_response_too_large".into(),
            message: "图片服务返回内容过大".into(),
        });
    }
    let mut stream = response.bytes_stream();
    let mut bytes = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| AppError::Operation {
            code: "provider_response_failed".into(),
            message: "读取图片服务响应失败".into(),
        })?;
        if bytes.len() + chunk.len() > limit {
            return Err(AppError::Operation {
                code: "image_response_too_large".into(),
                message: "图片服务返回内容过大".into(),
            });
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn detect_mime(bytes: &[u8], header: Option<&str>) -> Option<&'static str> {
    let from_header = header.and_then(|value| {
        let value = value.split(';').next()?.trim().to_ascii_lowercase();
        match value.as_str() {
            "image/png" => Some("image/png"),
            "image/jpeg" | "image/jpg" => Some("image/jpeg"),
            "image/webp" => Some("image/webp"),
            "image/gif" => Some("image/gif"),
            _ => None,
        }
    });
    from_header.or_else(|| {
        if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            Some("image/png")
        } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
            Some("image/jpeg")
        } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
            Some("image/webp")
        } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
            Some("image/gif")
        } else {
            None
        }
    })
}

async fn decode_image_item(client: &reqwest::Client, item: &Value) -> Result<ImageBytes, AppError> {
    if let Some(encoded) = item.get("b64_json").and_then(Value::as_str) {
        let bytes = BASE64.decode(encoded).map_err(|_| AppError::Operation {
            code: "provider_response_invalid".into(),
            message: "图片服务返回了无效的 Base64 图片".into(),
        })?;
        if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES {
            return Err(AppError::Operation {
                code: "image_response_too_large".into(),
                message: "生成图片大小不受支持".into(),
            });
        }
        let mime_type = detect_mime(&bytes, item.get("mime_type").and_then(Value::as_str))
            .ok_or_else(|| AppError::Operation {
                code: "provider_response_invalid".into(),
                message: "生成结果不是支持的图片格式".into(),
            })?;
        return Ok(ImageBytes {
            bytes,
            mime_type: mime_type.into(),
        });
    }
    let url = item
        .get("url")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::Operation {
            code: "provider_response_invalid".into(),
            message: "图片服务没有返回图片内容".into(),
        })?;
    let parsed = reqwest::Url::parse(url).map_err(|_| AppError::Operation {
        code: "provider_response_invalid".into(),
        message: "图片服务返回了无效地址".into(),
    })?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(AppError::Operation {
            code: "provider_response_invalid".into(),
            message: "图片服务返回了不安全地址".into(),
        });
    }
    let response = client
        .get(parsed)
        .send()
        .await
        .map_err(|_| AppError::Operation {
            code: "image_download_failed".into(),
            message: "下载生成图片失败".into(),
        })?;
    let header = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let bytes = bounded_response_bytes(response, MAX_IMAGE_BYTES).await?;
    let mime_type = detect_mime(&bytes, header.as_deref()).ok_or_else(|| AppError::Operation {
        code: "provider_response_invalid".into(),
        message: "下载的生成结果不是支持的图片格式".into(),
    })?;
    Ok(ImageBytes {
        bytes,
        mime_type: mime_type.into(),
    })
}

fn extension_for_mime(mime_type: &str) -> &'static str {
    match mime_type {
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "png",
    }
}

fn image_dto_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ImageAssetDto> {
    Ok(ImageAssetDto {
        id: row.get(0)?,
        generation_id: row.get(1)?,
        relative_path: row.get(2)?,
        mime_type: row.get(3)?,
        byte_size: row.get(4)?,
        width: row.get::<_, Option<i64>>(5)?.map(|value| value as u32),
        height: row.get::<_, Option<i64>>(6)?.map(|value| value as u32),
        created_at: row.get(7)?,
        data_uri: None,
    })
}

fn load_assets(conn: &Connection, generation_id: &str) -> Result<Vec<ImageAssetDto>, AppError> {
    conn.prepare(
        "SELECT id,generation_id,relative_path,mime_type,byte_size,width,height,created_at
         FROM image_assets WHERE generation_id=?1 ORDER BY created_at,id",
    )
    .map_err(AppError::db)?
    .query_map(params![generation_id], image_dto_from_row)
    .map_err(AppError::db)?
    .collect::<Result<Vec<_>, _>>()
    .map_err(AppError::db)
}

type GenerationRow = (
    String,
    String,
    String,
    String,
    String,
    String,
    i64,
    String,
    Option<String>,
    Option<String>,
    String,
    Option<String>,
);

fn generation_rows(conn: &Connection, limit: u32) -> Result<Vec<GenerationRow>, AppError> {
    let mut statement = conn
        .prepare("SELECT id,task_id,prompt,mode,image_model_profile_id,size,count,status,error_code,error_message,created_at,completed_at FROM image_generations ORDER BY created_at DESC LIMIT ?1")
        .map_err(AppError::db)?;
    let mapped = statement
        .query_map(params![limit.min(500)], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, Option<String>>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, Option<String>>(11)?,
            ))
        })
        .map_err(AppError::db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::db)?;
    Ok(mapped)
}

pub(crate) fn list_generations(
    conn: &Connection,
    limit: u32,
) -> Result<Vec<ImageGenerationDto>, AppError> {
    generation_rows(conn, limit)?
        .into_iter()
        .map(
            |(
                id,
                task_id,
                prompt,
                mode,
                model_id,
                size,
                count,
                status,
                error_code,
                error_message,
                created_at,
                completed_at,
            )| {
                Ok(ImageGenerationDto {
                    assets: load_assets(conn, &id)?,
                    id,
                    task_id,
                    prompt,
                    mode,
                    image_model_profile_id: model_id,
                    size,
                    count: count as u8,
                    status,
                    error_code,
                    error_message,
                    created_at,
                    completed_at,
                })
            },
        )
        .collect()
}

pub(crate) fn backup_data(
    state: &AppState,
    conn: &Connection,
) -> Result<(Vec<ImageGenerationDto>, Vec<BackupImageAssetDto>), AppError> {
    let generations = list_generations(conn, 500)?;
    let assets = conn
        .prepare(
            "SELECT id,generation_id,relative_path,mime_type,byte_size,width,height,created_at
             FROM image_assets ORDER BY created_at,id",
        )
        .map_err(AppError::db)?
        .query_map([], image_dto_from_row)
        .map_err(AppError::db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::db)?
        .into_iter()
        .map(|asset| {
            let path = crate::commands::safe_path(
                &state.data_dir.join("attachments"),
                &asset.relative_path,
            )?;
            let content = fs::read(path).map_err(AppError::fs)?;
            Ok(BackupImageAssetDto {
                id: asset.id,
                generation_id: asset.generation_id,
                relative_path: asset.relative_path,
                mime_type: asset.mime_type,
                byte_size: asset.byte_size,
                width: asset.width,
                height: asset.height,
                created_at: asset.created_at,
                content_base64: BASE64.encode(content),
            })
        })
        .collect::<Result<Vec<_>, AppError>>()?;
    Ok((generations, assets))
}

pub(crate) fn insert_backup_data(
    transaction: &rusqlite::Transaction<'_>,
    generations: &[ImageGenerationDto],
    assets: &[BackupImageAssetDto],
) -> Result<(), AppError> {
    for generation in generations {
        transaction
            .execute(
                "INSERT INTO image_generations(id,task_id,prompt,mode,image_model_profile_id,size,count,status,error_code,error_message,created_at,completed_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
                params![
                    generation.id,
                    generation.task_id,
                    generation.prompt,
                    generation.mode,
                    generation.image_model_profile_id,
                    generation.size,
                    generation.count as i64,
                    generation.status,
                    generation.error_code,
                    generation.error_message,
                    generation.created_at,
                    generation.completed_at,
                ],
            )
            .map_err(AppError::db)?;
    }
    for asset in assets {
        transaction
            .execute(
                "INSERT INTO image_assets(id,generation_id,relative_path,mime_type,byte_size,width,height,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
                params![
                    asset.id,
                    asset.generation_id,
                    asset.relative_path,
                    asset.mime_type,
                    asset.byte_size as i64,
                    asset.width.map(|value| value as i64),
                    asset.height.map(|value| value as i64),
                    asset.created_at,
                ],
            )
            .map_err(AppError::db)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn image_generate(
    state: State<'_, AppState>,
    request: ImageGenerateRequest,
) -> Result<ImageGenerateResult, AppError> {
    let (prompt, count, mode) = validate_generation_request(&request)?;
    let (base_url, model, api_key, endpoint_type) = {
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::db("database lock poisoned"))?;
        image_profile_config(&conn, &request.image_model_profile_id)?
    };
    if !valid_endpoint_type(&endpoint_type) {
        return Err(AppError::invalid(
            "invalid_image_endpoint_type",
            "图片服务协议不受支持",
        ));
    }
    if api_key.trim().is_empty() {
        return Err(AppError::Operation {
            code: "api_key_not_configured".into(),
            message: "尚未配置图片模型 API Key".into(),
        });
    }
    let cancel = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    state
        .cancels
        .lock()
        .map_err(|_| AppError::db("cancel lock poisoned"))?
        .insert(request.request_id.clone(), cancel.clone());
    let result = async {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(180))
            .build()
            .map_err(|_| AppError::Operation {
                code: "provider_request_failed".into(),
                message: "无法创建图片生成请求".into(),
            })?;
        let response_result = if mode == "generate" {
            let body = json!({
                "model": model,
                "prompt": prompt,
                "size": provider_size(&request.size),
                "n": count
            });
            client
                .post(generations_endpoint(&base_url))
                .bearer_auth(&api_key)
                .header("Accept", "application/json")
                .json(&body)
                .send()
                .await
        } else {
            let (input_images, mask_image) = decode_edit_uploads(&request)?;
            let mut form = reqwest::multipart::Form::new()
                .text("model", model.clone())
                .text("prompt", prompt.clone())
                .text("size", provider_size(&request.size).to_string())
                .text("n", count.to_string());
            for image in input_images {
                let part = reqwest::multipart::Part::bytes(image.bytes)
                    .file_name(image.file_name)
                    .mime_str(&image.mime_type)
                    .map_err(|_| {
                        AppError::invalid("invalid_image_input", "上传图片格式无效")
                    })?;
                form = form.part("image[]", part);
            }
            if let Some(mask) = mask_image {
                let part = reqwest::multipart::Part::bytes(mask.bytes)
                    .file_name(mask.file_name)
                    .mime_str(&mask.mime_type)
                    .map_err(|_| AppError::invalid("invalid_image_mask", "蒙版格式无效"))?;
                form = form.part("mask", part);
            }
            client
                .post(edits_endpoint(&base_url))
                .bearer_auth(&api_key)
                .header("Accept", "application/json")
                .multipart(form)
                .send()
                .await
        };
        let response = response_result.map_err(|error| AppError::Operation {
                code: "provider_request_failed".into(),
                message: if error.is_timeout() {
                    "图片处理超时（180 秒）".into()
                } else {
                    "图片处理请求失败".into()
                },
            })?;
        let status = response.status();
        let bytes = bounded_response_bytes(response, MAX_RESPONSE_BYTES).await?;
        if !status.is_success() {
            let message = serde_json::from_slice::<Value>(&bytes)
                .ok()
                .and_then(|value| {
                    value
                        .pointer("/error/message")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .unwrap_or_else(|| format!("图片服务拒绝请求（HTTP {}）", status.as_u16()));
            return Err(AppError::Operation {
                code: "provider_request_failed".into(),
                message,
            });
        }
        let payload = serde_json::from_slice::<Value>(&bytes).map_err(|_| AppError::Operation {
            code: "provider_response_invalid".into(),
            message: "图片服务响应无法解析".into(),
        })?;
        let items = payload
            .get("data")
            .and_then(Value::as_array)
            .ok_or_else(|| AppError::Operation {
                code: "provider_response_invalid".into(),
                message: "图片服务没有返回生成结果".into(),
            })?;
        if items.is_empty() {
            return Err(AppError::Operation {
                code: "provider_response_invalid".into(),
                message: "图片服务返回了空结果".into(),
            });
        }
        let mut images = Vec::with_capacity(items.len());
        for item in items.iter().take(count as usize) {
            if cancel.load(Ordering::Relaxed) {
                return Err(AppError::Operation {
                    code: "image_generation_cancelled".into(),
                    message: "图片生成已取消".into(),
                });
            }
            images.push(decode_image_item(&client, item).await?);
        }
        let generation_id = Uuid::new_v4().to_string();
        let created_at = now();
        let attachments_root = state.data_dir.join("attachments");
        let generated_dir = attachments_root.join("generated-images");
        fs::create_dir_all(&generated_dir).map_err(AppError::fs)?;
        let mut assets = Vec::with_capacity(images.len());
        let mut persisted_paths = Vec::<PathBuf>::new();
        for image in images {
            let asset_id = Uuid::new_v4().to_string();
            let extension = extension_for_mime(&image.mime_type);
            let file_name = format!("{asset_id}.{extension}");
            let relative_path = format!("generated-images/{file_name}");
            let path = crate::commands::safe_path(&attachments_root, &relative_path)?;
            fs::write(&path, &image.bytes).map_err(AppError::fs)?;
            persisted_paths.push(path);
            assets.push(ImageAssetDto {
                id: asset_id,
                generation_id: generation_id.clone(),
                relative_path,
                mime_type: image.mime_type,
                byte_size: image.bytes.len() as u64,
                width: None,
                height: None,
                created_at: created_at.clone(),
                data_uri: None,
            });
        }
        let db_result = (|| -> Result<(), AppError> {
            let mut conn = state
                .db
                .lock()
                .map_err(|_| AppError::db("database lock poisoned"))?;
            let transaction = conn.transaction().map_err(AppError::db)?;
            transaction
                .execute(
                    "INSERT INTO image_generations(id,task_id,prompt,mode,image_model_profile_id,size,count,status,created_at,completed_at) VALUES(?1,?2,?3,?4,?5,?6,?7,'succeeded',?8,?8)",
                    params![generation_id, request.request_id, prompt, mode, request.image_model_profile_id, request.size, assets.len() as i64, created_at],
                )
                .map_err(AppError::db)?;
            for asset in &assets {
                transaction
                    .execute(
                        "INSERT INTO image_assets(id,generation_id,relative_path,mime_type,byte_size,width,height,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
                        params![asset.id, asset.generation_id, asset.relative_path, asset.mime_type, asset.byte_size as i64, asset.width.map(i64::from), asset.height.map(i64::from), asset.created_at],
                    )
                    .map_err(AppError::db)?;
            }
            transaction.commit().map_err(AppError::db)
        })();
        if db_result.is_err() {
            for path in persisted_paths {
                let _ = fs::remove_file(path);
            }
        }
        db_result?;
        Ok(ImageGenerateResult {
            generation_id,
            assets,
            usage: payload.get("usage").cloned(),
        })
    }
    .await;
    state
        .cancels
        .lock()
        .map_err(|_| AppError::db("cancel lock poisoned"))?
        .remove(&request.request_id);
    result
}

#[tauri::command]
pub fn image_cancel(state: State<'_, AppState>, request_id: String) -> Result<(), AppError> {
    if let Some(cancel) = state
        .cancels
        .lock()
        .map_err(|_| AppError::db("cancel lock poisoned"))?
        .get(&request_id)
    {
        cancel.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
pub fn image_generation_list(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> Result<Vec<ImageGenerationDto>, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    list_generations(&conn, limit.unwrap_or(100))
}

#[tauri::command]
pub fn image_asset_read(
    state: State<'_, AppState>,
    asset_id: String,
) -> Result<ImageAssetDto, AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    let mut asset = conn
        .query_row(
            "SELECT id,generation_id,relative_path,mime_type,byte_size,width,height,created_at FROM image_assets WHERE id=?1",
            params![asset_id],
            image_dto_from_row,
        )
        .map_err(|_| AppError::not_found("image_asset_not_found", "图片不存在"))?;
    let path =
        crate::commands::safe_path(&state.data_dir.join("attachments"), &asset.relative_path)?;
    let bytes = fs::read(path).map_err(AppError::fs)?;
    asset.data_uri = Some(format!(
        "data:{};base64,{}",
        asset.mime_type,
        BASE64.encode(bytes)
    ));
    Ok(asset)
}

#[tauri::command]
pub fn image_generation_delete(
    state: State<'_, AppState>,
    generation_id: String,
) -> Result<(), AppError> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::db("database lock poisoned"))?;
    let paths = conn
        .prepare("SELECT relative_path FROM image_assets WHERE generation_id=?1")
        .map_err(AppError::db)?
        .query_map(params![generation_id], |row| row.get::<_, String>(0))
        .map_err(AppError::db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::db)?;
    for relative_path in &paths {
        let path = crate::commands::safe_path(&state.data_dir.join("attachments"), relative_path)?;
        if path.exists() {
            fs::remove_file(path).map_err(AppError::fs)?;
        }
    }
    conn.execute(
        "DELETE FROM image_generations WHERE id=?1",
        params![generation_id],
    )
    .map_err(AppError::db)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG_DATA_URL: &str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

    fn input(name: &str) -> ImageInputDto {
        ImageInputDto {
            name: name.into(),
            mime_type: "image/png".into(),
            data_url: PNG_DATA_URL.into(),
        }
    }

    fn request(mode: &str) -> ImageGenerateRequest {
        ImageGenerateRequest {
            request_id: "request".into(),
            image_model_profile_id: "model".into(),
            prompt: "一只猫".into(),
            size: "square".into(),
            count: 1,
            mode: mode.into(),
            input_images: Vec::new(),
            mask_image: None,
        }
    }

    #[test]
    fn normalizes_image_endpoint_without_dropping_v1() {
        assert_eq!(
            generations_endpoint("https://example.com/v1"),
            "https://example.com/v1/images/generations"
        );
        assert_eq!(
            generations_endpoint("https://example.com/v1/images/generations"),
            "https://example.com/v1/images/generations"
        );
        assert_eq!(
            generations_endpoint("https://example.com/v1/images/edits"),
            "https://example.com/v1/images/generations"
        );
        assert_eq!(
            edits_endpoint("https://example.com/v1/images/edits"),
            "https://example.com/v1/images/edits"
        );
        assert_eq!(
            edits_endpoint("https://example.com/v1"),
            "https://example.com/v1/images/edits"
        );
    }

    #[test]
    fn maps_stable_sizes_to_provider_sizes() {
        assert_eq!(provider_size("square"), "1024x1024");
        assert_eq!(provider_size("landscape"), "1536x1024");
        assert_eq!(provider_size("portrait"), "1024x1536");
    }

    #[test]
    fn detects_supported_image_signatures() {
        assert_eq!(
            detect_mime(b"\x89PNG\r\n\x1a\nrest", None),
            Some("image/png")
        );
        assert_eq!(
            detect_mime(&[0xff, 0xd8, 0xff, 1], None),
            Some("image/jpeg")
        );
        assert_eq!(detect_mime(b"RIFFxxxxWEBP", None), Some("image/webp"));
    }

    #[test]
    fn validates_inputs_for_each_image_mode() {
        let mut reference = request("reference");
        assert!(validate_generation_request(&reference).is_err());
        reference.input_images.push(input("reference.png"));
        assert_eq!(
            validate_generation_request(&reference).unwrap().2,
            "reference"
        );

        let mut edit = request("edit");
        edit.input_images.push(input("source.png"));
        assert_eq!(validate_generation_request(&edit).unwrap().2, "edit");

        let mut inpaint = request("inpaint");
        inpaint.input_images.push(input("source.png"));
        assert!(validate_generation_request(&inpaint).is_err());
        inpaint.mask_image = Some(input("mask.png"));
        assert_eq!(validate_generation_request(&inpaint).unwrap().2, "inpaint");
        let (images, mask) = decode_edit_uploads(&inpaint).unwrap();
        assert_eq!(images.len(), 1);
        assert!(mask.is_some());
    }

    #[test]
    fn migrates_existing_generation_table_with_mode() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE image_generations (
               id TEXT PRIMARY KEY,
               task_id TEXT NOT NULL UNIQUE,
               prompt TEXT NOT NULL,
               image_model_profile_id TEXT NOT NULL,
               size TEXT NOT NULL,
               count INTEGER NOT NULL,
               status TEXT NOT NULL,
               error_code TEXT,
               error_message TEXT,
               created_at TEXT NOT NULL,
               completed_at TEXT
             );",
        )
        .unwrap();
        init_schema(&conn).unwrap();
        let columns = conn
            .prepare("PRAGMA table_info(image_generations)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert!(columns.iter().any(|column| column == "mode"));
    }
}
