use crate::{now, AppError, AppState};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Command, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};
use tauri::State;

const MCP_TIMEOUT: Duration = Duration::from_secs(12);
const MAX_MCP_OUTPUT_CHARS: usize = 12_000;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTool {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServer {
    pub id: String,
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub cached_tools: Vec<McpTool>,
    pub last_error: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerRequest {
    pub id: String,
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    pub enabled: bool,
}

fn default_enabled() -> bool {
    true
}

fn config_path(state: &AppState) -> PathBuf {
    state.data_dir.join("agent").join("mcp.json")
}

fn validate_id(id: &str) -> Result<(), AppError> {
    if id.is_empty()
        || id.len() > 48
        || !id
            .bytes()
            .all(|value| value.is_ascii_alphanumeric() || value == b'-' || value == b'_')
    {
        return Err(AppError::invalid(
            "invalid_mcp_server_id",
            "MCP server ID may only contain letters, numbers, - and _",
        ));
    }
    Ok(())
}

fn load_servers(state: &AppState) -> Result<Vec<McpServer>, AppError> {
    let path = config_path(state);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(path).map_err(AppError::fs)?;
    serde_json::from_str(&content).map_err(|error| {
        AppError::invalid(
            "invalid_mcp_config",
            &format!("Invalid MCP config: {error}"),
        )
    })
}

fn save_servers(state: &AppState, servers: &[McpServer]) -> Result<(), AppError> {
    let path = config_path(state);
    let parent = path
        .parent()
        .ok_or_else(|| AppError::fs("invalid MCP path"))?;
    fs::create_dir_all(parent).map_err(AppError::fs)?;
    let temporary = path.with_extension("json.tmp");
    let content = serde_json::to_string_pretty(servers).map_err(AppError::fs)?;
    fs::write(&temporary, content).map_err(AppError::fs)?;
    fs::rename(temporary, path).map_err(AppError::fs)
}

pub fn enabled_tool_summary(state: &AppState) -> Result<Vec<Value>, AppError> {
    Ok(load_servers(state)?
        .into_iter()
        .filter(|server| server.enabled)
        .flat_map(|server| {
            server.cached_tools.into_iter().map(move |tool| {
                json!({
                    "serverId": server.id,
                    "serverName": server.name,
                    "tool": tool.name,
                    "description": tool.description
                })
            })
        })
        .collect())
}

pub fn call_tool(
    state: &AppState,
    server_id: &str,
    tool_name: &str,
    arguments: &Value,
) -> Result<String, String> {
    let server = load_servers(state)
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|item| item.id == server_id && item.enabled)
        .ok_or_else(|| "MCP 服务不存在或未启用".to_string())?;
    if !server
        .cached_tools
        .iter()
        .any(|tool| tool.name == tool_name)
    {
        return Err("MCP 工具未经过发现或已不可用，请先刷新服务".into());
    }
    let result = request(
        &server,
        "tools/call",
        json!({"name":tool_name,"arguments":arguments}),
    )?;
    parse_tool_result(&result)
}

fn parse_tool_result(result: &Value) -> Result<String, String> {
    let text = result
        .get("content")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| result.to_string());
    let truncated = text.chars().take(MAX_MCP_OUTPUT_CHARS).collect::<String>();
    if result
        .get("isError")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return Err(format!("MCP 工具执行失败: {truncated}"));
    }
    Ok(truncated)
}

fn discover(server: &McpServer) -> Result<Vec<McpTool>, String> {
    let result = request(server, "tools/list", json!({}))?;
    let tools = result
        .get("tools")
        .and_then(Value::as_array)
        .ok_or_else(|| "MCP 服务没有返回 tools 数组".to_string())?;
    tools
        .iter()
        .map(|tool| {
            let name = tool
                .get("name")
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "MCP 工具缺少名称".to_string())?;
            Ok(McpTool {
                name: name.into(),
                description: tool
                    .get("description")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .into(),
                input_schema: tool
                    .get("inputSchema")
                    .cloned()
                    .unwrap_or_else(|| json!({"type":"object"})),
            })
        })
        .collect()
}

fn request(server: &McpServer, method: &str, params: Value) -> Result<Value, String> {
    if server.command.trim().is_empty() {
        return Err("MCP 启动命令不能为空".into());
    }
    let mut child = Command::new(&server.command)
        .args(&server.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("无法启动 MCP 服务: {error}"))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "无法连接 MCP stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法连接 MCP stdout".to_string())?;
    let (sender, receiver) = mpsc::channel::<Value>();
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(value) = serde_json::from_str::<Value>(&line) {
                let _ = sender.send(value);
            }
        }
    });
    let outcome = (|| {
        write_message(
            &mut stdin,
            &json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"tiny-note","version":"0.1.7"}}}),
        )?;
        let initialize = receive_response(&receiver, 1)?;
        if initialize.get("error").is_some() {
            return Err(format!("MCP 初始化失败: {}", initialize["error"]));
        }
        write_message(
            &mut stdin,
            &json!({"jsonrpc":"2.0","method":"notifications/initialized","params":{}}),
        )?;
        write_message(
            &mut stdin,
            &json!({"jsonrpc":"2.0","id":2,"method":method,"params":params}),
        )?;
        let response = receive_response(&receiver, 2)?;
        if let Some(error) = response.get("error") {
            return Err(format!("MCP 调用失败: {error}"));
        }
        response
            .get("result")
            .cloned()
            .ok_or_else(|| "MCP 响应缺少 result".to_string())
    })();
    let _ = child.kill();
    let _ = child.wait();
    outcome
}

fn write_message(stdin: &mut impl Write, value: &Value) -> Result<(), String> {
    writeln!(stdin, "{value}").map_err(|error| format!("写入 MCP 请求失败: {error}"))?;
    stdin
        .flush()
        .map_err(|error| format!("刷新 MCP 请求失败: {error}"))
}

fn receive_response(receiver: &mpsc::Receiver<Value>, id: i64) -> Result<Value, String> {
    let deadline = Instant::now() + MCP_TIMEOUT;
    loop {
        let remaining = deadline
            .checked_duration_since(Instant::now())
            .ok_or_else(|| "MCP 服务响应超时".to_string())?;
        let value = receiver
            .recv_timeout(remaining)
            .map_err(|_| "MCP 服务响应超时".to_string())?;
        if value.get("id").and_then(Value::as_i64) == Some(id) {
            return Ok(value);
        }
    }
}

#[tauri::command]
pub fn agent_mcp_list(state: State<'_, AppState>) -> Result<Vec<McpServer>, AppError> {
    load_servers(&state)
}

#[tauri::command]
pub fn agent_mcp_upsert(
    state: State<'_, AppState>,
    request: McpServerRequest,
) -> Result<McpServer, AppError> {
    let id = request.id.trim();
    validate_id(id)?;
    if request.name.trim().is_empty() || request.command.trim().is_empty() {
        return Err(AppError::invalid(
            "invalid_mcp_server",
            "MCP name and command are required",
        ));
    }
    if request.args.len() > 32 || request.args.iter().any(|value| value.len() > 2_000) {
        return Err(AppError::invalid(
            "invalid_mcp_args",
            "Too many or oversized MCP arguments",
        ));
    }
    let mut servers = load_servers(&state)?;
    let previous = servers.iter().find(|item| item.id == id);
    let server = McpServer {
        id: id.into(),
        name: request.name.trim().chars().take(80).collect(),
        command: request.command.trim().into(),
        args: request.args,
        enabled: request.enabled,
        cached_tools: previous
            .map(|item| item.cached_tools.clone())
            .unwrap_or_default(),
        last_error: previous.and_then(|item| item.last_error.clone()),
        updated_at: now(),
    };
    servers.retain(|item| item.id != id);
    servers.push(server.clone());
    save_servers(&state, &servers)?;
    Ok(server)
}

#[tauri::command]
pub fn agent_mcp_delete(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    validate_id(&id)?;
    let mut servers = load_servers(&state)?;
    servers.retain(|item| item.id != id);
    save_servers(&state, &servers)
}

#[tauri::command]
pub fn agent_mcp_refresh(state: State<'_, AppState>, id: String) -> Result<McpServer, AppError> {
    validate_id(&id)?;
    let mut servers = load_servers(&state)?;
    let index = servers
        .iter()
        .position(|item| item.id == id)
        .ok_or_else(|| AppError::not_found("mcp_server_not_found", "MCP server not found"))?;
    match discover(&servers[index]) {
        Ok(tools) => {
            servers[index].cached_tools = tools;
            servers[index].last_error = None;
        }
        Err(message) => {
            servers[index].last_error = Some(message.clone());
            save_servers(&state, &servers)?;
            return Err(AppError::invalid("mcp_discovery_failed", &message));
        }
    }
    servers[index].updated_at = now();
    let result = servers[index].clone();
    save_servers(&state, &servers)?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};
    use uuid::Uuid;

    fn state() -> AppState {
        let data_dir = std::env::temp_dir().join(format!("tiny-note-mcp-{}", Uuid::new_v4()));
        AppState {
            db: Arc::new(Mutex::new(Connection::open_in_memory().unwrap())),
            data_dir,
            cancels: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    #[test]
    fn saves_and_loads_server_without_shell_parsing() {
        let state = state();
        let server = McpServer {
            id: "local-test".into(),
            name: "Local test".into(),
            command: "node".into(),
            args: vec!["server.js".into()],
            enabled: true,
            cached_tools: Vec::new(),
            last_error: None,
            updated_at: now(),
        };
        save_servers(&state, std::slice::from_ref(&server)).unwrap();
        let loaded = load_servers(&state).unwrap();
        assert_eq!(loaded[0].command, "node");
        assert_eq!(loaded[0].args, vec!["server.js"]);
    }

    #[test]
    fn rejects_path_like_server_ids() {
        assert!(validate_id("../outside").is_err());
        assert!(validate_id("safe_server-1").is_ok());
    }

    #[test]
    fn respects_mcp_tool_error_results() {
        let error = parse_tool_result(&json!({
            "content": [{"type":"text","text":"日历服务拒绝访问"}],
            "isError": true
        }))
        .unwrap_err();
        assert!(error.contains("日历服务拒绝访问"));

        let output = parse_tool_result(&json!({
            "content": [{"type":"text","text":"真实工具结果"}],
            "isError": false
        }))
        .unwrap();
        assert_eq!(output, "真实工具结果");
    }
}
