use futures_util::StreamExt;
use reqwest::Url;
use semver::Version;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf, process::Command};

const MANIFEST_URL: &str =
    "https://github.com/ynx-official/tiny-note/releases/latest/download/update-manifest.json";
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub supported: bool,
    pub available: bool,
    pub version: String,
    pub notes: String,
    pub asset_name: Option<String>,
    pub size: Option<u64>,
    pub digest: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdateManifest {
    schema_version: u32,
    version: String,
    #[serde(default)]
    notes: String,
    assets: Vec<ManifestAsset>,
}

#[derive(Debug, Clone, Deserialize)]
struct ManifestAsset {
    name: String,
    url: String,
    size: u64,
    digest: String,
}

fn operation_error(message: impl Into<String>) -> crate::AppError {
    crate::AppError::Operation {
        code: "update_error".into(),
        message: message.into(),
    }
}

fn parse_version(value: &str) -> Result<Version, crate::AppError> {
    Version::parse(value.trim()).map_err(|_| operation_error(format!("无效的更新版本：{value}")))
}

fn validate_manifest(manifest: &UpdateManifest) -> Result<Version, crate::AppError> {
    if manifest.schema_version != 1 {
        return Err(operation_error("不支持的更新清单版本"));
    }
    let version = parse_version(&manifest.version)?;
    if manifest.assets.is_empty() {
        return Err(operation_error("更新清单没有可用安装包"));
    }
    for asset in &manifest.assets {
        let url = Url::parse(&asset.url).map_err(|_| operation_error("更新地址无效"))?;
        if url.scheme() != "https" || url.host_str() != Some("github.com") {
            return Err(operation_error(format!(
                "更新资产地址不受信任：{}",
                asset.name
            )));
        }
        if !asset.digest.starts_with("sha256:") || asset.digest.len() != 71 {
            return Err(operation_error(format!(
                "更新资产缺少有效 SHA-256：{}",
                asset.name
            )));
        }
    }
    Ok(version)
}

fn arch_matches(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    match std::env::consts::ARCH {
        "aarch64" => name.contains("aarch64") || name.contains("arm64"),
        "x86_64" => name.contains("x86_64") || name.contains("x64") || name.contains("amd64"),
        _ => name.contains(std::env::consts::ARCH),
    }
}

fn select_asset(assets: &[ManifestAsset]) -> Option<ManifestAsset> {
    let extension = if cfg!(target_os = "windows") {
        ".exe"
    } else if cfg!(target_os = "macos") {
        ".dmg"
    } else {
        ".appimage"
    };
    assets
        .iter()
        .find(|asset| {
            let name = asset.name.to_ascii_lowercase();
            name.ends_with(extension) && (arch_matches(&name) || name.contains("universal"))
        })
        .cloned()
}

async fn fetch_manifest() -> Result<UpdateManifest, crate::AppError> {
    let response = reqwest::Client::builder()
        .user_agent(format!("tiny-note/{CURRENT_VERSION}"))
        .build()
        .map_err(|error| operation_error(format!("创建更新请求失败：{error}")))?
        .get(MANIFEST_URL)
        .send()
        .await
        .map_err(|error| operation_error(format!("获取更新清单失败：{error}")))?
        .error_for_status()
        .map_err(|error| operation_error(format!("更新清单返回错误：{error}")))?;
    response
        .json()
        .await
        .map_err(|error| operation_error(format!("解析更新清单失败：{error}")))
}

#[tauri::command]
pub async fn app_update_check() -> Result<UpdateCheckResult, crate::AppError> {
    let manifest = fetch_manifest().await?;
    let latest = validate_manifest(&manifest)?;
    let current = parse_version(CURRENT_VERSION)?;
    if latest <= current {
        return Ok(UpdateCheckResult {
            supported: true,
            available: false,
            version: latest.to_string(),
            notes: manifest.notes,
            asset_name: None,
            size: None,
            digest: None,
        });
    }
    let asset = select_asset(&manifest.assets)
        .ok_or_else(|| operation_error("没有匹配当前平台的安装包"))?;
    Ok(UpdateCheckResult {
        supported: true,
        available: true,
        version: latest.to_string(),
        notes: manifest.notes,
        asset_name: Some(asset.name),
        size: Some(asset.size),
        digest: Some(asset.digest),
    })
}

fn verify_digest(bytes: &[u8], expected: &str) -> Result<(), crate::AppError> {
    let expected = expected
        .strip_prefix("sha256:")
        .ok_or_else(|| operation_error("更新清单不是 SHA-256 摘要"))?;
    if expected.len() != 64 || !expected.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(operation_error("更新清单包含无效摘要"));
    }
    let actual = Sha256::digest(bytes);
    let actual = actual
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    if !actual.eq_ignore_ascii_case(expected) {
        return Err(operation_error("更新包 SHA-256 校验失败"));
    }
    Ok(())
}

fn launch_installer(path: &PathBuf) -> Result<(), crate::AppError> {
    #[cfg(target_os = "windows")]
    let result = Command::new(path).spawn();
    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(path).spawn();
    #[cfg(target_os = "linux")]
    let result = Command::new("xdg-open").arg(path).spawn();
    result
        .map(|_| ())
        .map_err(|error| operation_error(format!("打开更新安装包失败：{error}")))
}

#[tauri::command]
pub async fn app_update_download(
    asset_name: String,
    version: String,
) -> Result<(), crate::AppError> {
    let manifest = fetch_manifest().await?;
    let latest = validate_manifest(&manifest)?;
    if latest != parse_version(&version)? {
        return Err(operation_error("更新版本已变化，请重新检查更新"));
    }
    let asset = manifest
        .assets
        .into_iter()
        .find(|asset| asset.name == asset_name)
        .ok_or_else(|| operation_error("更新资产不存在"))?;
    let response = reqwest::Client::new()
        .get(&asset.url)
        .send()
        .await
        .map_err(|error| operation_error(format!("下载更新失败：{error}")))?
        .error_for_status()
        .map_err(|error| operation_error(format!("更新下载返回错误：{error}")))?;
    let mut stream = response.bytes_stream();
    let mut bytes = Vec::new();
    while let Some(chunk) = stream.next().await {
        bytes.extend_from_slice(
            &chunk.map_err(|error| operation_error(format!("读取更新失败：{error}")))?,
        );
        if bytes.len() as u64 > asset.size.max(1) * 2 {
            return Err(operation_error("更新包大小异常"));
        }
    }
    if bytes.len() as u64 != asset.size {
        return Err(operation_error("更新包大小校验失败"));
    }
    verify_digest(&bytes, &asset.digest)?;
    let filename = asset.name.replace(['/', '\\'], "_");
    let path = std::env::temp_dir().join(format!("tiny-note-update-{version}-{filename}"));
    fs::write(&path, bytes).map_err(|error| operation_error(format!("保存更新包失败：{error}")))?;
    launch_installer(&path)
}

#[cfg(test)]
mod tests {
    use super::{select_asset, verify_digest, ManifestAsset, UpdateManifest};

    #[test]
    fn accepts_matching_sha256_digest() {
        let digest = format!("sha256:{}", hex_for(b"tiny-note"));
        verify_digest(b"tiny-note", &digest).expect("matching digest should pass");
    }

    #[test]
    fn rejects_mismatched_sha256_digest() {
        let error = verify_digest(b"tiny-note", &format!("sha256:{}", "0".repeat(64)))
            .expect_err("mismatched digest should fail");
        assert!(matches!(error, crate::AppError::Operation { code, .. } if code == "update_error"));
    }

    #[test]
    fn rejects_unknown_manifest_schema() {
        let manifest = UpdateManifest {
            schema_version: 2,
            version: "0.1.2".into(),
            notes: String::new(),
            assets: Vec::new(),
        };
        assert!(super::validate_manifest(&manifest).is_err());
    }

    #[test]
    fn rejects_an_installer_for_a_different_architecture() {
        let extension = if cfg!(target_os = "windows") {
            ".exe"
        } else if cfg!(target_os = "macos") {
            ".dmg"
        } else {
            ".appimage"
        };
        let wrong_arch = if std::env::consts::ARCH == "aarch64" {
            "x64"
        } else {
            "aarch64"
        };
        let asset = ManifestAsset {
            name: format!("Tiny Note_0.2.0_{wrong_arch}{extension}"),
            url: "https://github.com/example/update".into(),
            size: 1,
            digest: format!("sha256:{}", "0".repeat(64)),
        };

        assert!(select_asset(&[asset]).is_none());
    }

    #[test]
    fn accepts_an_explicitly_universal_installer() {
        let extension = if cfg!(target_os = "windows") {
            ".exe"
        } else if cfg!(target_os = "macos") {
            ".dmg"
        } else {
            ".appimage"
        };
        let asset = ManifestAsset {
            name: format!("Tiny Note_0.2.0_universal{extension}"),
            url: "https://github.com/example/update".into(),
            size: 1,
            digest: format!("sha256:{}", "0".repeat(64)),
        };

        assert!(select_asset(&[asset]).is_some());
    }

    fn hex_for(bytes: &[u8]) -> String {
        use sha2::{Digest, Sha256};
        Sha256::digest(bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect()
    }
}
