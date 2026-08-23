use crate::{now, AppError, AppState};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::State;

const MAX_SKILL_CHARS: usize = 200_000;
const LEGACY_KNOWLEDGE_RESEARCH_SKILL: &str = "---\nname: knowledge-research\ndescription: 检索并汇总 Tiny Note 本地知识，保留来源和不确定性。\n---\n\n# 知识调研\n\n当任务需要本地事实时：\n\n1. 先用 `retrieve_knowledge` 做宽检索。\n2. 必要时用 `search_notes` 和 `get_note` 补充完整上下文。\n3. 只引用工具实际返回的来源。\n4. 区分资料事实、合理推断和未知信息。\n";
const PREVIOUS_BUILTIN_SKILLS: [(&str, &str); 4] = [
    (
        "knowledge-research",
        "---\nname: knowledge-research\ndescription: 在 Tiny Note 的笔记与已建立索引的知识库中搜索并汇总信息，保留可追溯来源、冲突和不确定性。\n---\n\n# 知识调研\n\n当任务需要查找本地事实、项目资料、知识库文档或已有笔记时，使用本技能。\n\n## 检索流程\n\n1. 先提取主题、专有名词、别名和限定条件；不要把无关背景词全部塞进查询。\n2. 优先调用 `retrieve_knowledge` 做宽检索。它会搜索 Tiny Note 笔记和已建立索引的知识库文件，并返回相关片段与来源。\n3. 需要精确核对某篇笔记时，再用 `search_notes` 找到候选，使用 `get_note` 读取完整正文。\n4. 如果用户指定了某个知识库或引用文件，优先使用工具返回的 `knowledgeBaseId`、`relativePath` 和 `id` 判断来源，不要把相似标题当成同一文件。\n5. 首轮结果不足时，尝试术语变体、缩写、中文/英文名称或更具体的错误信息；不要凭常识补写私有资料。\n\n## 来源与答案规则\n\n- 只引用工具实际返回的来源，并在答案中保留标题、来源类型以及可用的笔记 ID、知识库 ID、相对路径。\n- 区分“资料明确说明”“基于资料的推断”和“没有找到证据”。\n- 来源冲突时，指出冲突并优先采用更新、更正式或更直接的来源，同时说明判断依据。\n- 搜索结果为空时，明确说明已搜索的范围；这通常意味着知识库尚未索引、术语不同或资料不存在。\n- 不输出密码、Token、私钥或不必要的个人敏感信息。\n\n## 输出结构\n\n除非用户指定其他格式，按以下顺序回答：\n\n1. 直接结论；\n2. 按主题归纳的关键证据；\n3. 冲突、时效性和信息缺口；\n4. 来源列表。\n",
    ),
    (
        "note-organizer",
        "---\nname: note-organizer\ndescription: 将零散材料整理为结构清晰、便于后续维护的笔记。\n---\n\n# 笔记整理\n\n创建或修改笔记时：\n\n- 标题简洁明确。\n- 正文使用 Markdown 标题、列表和必要的待办项。\n- 不添加材料中没有的事实。\n- 修改现有笔记使用 `update_note` 生成提案，提醒用户仍需审阅应用。\n",
    ),
    ("knowledge-research", PREVIOUS_KNOWLEDGE_RESEARCH_SKILL_V2),
    ("note-organizer", PREVIOUS_NOTE_ORGANIZER_SKILL_V2),
];
const PREVIOUS_KNOWLEDGE_RESEARCH_SKILL_V2: &str = r#"---
name: knowledge-research
description: 检索、创建、更新或删除 Tiny Note 知识库，并基于已索引资料生成可追溯答案。
---

# 知识库管理与调研

当用户需要管理知识库，或查找本地项目资料、文档和已有笔记时，使用本技能。

## 工具对应关系

| 用户意图 | 必须使用的工具 | 关键规则 |
| --- | --- | --- |
| 新建知识库 | `create_knowledge_base` | 提供 `name`、`category`，说明可选；`personal` 表示个人知识，`local` 表示本地资料 |
| 查看有哪些知识库 | `list_knowledge_bases` | 返回知识库 ID、分类、说明和索引状态；不要用正文检索代替目录查询 |
| 检索知识库内容 | `retrieve_knowledge` | 使用精炼关键词检索已索引内容，保留 `knowledgeBaseId`、`relativePath` 和来源 |
| 修改知识库信息 | `update_knowledge_base` | 先用 `list_knowledge_bases` 确认唯一 ID；只改名称或说明，不改知识库文件 |
| 删除知识库 | `delete_knowledge_base` | 先用 `list_knowledge_bases` 核对唯一 ID；工具会删除记录和索引，并把受管目录移入系统回收站 |

## 操作流程

1. 先判断用户要管理“知识库本身”，还是要查询“知识库中的内容”。
2. 用户只给名称时，先调用 `list_knowledge_bases`，不要猜测 ID；如果重名或意图不明确，列出候选并请用户确认。
3. 创建时不要擅自选择分类。上下文能明确判断时使用对应分类，否则先询问 `personal` 或 `local`。
4. 更新时提交完整的新名称和说明。用户只改名称时，从列表结果保留原说明，避免意外清空。
5. 删除前确认目标与用户描述一致。只有 `delete_knowledge_base` 返回成功后，才能说删除完成。
6. 写操作完成后，可再次调用 `list_knowledge_bases` 验证结果；不要把发起调用当成成功。

## 检索与回答

1. 提取主题、专有名词、别名和限定条件，再调用 `retrieve_knowledge`；首轮不足时尝试术语变体或更具体的错误信息。
2. `retrieve_knowledge` 可能同时返回笔记和知识库文件。需要完整核对某篇笔记时，交给 `note-organizer` 技能并使用 `search_notes`、`get_note`。
3. 只引用工具实际返回的来源，区分资料事实、合理推断和未知信息。
4. 来源冲突时指出冲突，并说明采用更新、更正式或更直接来源的依据。
5. 搜索为空时说明已搜索范围；可能原因包括尚未索引、术语不同或资料不存在。

## 边界

- 当前 Agent 工具管理的是知识库元数据与检索，不支持直接新增、改写、重命名或删除知识库内的单个文件。不要声称已完成不存在的文件操作。
- 不输出密码、Token、私钥或不必要的个人敏感信息。
"#;
const PREVIOUS_NOTE_ORGANIZER_SKILL_V2: &str = r#"---
name: note-organizer
description: 使用 Tiny Note 工具创建、查找、读取、修改或删除笔记，并保持内容结构清晰。
---

# 笔记管理与整理

当用户需要对 Tiny Note 笔记执行增、删、改、查，或把零散材料整理成笔记时，使用本技能。

## 工具对应关系

| 用户意图 | 必须使用的工具 | 关键规则 |
| --- | --- | --- |
| 新建笔记 | `create_note` | 提供明确标题和完整 `contentMarkdown`；已知笔记本 ID 时才传 `notebookId` |
| 搜索笔记 | `search_notes` | 用关键词返回候选标题、ID 和摘要；名称相似时不要直接选定 |
| 读取笔记 | `get_note` | 必须使用精确笔记 ID，读取未删除笔记的完整正文 |
| 修改笔记 | `update_note` | 先读取原文，再提交修改后的完整 Markdown；该工具只生成待审阅提案，不代表已经应用 |
| 删除笔记 | `delete_note` | 先搜索并读取确认精确 ID；移入最近删除，可在保留期内恢复 |

## 操作流程

1. 先识别是创建、查询、修改还是删除，不要用一个工具替代另一种操作。
2. 用户仅提供标题时，先调用 `search_notes`。只有一个明确候选时才能继续；多个候选必须展示标题和 ID 让用户确认。
3. 查看或修改正文前调用 `get_note`，不要根据搜索摘要推断完整内容。
4. 创建笔记时，标题简洁明确，正文使用 Markdown 标题、列表、表格或待办项；不添加材料中没有的事实。
5. 修改笔记时保留用户未要求改变的内容，将完整新正文交给 `update_note`。返回后明确说明“修改提案已生成，仍需用户审阅并应用”。
6. 删除笔记时必须使用 `delete_note`，并在成功后说明笔记已进入最近删除，而不是永久清除。
7. 只有工具返回成功后才能报告操作完成；失败时保留原始目标并说明下一步。

## 批量操作

- 批量创建、修改或删除时，逐项保留标题与 ID 的对应关系，避免把相似标题串错。
- 任一项失败时，分别报告成功与失败项目，不把部分成功描述成全部完成。
- 是否需要暂停审批由用户的 Agent 工具设置决定，技能本身不得绕过工具执行层。
"#;
const KNOWLEDGE_RESEARCH_SKILL: &str = r#"---
name: knowledge-research
description: 检索和管理 Tiny Note 知识库，并在知识库中新建或移动笔记引用。
---

# 知识库管理与调研

知识库保存文件和 `.note` 引用；笔记本负责“全部笔记 / 未分类”等笔记归类。两者不是同一个实体。

## 工具对应关系

| 用户意图 | 必须使用的工具 | 关键规则 |
| --- | --- | --- |
| 新建知识库 | `create_knowledge_base` | 提供 `name`、`category`；`personal` 为个人知识，`local` 为本地资料 |
| 查看知识库 | `list_knowledge_bases` | 先取得唯一知识库 ID，不要用正文检索代替目录查询 |
| 在知识库新建笔记 | `create_note_in_knowledge_base` | 提供目标 `knowledgeBaseId`、标题和完整 Markdown；笔记本归属默认是“未分类” |
| 移动笔记到其他知识库 | `move_note_to_knowledge_base` | 提供笔记 ID、来源和目标知识库 ID；移动的是 `.note` 引用，笔记正文与笔记本归属不变 |
| 检索知识库内容 | `retrieve_knowledge` | 使用精炼关键词，保留来源 ID 和相对路径 |
| 修改知识库信息 | `update_knowledge_base` | 先确认唯一 ID；只修改名称或说明 |
| 删除知识库 | `delete_knowledge_base` | 删除记录和索引，并把受管目录移入系统回收站 |

## 操作规则

1. 用户只给知识库名称时，先调用 `list_knowledge_bases`；重名时必须请用户确认。
2. 在知识库新建文章时优先调用 `create_note_in_knowledge_base`，不要先创建普通笔记再假装已经加入知识库。
3. 移动前先用 `search_notes` 找到唯一笔记 ID，再确认来源与目标知识库不同。
4. `move_note_to_knowledge_base` 只移动唯一的 `.note` 引用；来源中没有引用或存在多个引用时，报告工具错误，不猜测文件。
5. 只有写工具成功后才能报告完成；需要时再次列出知识库或检索验证结果。

## 检索与回答

- 只引用工具实际返回的来源，区分资料事实、合理推断和未知信息。
- 首轮不足时尝试术语变体；搜索为空时说明检索范围。
- 不输出密码、Token、私钥或不必要的个人敏感信息。
"#;
const NOTE_ORGANIZER_SKILL: &str = r#"---
name: note-organizer
description: 创建、查找、读取、修改、移动或删除 Tiny Note 笔记，并保持归类清晰。
---

# 笔记管理与整理

笔记本负责笔记归类；知识库通过 `.note` 文件引用笔记。AI 生成文章未指定笔记本时必须默认归入“未分类”，并自然显示在“全部笔记”中。

## 工具对应关系

| 用户意图 | 必须使用的工具 | 关键规则 |
| --- | --- | --- |
| 新建普通笔记 | `create_note` | 提供标题与完整 Markdown；不传 `notebookId` 时归入“未分类” |
| 在知识库新建笔记 | `create_note_in_knowledge_base` | 同时创建笔记和目标知识库引用，仍默认归入“未分类”笔记本 |
| 移动到其他知识库 | `move_note_to_knowledge_base` | 移动 `.note` 引用，不改变笔记本归属 |
| 搜索笔记 | `search_notes` | 返回候选标题、ID 和摘要；相似名称不能直接选定 |
| 读取笔记 | `get_note` | 使用精确笔记 ID 读取完整正文 |
| 修改笔记 | `update_note` | 只生成待审阅提案，不代表已经应用 |
| 删除笔记 | `delete_note` | 移入最近删除，可在保留期内恢复 |

## 操作流程

1. 先区分用户说的是笔记本归类还是知识库引用；不要混用 ID。
2. 创建时标题简洁、正文结构清晰，不添加材料中没有的事实。
3. 用户只提供标题时先搜索；多个候选必须展示标题和 ID 让用户确认。
4. 修改前读取完整正文，保留未要求改变的内容；返回后明确说明仍需审阅应用。
5. 移动知识库引用前确认来源库、目标库和唯一笔记 ID。
6. 只有工具返回成功后才能报告完成；批量操作分别报告成功与失败项。
"#;
const BUILTIN_SKILLS: [(&str, &str); 2] = [
    ("knowledge-research", KNOWLEDGE_RESEARCH_SKILL),
    ("note-organizer", NOTE_ORGANIZER_SKILL),
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
            fs::write(&file, content).map_err(AppError::fs)?;
        } else if should_upgrade_builtin(name, &fs::read_to_string(&file).map_err(AppError::fs)?) {
            // Upgrade only the untouched built-in template. User edits made in the
            // Agent Skills editor remain authoritative and are never overwritten.
            fs::write(&file, content).map_err(AppError::fs)?;
        }
    }
    Ok(root)
}

fn should_upgrade_builtin(name: &str, content: &str) -> bool {
    if name == "knowledge-research" && content == LEGACY_KNOWLEDGE_RESEARCH_SKILL {
        return true;
    }
    PREVIOUS_BUILTIN_SKILLS
        .iter()
        .any(|(previous_name, previous_content)| {
            *previous_name == name && *previous_content == content
        })
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
        let knowledge = read_skill(&state, "knowledge-research")
            .unwrap()
            .content
            .unwrap();
        for tool in [
            "create_knowledge_base",
            "create_note_in_knowledge_base",
            "move_note_to_knowledge_base",
            "list_knowledge_bases",
            "retrieve_knowledge",
            "update_knowledge_base",
            "delete_knowledge_base",
        ] {
            assert!(knowledge.contains(tool), "knowledge skill missing {tool}");
        }
        let notes = read_skill(&state, "note-organizer")
            .unwrap()
            .content
            .unwrap();
        for tool in [
            "create_note",
            "create_note_in_knowledge_base",
            "move_note_to_knowledge_base",
            "search_notes",
            "get_note",
            "update_note",
            "delete_note",
        ] {
            assert!(notes.contains(tool), "note skill missing {tool}");
        }
    }

    #[test]
    fn upgrades_untouched_legacy_knowledge_research_skill() {
        let state = state();
        let skill_dir = state.data_dir.join("agent/SKILL/knowledge-research");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(skill_dir.join("SKILL.md"), LEGACY_KNOWLEDGE_RESEARCH_SKILL).unwrap();

        let skill = read_skill(&state, "knowledge-research").unwrap();

        assert!(skill.content.unwrap().contains("create_knowledge_base"));
    }

    #[test]
    fn upgrades_untouched_previous_builtin_skills() {
        let state = state();
        for (name, previous) in PREVIOUS_BUILTIN_SKILLS {
            let skill_dir = state.data_dir.join("agent/SKILL").join(name);
            fs::create_dir_all(&skill_dir).unwrap();
            fs::write(skill_dir.join("SKILL.md"), previous).unwrap();
        }

        assert!(read_skill(&state, "knowledge-research")
            .unwrap()
            .content
            .unwrap()
            .contains("delete_knowledge_base"));
        assert!(read_skill(&state, "note-organizer")
            .unwrap()
            .content
            .unwrap()
            .contains("delete_note"));
    }

    #[test]
    fn preserves_user_edited_builtin_skill() {
        let state = state();
        let skill_dir = state.data_dir.join("agent/SKILL/knowledge-research");
        fs::create_dir_all(&skill_dir).unwrap();
        let custom = "---\nname: knowledge-research\ndescription: 我的技能\n---\n\n# 自定义内容\n";
        fs::write(skill_dir.join("SKILL.md"), custom).unwrap();

        let skill = read_skill(&state, "knowledge-research").unwrap();

        assert_eq!(skill.content.as_deref(), Some(custom));
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
