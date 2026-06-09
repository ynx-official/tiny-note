use std::fs;
use std::path::PathBuf;
use chrono::Local;
use rusqlite::params;
use uuid::Uuid;

use super::Database;
use crate::services::models::Note;

impl Database {
    pub fn import_md_file(&self, path: &str) -> Result<Note, String> {
        let content = fs::read_to_string(path).map_err(|e| format!("Failed to read file: {}", e))?;
        let (title, body) = if content.starts_with("# ") {
            let end = content.find('\n').unwrap_or(content.len());
            (content[2..end].trim().to_string(), content[end..].trim_start().to_string())
        } else {
            (String::new(), content)
        };
        self.create_note(&title, &body, vec![], None)
    }

    pub fn import_html_file(&self, path: &str) -> Result<Note, String> {
        let html_content = fs::read_to_string(path).map_err(|e| format!("Failed to read file: {}", e))?;
        // Simple HTML to text: strip tags
        let mut text = String::new();
        let mut in_tag = false;
        let mut in_script_style = false;
        for ch in html_content.chars() {
            match ch {
                '<' => {
                    in_tag = true;
                    if html_content.contains("<script") || html_content.contains("<style") {
                        in_script_style = true;
                    }
                }
                '>' => {
                    in_tag = false;
                    if html_content.contains("</script>") || html_content.contains("</style>") {
                        in_script_style = false;
                    }
                }
                _ if !in_tag && !in_script_style => text.push(ch),
                _ => {}
            }
        }
        // Extract title from <title> tag or first line
        let title = if let Some(start) = html_content.find("<title>") {
            let start = start + 7;
            if let Some(end) = html_content[start..].find("</title>") {
                html_content[start..start + end].trim().to_string()
            } else {
                String::new()
            }
        } else {
            text.lines().next().unwrap_or("").trim().to_string()
        };
        let body = text.trim().to_string();
        self.create_note(&title, &body, vec![], None)
    }

    pub fn export_note_as_md(&self, id: &str, dest_dir: &str) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let (title, content): (String, String) = conn.query_row(
            "SELECT title, content FROM notes WHERE id = ?1", params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|e| format!("Note not found: {}", e))?;

        let display_title = if title.is_empty() { "无标题笔记" } else { &title };
        let full_content = if title.is_empty() { content } else { format!("# {}\n\n{}", title, content) };

        let dest = PathBuf::from(dest_dir);
        fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
        let file_path = Self::export_path(&dest, display_title, "md", "md");
        fs::write(&file_path, &full_content).map_err(|e| e.to_string())?;
        Ok(file_path.to_string_lossy().to_string())
    }

    pub fn export_note_as_html(&self, id: &str, dest_dir: &str) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let (title, content, created_at, updated_at): (String, String, String, String) = conn.query_row(
            "SELECT title, content, created_at, updated_at FROM notes WHERE id = ?1", params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        ).map_err(|e| format!("Note not found: {}", e))?;

        use pulldown_cmark::{Parser, Options, html};
        let mut options = Options::empty();
        options.insert(Options::ENABLE_TABLES);
        options.insert(Options::ENABLE_STRIKETHROUGH);
        options.insert(Options::ENABLE_TASKLISTS);
        let parser = Parser::new_ext(&content, options);
        let mut html_content = String::new();
        html::push_html(&mut html_content, parser);

        let display_title = if title.is_empty() { "无标题笔记" } else { &title };
        let html_doc = format!(
            r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #333; line-height: 1.7; }}
h1 {{ border-bottom: 2px solid #eee; padding-bottom: 10px; }}
h2, h3, h4 {{ margin-top: 1.5em; }}
code {{ background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }}
pre {{ background: #f5f5f5; padding: 16px; border-radius: 6px; overflow-x: auto; }}
pre code {{ background: none; padding: 0; }}
blockquote {{ border-left: 4px solid #ddd; margin: 0; padding: 10px 20px; color: #666; }}
table {{ border-collapse: collapse; width: 100%; }}
th, td {{ border: 1px solid #ddd; padding: 8px 12px; text-align: left; }}
th {{ background: #f5f5f5; }}
img {{ max-width: 100%; }}
hr {{ border: none; border-top: 1px solid #eee; margin: 2em 0; }}
.meta {{ color: #999; font-size: 0.85em; margin-bottom: 2em; }}
</style>
</head>
<body>
<h1>{title}</h1>
<div class="meta">创建时间：{created_at} | 更新时间：{updated_at}</div>
{content}
</body>
</html>"#,
            title = display_title,
            created_at = created_at,
            updated_at = updated_at,
            content = html_content,
        );

        let dest = PathBuf::from(dest_dir);
        fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
        let file_path = Self::export_path(&dest, display_title, "html", "html");
        fs::write(&file_path, &html_doc).map_err(|e| e.to_string())?;
        Ok(file_path.to_string_lossy().to_string())
    }

    pub fn export_note_as_txt(&self, id: &str, dest_dir: &str) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let (title, content): (String, String) = conn.query_row(
            "SELECT title, content FROM notes WHERE id = ?1", params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|e| format!("Note not found: {}", e))?;

        let display_title = if title.is_empty() { "无标题笔记" } else { &title };
        let full_content = if title.is_empty() { content } else { format!("{}\n\n{}", title, content) };

        let dest = PathBuf::from(dest_dir);
        fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
        let file_path = dest.join(Self::export_filename(display_title, "txt", "txt"));
        fs::write(&file_path, &full_content).map_err(|e| e.to_string())?;
        Ok(file_path.to_string_lossy().to_string())
    }

    pub fn export_note_as_pdf(&self, id: &str, dest_dir: &str, watermark: &str, watermark_opacity: f32) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let (title, content, created_at, updated_at): (String, String, String, String) = conn.query_row(
            "SELECT title, content, created_at, updated_at FROM notes WHERE id = ?1", params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        ).map_err(|e| format!("Note not found: {}", e))?;
        drop(conn);

        let display_title = if title.is_empty() { "无标题笔记".to_string() } else { title.clone() };
        let dest = PathBuf::from(dest_dir);
        fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
        let file_path = Self::export_path(&dest, &display_title, "pdf", "pdf");
        let temp_html = dest.join(format!("kova_pdf_{}.html", Uuid::new_v4()));
        let html = Self::render_note_html(&display_title, &content, &created_at, &updated_at, watermark, watermark_opacity);

        fs::write(&temp_html, html).map_err(|e| e.to_string())?;
        let print_result = Self::print_html_to_pdf(&temp_html, &file_path);
        let _ = fs::remove_file(&temp_html);
        if let Err(error) = print_result {
            let _ = fs::remove_file(&file_path);
            return Err(error);
        }
        Ok(file_path.to_string_lossy().to_string())
    }

    fn render_note_html(title: &str, content: &str, created_at: &str, updated_at: &str, watermark: &str, watermark_opacity: f32) -> String {
        use pulldown_cmark::{html, Options, Parser};
        let mut options = Options::empty();
        options.insert(Options::ENABLE_TABLES);
        options.insert(Options::ENABLE_STRIKETHROUGH);
        options.insert(Options::ENABLE_TASKLISTS);
        let parser = Parser::new_ext(content, options);
        let mut html_content = String::new();
        html::push_html(&mut html_content, parser);

        let escaped_title = Self::escape_html(title);
        let watermark = watermark.trim();
        let watermark_html = if watermark.is_empty() {
            String::new()
        } else {
            format!(
                r#"<div class="pdf-watermark" style="opacity: {:.3};">{}</div>"#,
                watermark_opacity.clamp(0.02, 0.6),
                Self::escape_html(watermark),
            )
        };

        format!(
            r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>
@page {{ size: A4; margin: 20mm 18mm; }}
* {{ box-sizing: border-box; }}
html {{ background: #ffffff; }}
body {{
  margin: 0;
  color: #25211d;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "Noto Sans SC", Arial, sans-serif;
  font-size: 14px;
  line-height: 1.78;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}}
.article {{ max-width: 780px; margin: 0 auto; position: relative; z-index: 1; }}
.title {{ margin: 0 0 8px; font-size: 28px; line-height: 1.28; letter-spacing: -0.02em; color: #16120f; }}
.meta {{ color: #8a8177; font-size: 12px; margin-bottom: 28px; padding-bottom: 14px; border-bottom: 1px solid #e9e1d8; }}
h1, h2, h3, h4, h5, h6 {{ color: #16120f; line-height: 1.35; margin: 1.45em 0 0.65em; page-break-after: avoid; }}
h1 {{ font-size: 24px; padding-bottom: 8px; border-bottom: 1px solid #eadfd4; }}
h2 {{ font-size: 21px; }}
h3 {{ font-size: 18px; }}
h4, h5, h6 {{ font-size: 16px; }}
p {{ margin: 0.8em 0; }}
ul, ol {{ margin: 0.75em 0 0.75em 1.45em; padding: 0; }}
li {{ margin: 0.24em 0; }}
li > p {{ margin: 0.2em 0; }}
a {{ color: #8b5e34; text-decoration: none; }}
strong {{ color: #17120e; font-weight: 700; }}
blockquote {{ margin: 1em 0; padding: 10px 16px; border-left: 4px solid #d3b892; color: #6f6258; background: #fbf7f1; border-radius: 0 10px 10px 0; }}
code {{ background: #f3eee8; color: #5b3922; padding: 2px 5px; border-radius: 5px; font-family: "Cascadia Code", Consolas, "Courier New", monospace; font-size: 0.92em; }}
pre {{ margin: 1em 0; padding: 14px 16px; background: #f7f2ec; border: 1px solid #eadfd3; border-radius: 12px; overflow: hidden; page-break-inside: avoid; }}
pre code {{ display: block; padding: 0; background: transparent; color: #2b2825; white-space: pre-wrap; word-break: break-word; }}
table {{ width: 100%; border-collapse: collapse; margin: 1em 0; page-break-inside: avoid; font-size: 13px; }}
th, td {{ border: 1px solid #e0d5ca; padding: 8px 10px; text-align: left; vertical-align: top; }}
th {{ background: #f4eee7; color: #2a211a; font-weight: 700; }}
tr:nth-child(even) td {{ background: #fdfaf6; }}
hr {{ border: none; border-top: 1px solid #e7ded4; margin: 2em 0; }}
img {{ max-width: 100%; border-radius: 10px; }}
input[type="checkbox"] {{ margin-right: 6px; }}
.pdf-watermark {{
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 0;
  transform: translate(-50%, -50%) rotate(-32deg);
  transform-origin: center;
  color: #222;
  font-size: 72px;
  font-weight: 800;
  letter-spacing: 0.08em;
  white-space: nowrap;
  pointer-events: none;
}}
@media print {{
  .article {{ z-index: 1; }}
  pre, blockquote, table {{ break-inside: avoid; }}
}}
</style>
</head>
<body>
{watermark}
<main class="article">
<h1 class="title">{title}</h1>
<div class="meta">创建时间：{created_at} &nbsp;|&nbsp; 更新时间：{updated_at}</div>
{content}
</main>
</body>
</html>"#,
            title = escaped_title,
            created_at = Self::escape_html(created_at),
            updated_at = Self::escape_html(updated_at),
            content = html_content,
            watermark = watermark_html,
        )
    }

    fn print_html_to_pdf(html_path: &PathBuf, pdf_path: &PathBuf) -> Result<(), String> {
        let browser = Self::find_pdf_browser().ok_or("未找到可用于 HTML 转 PDF 的 Edge 或 Chrome")?;
        let html_uri = Self::file_uri(html_path);
        let pdf_arg = format!("--print-to-pdf={}", pdf_path.to_string_lossy());
        let attempts = ["--headless=new", "--headless"];

        let mut last_error = String::new();
        for headless_arg in attempts {
            let output = Self::run_pdf_browser_with_timeout(
                &browser,
                &[
                    headless_arg,
                    "--disable-gpu",
                    "--disable-extensions",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--run-all-compositor-stages-before-draw",
                    "--virtual-time-budget=1000",
                    "--print-to-pdf-no-header",
                    "--no-pdf-header-footer",
                    &pdf_arg,
                    &html_uri,
                ],
                std::time::Duration::from_secs(60),
            )?;
            if output.status.success() && pdf_path.exists() {
                return Ok(());
            }
            last_error = String::from_utf8_lossy(&output.stderr).trim().to_string();
        }

        Err(if last_error.is_empty() { "HTML 转 PDF 失败".to_string() } else { format!("HTML 转 PDF 失败: {}", last_error) })
    }

    fn run_pdf_browser_with_timeout(browser: &PathBuf, args: &[&str], timeout: std::time::Duration) -> Result<std::process::Output, String> {
        use std::process::{Command, Stdio};
        use std::thread;
        use std::time::{Duration, Instant};

        let mut child = Command::new(browser)
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("启动浏览器失败: {}", e))?;
        let start = Instant::now();

        loop {
            if child.try_wait().map_err(|e| format!("读取浏览器状态失败: {}", e))?.is_some() {
                return child.wait_with_output().map_err(|e| format!("读取浏览器输出失败: {}", e));
            }
            if start.elapsed() >= timeout {
                let _ = child.kill();
                let _ = child.wait();
                return Err("HTML 转 PDF 超时，请检查浏览器或导出内容".to_string());
            }
            thread::sleep(Duration::from_millis(100));
        }
    }

    fn find_pdf_browser() -> Option<PathBuf> {
        let mut candidates = Vec::new();
        if let Ok(program_files) = std::env::var("PROGRAMFILES") {
            candidates.push(PathBuf::from(&program_files).join("Microsoft/Edge/Application/msedge.exe"));
            candidates.push(PathBuf::from(&program_files).join("Google/Chrome/Application/chrome.exe"));
        }
        if let Ok(program_files_x86) = std::env::var("PROGRAMFILES(X86)") {
            candidates.push(PathBuf::from(&program_files_x86).join("Microsoft/Edge/Application/msedge.exe"));
            candidates.push(PathBuf::from(&program_files_x86).join("Google/Chrome/Application/chrome.exe"));
        }
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            candidates.push(PathBuf::from(&local_app_data).join("Microsoft/Edge/Application/msedge.exe"));
            candidates.push(PathBuf::from(&local_app_data).join("Google/Chrome/Application/chrome.exe"));
        }
        candidates.into_iter().find(|path| path.exists()).or_else(|| Some(PathBuf::from("msedge")))
    }

    fn file_uri(path: &PathBuf) -> String {
        format!("file:///{}", path.to_string_lossy().replace('\\', "/"))
    }

    fn escape_html(value: &str) -> String {
        value
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&#39;")
    }

    fn export_path(dest: &PathBuf, title: &str, export_type: &str, extension: &str) -> PathBuf {
        let base = Self::export_filename(title, export_type, extension);
        let path = dest.join(&base);
        if !path.exists() {
            return path;
        }

        let stem = base.trim_end_matches(&format!(".{}", extension));
        for i in 1.. {
            let candidate = dest.join(format!("{}_{}.{}", stem, i, extension));
            if !candidate.exists() {
                return candidate;
            }
        }
        unreachable!()
    }

    fn export_filename(title: &str, export_type: &str, extension: &str) -> String {
        let date = Local::now().format("%y%m%d");
        let random = Uuid::new_v4().simple().to_string()[..4].to_string();
        format!("{}_{}_{}_{}.{}", Self::safe_filename(title), export_type, date, random, extension)
    }

    fn safe_filename(title: &str) -> String {
        let name = if title.is_empty() { "note" } else { title };
        let safe: String = name.chars().take(40).filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '-' || *c == '_').collect();
        let safe = safe.trim().to_string();
        if safe.is_empty() { "note".to_string() } else { safe }
    }
}
