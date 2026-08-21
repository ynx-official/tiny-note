use crate::{now, AppError, AppState};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::State;

const MAX_SKILL_CHARS: usize = 200_000;
const BUILTIN_SKILLS: [(&str, &str); 2] = [
    (
        "knowledge-research",
        "---\nname: knowledge-research\ndescription: 在 Tiny Note 的笔记与已建立索引的知识库中搜索并汇总信息，保留可追溯来源、冲突和不确定性。\n---\n\n# 知识调研\n\n当任务需要查找本地事实、项目资料、知识库文档或已有笔记时，使用本技能。\n\n## 检索流程\n\n1. 先提取主题、专有名词、别名和限定条件；不要把无关背景词全部塞进查询。\n2. 优先调用 `retrieve_knowledge` 做宽检索。它会搜索 Tiny Note 笔记和已建立索引的知识库文件，并返回相关片段与来源。\n3. 需要精确核对某篇笔记时，再用 `search_notes` 找到候选，使用 `get_note` 读取完整正文。\n4. 如果用户指定了某个知识库或引用文件，优先使用工具返回的 `knowledgeBaseId`、`relativePath` 和 `id` 判断来源，不要把相似标题当成同一文件。\n5. 首轮结果不足时，尝试术语变体、缩写、中文/英文名称或更具体的错误信息；不要凭常识补写私有资料。\n\n## 来源与答案规则\n\n- 只引用工具实际返回的来源，并在答案中保留标题、来源类型以及可用的笔记 ID、知识库 ID、相对路径。\n- 区分“资料明确说明”“基于资料的推断”和“没有找到证据”。\n- 来源冲突时，指出冲突并优先采用更新、更正式或更直接的来源，同时说明判断依据。\n- 搜索结果为空时，明确说明已搜索的范围；这通常意味着知识库尚未索引、术语不同或资料不存在。\n- 不输出密码、Token、私钥或不必要的个人敏感信息。\n\n## 输出结构\n\n除非用户指定其他格式，按以下顺序回答：\n\n1. 直接结论；\n2. 按主题归纳的关键证据；\n3. 冲突、时效性和信息缺口；\n4. 来源列表。\n",
    ),
    (
        "note-organizer",
        "---\nname: note-organizer\ndescription: 将零散材料整理为结构清晰、便于后续维护的笔记。\n---\n\n# 笔记整理\n\n创建或修改笔记时：\n\n- 标题简洁明确。\n- 正文使用 Markdown 标题、列表和必要的待办项。\n- 不添加材料中没有的事实。\n- 修改现有笔记使用 `update_note` 生成提案，提醒用户仍需审阅应用。\n",
    ),
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDto {
    pub name: String,
    pub description: String,
    pub file_name: String,
    pub content: Option<String>,
    pub updated_at: Option<String>,
    pub builtin: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillUpsertRequest {
    pub name: String,
    pub content: String,
}

pub fn ensure_skill_dir(state: &AppState) -> Result<PathBuf, AppError> {
    let root = state.data_dir.join("agent").join("SKILL");
    fs::create_dir_all(&root).map_err(AppError::fs)?;
    for (name, content) in BUILTIN_SKILLS {
        let dir = root.join(name);
        let file = dir.join("SKILL.md");
        if !file.exists() {
            fs::create_dir_all(&dir).map_err(AppError::fs)?;
            fs::write(file, content).map_err(AppError::fs)?;
        }
    }
    Ok(root)
}

pub fn list_skills(state: &AppState, include_content: bool) -> Result<Vec<SkillDto>, AppError> {
    let root = ensure_skill_dir(state)?;
    let mut skills = fs::read_dir(root)
        .map_err(AppError::fs)?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            let path = entry.path().join("SKILL.md");
            if !entry.file_type().ok()?.is_dir() || !path.is_file() {
                return None;
            }
            let content = fs::read_to_string(&path).ok()?;
            let description = frontmatter_value(&content, "description")
                .unwrap_or_else(|| first_summary(&content));
            let updated_at = fs::metadata(&path)
                .ok()
                .and_then(|metadata| metadata.modified().ok())
                .map(|time| chrono::DateTime::<chrono::Utc>::from(time).to_rfc3339());
            Some(SkillDto {
                name: frontmatter_value(&content, "name").unwrap_or(name.clone()),
                description,
                file_name: format!("{name}/SKILL.md"),
                content: include_content.then_some(content),
                updated_at,
                builtin: BUILTIN_SKILLS.iter().any(|(builtin, _)| *builtin == name),
            })
        })
        .collect::<Vec<_>>();
    skills.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(skills)
}

pub fn read_skill(state: &AppState, name: &str) -> Result<SkillDto, AppError> {
    let safe_name = validate_name(name)?;
    list_skills(state, true)?
        .into_iter()
        .find(|skill| skill.file_name == format!("{safe_name}/SKILL.md"))
        .ok_or_else(|| AppError::not_found("skill_not_found", "Skill not found"))
}

pub fn write_skill(state: &AppState, name: &str, content: &str) -> Result<SkillDto, AppError> {
    let safe_name = validate_name(name)?;
    if content.trim().is_empty() || content.chars().count() > MAX_SKILL_CHARS {
        return Err(AppError::invalid(
            "invalid_skill_content",
            "Skill content must contain 1-200000 characters",
        ));
    }
    let root = ensure_skill_dir(state)?;
    let dir = root.join(safe_name);
    if dir.exists()
        && fs::symlink_metadata(&dir)
            .map_err(AppError::fs)?
            .file_type()
            .is_symlink()
    {
        return Err(AppError::invalid(
            "invalid_skill_path",
            "Skill path cannot be a symlink",
        ));
    }
    fs::create_dir_all(&dir).map_err(AppError::fs)?;
    let path = dir.join("SKILL.md");
    if path.exists()
        && fs::symlink_metadata(&path)
            .map_err(AppError::fs)?
            .file_type()
            .is_symlink()
    {
        return Err(AppError::invalid(
            "invalid_skill_path",
            "Skill file cannot be a symlink",
        ));
    }
    fs::write(&path, content).map_err(AppError::fs)?;
    Ok(SkillDto {
        name: frontmatter_value(content, "name").unwrap_or_else(|| safe_name.to_string()),
        description: frontmatter_value(content, "description")
            .unwrap_or_else(|| first_summary(content)),
        file_name: format!("{safe_name}/SKILL.md"),
        content: Some(content.to_string()),
        updated_at: Some(now()),
        builtin: BUILTIN_SKILLS
            .iter()
            .any(|(builtin, _)| *builtin == safe_name),
    })
}

pub fn delete_skill(state: &AppState, name: &str) -> Result<(), AppError> {
    let safe_name = validate_name(name)?;
    if BUILTIN_SKILLS
        .iter()
        .any(|(builtin, _)| *builtin == safe_name)
    {
        return Err(AppError::invalid(
            "builtin_skill",
            "Built-in skills cannot be deleted",
        ));
    }
    let root = ensure_skill_dir(state)?;
    let dir = root.join(safe_name);
    validate_skill_directory(&root, &dir)?;
    if !dir.exists() {
        return Err(AppError::not_found("skill_not_found", "Skill not found"));
    }
    fs::remove_dir_all(dir).map_err(AppError::fs)
}

pub fn skill_index_for_prompt(state: &AppState) -> Result<String, AppError> {
    let skills = list_skills(state, false)?;
    if skills.is_empty() {
        return Ok("（没有可用技能）".into());
    }
    Ok(skills
        .into_iter()
        .map(|skill| format!("- `{}`：{}", skill.name, skill.description))
        .collect::<Vec<_>>()
        .join("\n"))
}

#[tauri::command]
pub fn agent_skill_list(state: State<'_, AppState>) -> Result<Vec<SkillDto>, AppError> {
    list_skills(&state, false)
}

#[tauri::command]
pub fn agent_skill_read(state: State<'_, AppState>, name: String) -> Result<SkillDto, AppError> {
    read_skill(&state, &name)
}

#[tauri::command]
pub fn agent_skill_upsert(
    state: State<'_, AppState>,
    request: SkillUpsertRequest,
) -> Result<SkillDto, AppError> {
    write_skill(&state, &request.name, &request.content)
}

#[tauri::command]
pub fn agent_skill_delete(state: State<'_, AppState>, name: String) -> Result<(), AppError> {
    delete_skill(&state, &name)
}

fn validate_name(name: &str) -> Result<&str, AppError> {
    let value = name.trim();
    if value.is_empty()
        || value.len() > 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(AppError::invalid(
            "invalid_skill_name",
            "Skill name may only contain letters, numbers, '-' and '_'",
        ));
    }
    Ok(value)
}

fn validate_skill_directory(root: &Path, dir: &Path) -> Result<(), AppError> {
    if dir.exists() {
        let canonical_root = fs::canonicalize(root).map_err(AppError::fs)?;
        let canonical_dir = fs::canonicalize(dir).map_err(AppError::fs)?;
        if !canonical_dir.starts_with(canonical_root)
            || fs::symlink_metadata(dir)
                .map_err(AppError::fs)?
                .file_type()
                .is_symlink()
        {
            return Err(AppError::invalid(
                "invalid_skill_path",
                "Skill path escapes the skill directory",
            ));
        }
    }
    Ok(())
}

fn frontmatter_value(content: &str, key: &str) -> Option<String> {
    let body = content.strip_prefix("---\n")?;
    let end = body.find("\n---")?;
    body[..end]
        .lines()
        .find_map(|line| {
            let (found, value) = line.split_once(':')?;
            (found.trim() == key).then(|| value.trim().trim_matches(['\'', '"']).to_string())
        })
        .filter(|value| !value.is_empty())
}

fn first_summary(content: &str) -> String {
    content
        .lines()
        .map(str::trim)
        .find(|line| {
            !line.is_empty() && !line.starts_with('#') && *line != "---" && !line.contains(":")
        })
        .unwrap_or("自定义 Agent 技能")
        .chars()
        .take(120)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::{
        collections::HashMap,
        sync::{Arc, Mutex},
    };

    fn state() -> AppState {
        let root =
            std::env::temp_dir().join(format!("tiny-note-skill-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        AppState {
            db: Arc::new(Mutex::new(Connection::open_in_memory().unwrap())),
            data_dir: root,
            cancels: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    #[test]
    fn seeds_and_reads_builtin_skills() {
        let state = state();
        let skills = list_skills(&state, false).unwrap();
        assert_eq!(skills.len(), 2);
        assert!(skills.iter().all(|skill| skill.builtin));
        assert!(read_skill(&state, "knowledge-research")
            .unwrap()
            .content
            .unwrap()
            .contains("已建立索引的知识库文件"));
    }

    #[test]
    fn rejects_skill_path_traversal() {
        let state = state();
        assert!(write_skill(&state, "../escape", "# bad").is_err());
        assert!(read_skill(&state, "/tmp").is_err());
    }

    #[test]
    fn writes_custom_skill_metadata() {
        let state = state();
        let skill = write_skill(
            &state,
            "weekly-review",
            "---\nname: weekly-review\ndescription: 每周回顾\n---\n\n# Review",
        )
        .unwrap();
        assert_eq!(skill.name, "weekly-review");
        assert_eq!(skill.description, "每周回顾");
        assert!(!skill.builtin);
    }
}
