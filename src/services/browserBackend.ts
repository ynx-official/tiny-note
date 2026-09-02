// The browser preview persists user-shaped JSON and is loaded only outside Tauri.
import { readBrowserState, writeBrowserState } from './browserBackend/storage'
import { handlePlannerCommand } from './browserBackend/planner'
import { handleActivityCommand } from './browserBackend/activity'
import { handleMediaCommand } from './browserBackend/media'
import { handleNotesCommand, migrateLegacyNoteTags, rebuildNoteLinks } from './browserBackend/notes'
import { base64ToBytes, bytesToBase64, handleLibraryCommand } from './browserBackend/library'
import { handleAgentCommand } from './browserBackend/agent'
import type { CommandArgs, CommandName, CommandResult } from './commandMap'

import type { BrowserArgs, BrowserItem, BrowserItemInput, BrowserItemList, BrowserState } from './browserBackend/types'

function isBrowserRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function browserItems(value: unknown): BrowserItemList {
  return (Array.isArray(value) ? value.filter(isBrowserRecord) : []) as BrowserItemList
}

function browserItem(value: BrowserItemInput): BrowserItem {
  return value as BrowserItem
}

function browserItemList(values: BrowserItemInput[]): BrowserItemList {
  return values as BrowserItemList
}

function normalizeBrowserState(record: Record<string, unknown>): BrowserState {
  const present = new Set(Object.keys(record))
  const state = record as BrowserState
  for (const key of ['notes', 'notebooks', 'tags', 'noteTags', 'kbs', 'libraryFiles', 'memories', 'agentSkills', 'mcpServers', 'usageRecords', 'imageGenerations', 'imageAssets', 'chatConversations', 'chatMessages', 'backgroundTasks', 'calendarEvents', 'todos', 'todoLists', 'reminders', 'editProposals', 'noteRevisions', 'noteLinks', 'templates', 'models'] as const) {
    state[key] = browserItems(record[key])
    state[key].forEach(value => { if (!Number.isInteger(value.version) || Number(value.version) <= 0) value.version = 1 })
  }
  state.agentToolPolicies = isBrowserRecord(record.agentToolPolicies)
    ? Object.fromEntries(Object.entries(record.agentToolPolicies).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'))
    : {}
  const timestamp = new Date().toISOString()
  if (!present.has('notebooks')) state.notebooks = browserItemList([{ id: 'uncategorized', parentId: null, name: '未分类', description: '', version: 1, createdAt: timestamp, updatedAt: timestamp }])
  if (!present.has('kbs')) state.kbs = browserItemList([{ id: 'personal-demo', category: 'personal', name: '我的笔记', description: '', rootPath: '', version: 1, createdAt: timestamp, updatedAt: timestamp }, { id: 'local-demo', category: 'local', name: '我的书籍', description: '', rootPath: '', version: 1, createdAt: timestamp, updatedAt: timestamp }])
  if (!present.has('memories')) state.memories = browserItemList(browserMemorySeed.map(file => ({ ...file, updatedAt: timestamp })))
  if (!present.has('agentSkills')) state.agentSkills = browserItemList(browserSkillSeed.map(skill => ({ ...skill, updatedAt: timestamp })))
  if (!present.has('templates')) state.templates = browserItemList(browserTemplateSeed.map(template => ({ ...template, updatedAt: timestamp })))
  state.settings = isBrowserRecord(record.settings)
    ? record.settings as BrowserItem
    : browserItem({ theme: 'system', language: 'zh-CN', fimEnabled: false, exportDirectory: '' })
  return state
}

const browserMemorySeed = [
  { fileName: 'SOUL.md', nameKey: 'SOUL', description: '灵魂设定', content: '# 灵魂设定\n\nTiny Note 助手的工作方式、表达风格和安全边界。\n\n## 说话风格\n- 先给结论，再补充必要细节\n- 亲切、清晰，不编造不确定的信息\n' },
  { fileName: 'USER.md', nameKey: 'USER', description: '用户档案', content: '# 用户档案\n\n> 记录用户主动提供、并希望跨会话保留的偏好。\n\n## 语言\n- 简体中文\n\n## 兴趣与工作习惯\n- （待补充）\n' },
  { fileName: 'MEMORY.md', nameKey: 'MEMORY', description: '长期记忆', content: '# 长期记忆\n\n> 记录跨会话需要记住的重要事实、事件和承诺。\n\n## 重要事实\n- （待补充）\n' },
  { fileName: 'Agent.md', nameKey: 'Agent', description: '经验与技巧', content: '# 经验与技巧\n\n> 记录 Tiny Note 助手在工作中积累的可复用经验。\n\n## 工具使用经验\n- （待补充）\n' }
]
const browserSkillSeed = [
  { name: 'knowledge-research', description: '管理 Tiny Note 知识库元数据和笔记引用。', fileName: 'knowledge-research/SKILL.md', builtin: true, content: '---\nname: knowledge-research\ndescription: 管理 Tiny Note 知识库元数据和笔记引用。\n---\n\n# 知识库管理\n\n知识库与笔记本是不同实体；当前版本不自动检索知识库正文。使用 `list_knowledge_bases`、`create_knowledge_base`、`update_knowledge_base`、`delete_knowledge_base` 管理知识库；使用 `create_note_in_knowledge_base` 和 `move_note_to_knowledge_base` 管理笔记引用。只有对话中手动选择的文件才作为本轮参考。\n' },
  { name: 'note-organizer', description: '列出、搜索、读取、创建、修改或删除 Tiny Note 普通笔记。', fileName: 'note-organizer/SKILL.md', builtin: true, content: '---\nname: note-organizer\ndescription: 列出、搜索、读取、创建、修改或删除 Tiny Note 普通笔记。\n---\n\n# 笔记管理\n\n“我有哪些笔记”调用 `list_notes`；只有给出主题时才调用 `search_notes`。搜索无结果时缩短关键词重试。修改前用 `get_note` 读取 `contentMarkdown`；删除前确认精确 ID。创建时使用不超过 50 字符的简洁标题和完整 Markdown 正文。写操作使用 `create_note`、`update_note`、`delete_note`。\n' },
  { name: 'notebook-manager', description: '列出、创建、修改、移动或删除 Tiny Note 笔记本。', fileName: 'notebook-manager/SKILL.md', builtin: true, content: '---\nname: notebook-manager\ndescription: 列出、创建、修改、移动或删除 Tiny Note 笔记本。\n---\n\n# 笔记本管理\n\n笔记本、笔记和知识库是不同实体。使用 `list_notebooks`、`create_notebook`、`update_notebook`、`move_notebook`、`delete_notebook`。不要修改、移动或删除系统“未分类”笔记本；移动前确认目标不是自身或后代。删除普通笔记本不会递归删除笔记或子笔记本。\n' }
]
const browserTemplateSeed = [
  { id: 'daily', name: '每日记录', description: '记录当天的重点、进展和复盘', title: '每日记录', contentMarkdown: '# 今日重点\n\n## 计划\n\n## 进展\n\n## 复盘\n', builtin: true },
  { id: 'meeting', name: '会议纪要', description: '快速整理会议背景、结论和行动项', title: '会议纪要', contentMarkdown: '# 会议纪要\n\n## 参与者\n\n## 讨论\n\n## 结论\n\n## 行动项\n- [ ] \n', builtin: true },
  { id: 'project', name: '项目计划', description: '拆解项目目标、里程碑和风险', title: '项目计划', contentMarkdown: '# 项目计划\n\n## 目标\n\n## 里程碑\n\n## 风险\n\n## 下一步\n', builtin: true }
]
const browserLegacySkillContent = {
  'knowledge-research': [
    '---\nname: knowledge-research\ndescription: 检索并汇总 Tiny Note 本地知识，保留来源和不确定性。\n---\n\n# 知识调研\n\n先检索，再汇总并保留来源。\n',
    '---\nname: knowledge-research\ndescription: 检索、创建、更新或删除 Tiny Note 知识库，并基于已索引资料生成可追溯答案。\n---\n\n# 知识库管理与调研\n\n## 工具对应关系\n\n- 新建：`create_knowledge_base`\n- 查看目录：`list_knowledge_bases`\n- 检索正文：`retrieve_knowledge`\n- 修改信息：`update_knowledge_base`\n- 删除：`delete_knowledge_base`\n\n更新或删除前先列出知识库并确认唯一 ID。删除成功表示记录和索引已删除，受管目录已移入系统回收站。当前 Agent 工具不直接修改知识库内的单个文件。\n',
    '---\nname: knowledge-research\ndescription: 检索和管理 Tiny Note 知识库，并在知识库中新建或移动笔记。\n---\n\n# 知识库管理与调研\n\n知识库保存文件，笔记通过 `knowledgeBaseId` 直接归属知识库。\n\n- 在知识库新建笔记：`create_note_in_knowledge_base`\n- 移动到其他知识库：`move_note_to_knowledge_base`\n- 查看目录：`list_knowledge_bases`\n- 检索正文：`retrieve_knowledge`\n\n先确认唯一的笔记 ID、来源知识库 ID 和目标知识库 ID。移动会更新笔记归属，不改变正文或笔记本归属。\n'
  ],
  'note-organizer': [
    '---\nname: note-organizer\ndescription: 将零散材料整理为结构清晰、便于后续维护的笔记。\n---\n\n# 笔记整理\n\n保持结构清晰，不添加未知事实。\n',
    '---\nname: note-organizer\ndescription: 使用 Tiny Note 工具创建、查找、读取、修改或删除笔记，并保持内容结构清晰。\n---\n\n# 笔记管理与整理\n\n## 工具对应关系\n\n- 新建：`create_note`\n- 搜索：`search_notes`\n- 读取：`get_note`\n- 修改：`update_note`，只生成待审阅提案\n- 删除：`delete_note`，移入最近删除\n\n修改或删除前先搜索并读取，使用精确笔记 ID；只有工具成功后才能报告完成。\n',
    '---\nname: note-organizer\ndescription: 创建、查找、读取、修改、移动或删除 Tiny Note 笔记，并保持归类清晰。\n---\n\n# 笔记管理与整理\n\nAI 生成文章未指定笔记本时默认归入“未分类”，并显示在“全部笔记”中。\n\n- 新建普通笔记：`create_note`\n- 在知识库新建：`create_note_in_knowledge_base`\n- 移动知识库引用：`move_note_to_knowledge_base`\n- 搜索和读取：`search_notes`、`get_note`\n- 修改和删除：`update_note`、`delete_note`\n'
  ]
}
const browserAgentToolDefaults: Array<readonly [string, string, boolean]> = [
  ['get_current_time', '获取本机当前时间', false], ['request_user_input', '暂停运行并向用户请求结构化输入', false],
  ['list_mcp_tools', '列出已发现的 MCP 工具', false], ['call_mcp_tool', '调用外部 MCP 工具', true],
  ['delegate_task', '委派独立子任务', true], ['run_sandbox_script', '执行隔离计算脚本', true],
  ['read_skill', '读取 Agent 技能', false], ['write_skill', '创建或更新 Agent 技能', true],
  ['list_agent_files', '浏览 Agent 工作区', false], ['read_agent_file', '读取 Agent 工作区文本文件', false], ['write_agent_file', '写入 Agent 工作区文本文件', true],
  ['create_note', '创建笔记', true], ['create_note_in_knowledge_base', '在知识库中新建笔记', true], ['move_note_to_knowledge_base', '移动笔记到其他知识库', true], ['update_note', '生成笔记修改提案', true], ['delete_note', '将笔记移入最近删除', true],
  ['update_memory', '更新 Agent 记忆', true],
  ['create_notebook', '创建笔记本', true], ['update_notebook', '更新笔记本信息', true], ['move_notebook', '移动笔记本层级', true], ['delete_notebook', '删除笔记本并安全归位内容', true],
  ['create_knowledge_base', '创建知识库', true], ['update_knowledge_base', '更新知识库信息', true], ['delete_knowledge_base', '删除知识库并移入回收站', true],
  ['list_knowledge_bases', '列出现有知识库元数据', false], ['list_notes', '列出未删除的普通笔记', false], ['search_notes', '搜索未删除的普通笔记', false], ['get_note', '读取指定笔记的完整 Markdown', false], ['list_notebooks', '列出笔记本及直属统计', false],
  ['create_todo', '创建待办', true], ['create_calendar_event', '创建日历事件', true]
]
export async function browserInvoke<K extends CommandName>(command: K, commandArgs: CommandArgs<K>): Promise<CommandResult<K>> {
  const args = commandArgs as unknown as BrowserArgs
  const state = normalizeBrowserState(readBrowserState())
  const now = new Date().toISOString()
  if (!state.notes) state.notes = []
  state.notes.forEach(note => { if (typeof note.contentMarkdown !== 'string') note.contentMarkdown = '' })
  if (!state.notebooks) state.notebooks = browserItemList([{ id: 'uncategorized', parentId: null, name: '未分类', description: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }])
  state.notebooks.forEach(book => { if (!Object.hasOwn(book, 'parentId')) book.parentId = null })
  let uncategorized = state.notebooks.find(book => book.name === '未分类')
  if (!uncategorized) { uncategorized = browserItem({ id: 'uncategorized', parentId: null, name: '未分类', description: '', createdAt: now, updatedAt: now }); state.notebooks.push(uncategorized) }
  if (!state.tags) state.tags = []
  if (!state.noteTags) state.noteTags = []
  migrateLegacyNoteTags(state, now, uncategorized)
  if (!state.kbs) state.kbs = browserItemList([{ id: 'personal-demo', category: 'personal', name: '我的笔记', description: '', rootPath: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { id: 'local-demo', category: 'local', name: '我的书籍', description: '', rootPath: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }])
  if (!state.libraryFiles) state.libraryFiles = []
  if (!state.memories) state.memories = browserItemList(browserMemorySeed.map(file => ({ ...file, updatedAt: new Date().toISOString() })))
  if (!state.agentSkills) state.agentSkills = browserItemList(browserSkillSeed.map(skill => ({ ...skill, updatedAt: new Date().toISOString() })))
  else {
    state.agentSkills.forEach(skill => {
      const replacement = browserSkillSeed.find(seed => seed.name === skill.name)
      const legacyContents = browserLegacySkillContent[skill.name as keyof typeof browserLegacySkillContent]
      if (replacement && legacyContents?.includes(skill.content)) Object.assign(skill, replacement, { updatedAt: new Date().toISOString() })
    })
    browserSkillSeed.filter(seed => !state.agentSkills.some(skill => skill.name === seed.name)).forEach(seed => state.agentSkills.push({ ...seed, updatedAt: new Date().toISOString() }))
  }
  if (!state.agentToolPolicies) state.agentToolPolicies = {}
  delete state.agentToolPolicies.retrieve_knowledge
  if (!state.mcpServers) state.mcpServers = []
  if (!state.usageRecords) state.usageRecords = []
  if (!state.imageGenerations) state.imageGenerations = []
  if (!state.imageAssets) state.imageAssets = []
  state.imageAssets.forEach(asset => {
    if (!asset.dataUri && asset.contentBase64) asset.dataUri = `data:${asset.mimeType || 'image/png'};base64,${asset.contentBase64}`
  })
  if (!state.chatConversations) state.chatConversations = []
  if (!state.chatMessages) state.chatMessages = []
  if (!state.backgroundTasks) state.backgroundTasks = []
  if (!state.calendarEvents) state.calendarEvents = []
  if (!state.todos) state.todos = []
  if (!state.todoLists) state.todoLists = []
  state.todos.forEach(todo => {
    if (!Object.hasOwn(todo, 'listId') || (todo.listId && !state.todoLists.some(item => item.id === todo.listId))) todo.listId = null
  })
  if (!state.reminders) state.reminders = []
  state.backgroundTasks = state.backgroundTasks.filter(task => !['chat_response', 'agent_run'].includes(task.kind))
  state.backgroundTasks = state.backgroundTasks.filter(task => !(['succeeded', 'failed', 'cancelled', 'interrupted'].includes(task.status) && task.completedAt && new Date(task.completedAt).getTime() < Date.now() - 30 * 86400000))
  if (!state.editProposals) state.editProposals = []
  if (!state.noteRevisions) state.noteRevisions = []
  if (!state.noteLinks) {
    state.noteLinks = []
    rebuildNoteLinks(state)
  }
  if (!state.templates) state.templates = browserItemList(browserTemplateSeed.map(template => ({ ...template, updatedAt: now })))
  state.notes.forEach(note => { note.pinned = Boolean(note.pinned) })
  state.noteRevisions.forEach(revision => { if (typeof revision.contentMarkdown !== 'string') revision.contentMarkdown = '' })
  let result: unknown
  const plannerResult = handlePlannerCommand(command, args, state, now)
  const activityResult = plannerResult ? null : handleActivityCommand(command, args, state, now)
  const mediaResult = plannerResult || activityResult ? null : handleMediaCommand(command, args, state, now)
  const notesResult = plannerResult || activityResult || mediaResult ? null : handleNotesCommand(command, args, state, now, uncategorized)
  const libraryResult = plannerResult || activityResult || mediaResult || notesResult ? null : await handleLibraryCommand(command, args, state, now)
  const agentResult = plannerResult || activityResult || mediaResult || notesResult || libraryResult ? null : handleAgentCommand(command, args, state, now, browserSkillSeed, browserAgentToolDefaults)
  if (plannerResult) result = plannerResult.result
  else if (activityResult) result = activityResult.result
  else if (mediaResult) result = mediaResult.result
  else if (notesResult) result = notesResult.result
  else if (libraryResult) result = libraryResult.result
  else if (command === 'note_edit_get') result = state.editProposals.find(item => item.id === args.proposalId)
  else if (command === 'note_edit_discard') { const proposal = state.editProposals.find(item => item.id === args.proposalId); if (proposal) proposal.status = 'discarded'; result = null }
  else if (command === 'note_edit_apply') {
    const proposal = state.editProposals.find(item => item.id === args.proposalId)
    const note = state.notes.find(item => item.id === proposal?.noteId)
    if (note) { state.noteRevisions.unshift({ id: crypto.randomUUID(), noteId: note.id, title: note.title, contentHtml: note.contentHtml, contentText: note.contentText, contentMarkdown: note.contentMarkdown, reason: 'ai_edit', createdAt: now }); Object.assign(note, { contentHtml: args.contentHtml, contentText: args.contentText, contentMarkdown: args.contentMarkdown, updatedAt: now }); if (proposal) proposal.status = 'applied' }
    result = note
  }
  else if (command === 'note_revision_list') result = state.noteRevisions.filter(item => item.noteId === args.noteId)
  else if (command === 'note_revision_get') result = state.noteRevisions.find(item => item.id === args.id)
  else if (command === 'note_revision_restore') { const revision = state.noteRevisions.find(item => item.id === args.id); const note = state.notes.find(item => item.id === revision?.noteId); if (revision && note) { state.noteRevisions.unshift({ id: crypto.randomUUID(), noteId: note.id, title: note.title, contentHtml: note.contentHtml, contentText: note.contentText, contentMarkdown: note.contentMarkdown, reason: 'revision_restore', createdAt: now }); Object.assign(note, { title: revision.title, contentHtml: revision.contentHtml, contentText: revision.contentText, contentMarkdown: revision.contentMarkdown, updatedAt: now }); rebuildNoteLinks(state) } result = note }
  else if (command === 'workspace_export') { const exportedNotes = state.notes.filter(note => !note.externalPath); const exportedIds = new Set(exportedNotes.map(note => note.id)); result = { format: 'tiny-note-workspace', version: 5, exportedAt: now, notebooks: state.notebooks, notes: exportedNotes, tags: state.tags.map(({ id, name, createdAt, updatedAt }) => ({ id, name, createdAt, updatedAt })), noteTags: state.noteTags.filter(link => exportedIds.has(link.noteId)).map(({ noteId, tagId }) => ({ noteId, tagId })), knowledgeBases: state.kbs, files: state.libraryFiles.filter(file => file.kind === 'file').map(file => ({ knowledgeBaseId: file.knowledgeBaseId, relativePath: file.relativePath, contentBase64: file.contentBase64 || bytesToBase64(new globalThis.TextEncoder().encode(file.content || '')) })), templates: state.templates, links: state.noteLinks.filter(link => Boolean(link.targetNoteId) && exportedIds.has(link.sourceNoteId) && exportedIds.has(link.targetNoteId!)), imageGenerations: state.imageGenerations, imageAssets: state.imageAssets.map(({ dataUri, ...asset }) => ({ ...asset, contentBase64: String(dataUri || '').split(',')[1] || '' })), calendarEvents: state.calendarEvents, todoLists: state.todoLists, todos: state.todos, reminders: state.reminders, settings: state.settings || { theme: 'system', language: 'zh-CN', fimEnabled: false } } }
  else if (command === 'workspace_import') {
    if (!args.request?.replaceExisting) throw new Error('恢复工作区前需要确认替换现有数据')
    const backup = args.request.backup
    if (backup?.format !== 'tiny-note-workspace' || ![1, 2, 3, 4, 5].includes(backup.version)) throw new Error('不支持的备份文件')
    const backupNotebooks = backup.notebooks || []
    for (const notebook of backupNotebooks) {
      const visited = new Set([notebook.id])
      let parentId = notebook.parentId || null
      while (parentId) {
        if (visited.has(parentId)) throw new Error('备份中的笔记本层级存在循环')
        visited.add(parentId)
        const parent = backupNotebooks.find(book => book.id === parentId)
        if (!parent) throw new Error('备份中的笔记本父级不存在')
        parentId = parent.parentId || null
      }
    }
    if ((backup.noteTags || []).some(link => !(backup.notes || []).some(note => note.id === link.noteId) || !(backup.tags || []).some(tag => tag.id === link.tagId))) throw new Error('备份中的标签关联无效')
    const backupTodoLists = backup.version >= 5 ? (backup.todoLists || []) : []
    if ((backup.todos || []).some(todo => todo.listId && !backupTodoLists.some(todoList => todoList.id === todo.listId))) throw new Error('备份中的待办清单引用无效')
    state.imageGenerations = backup.imageGenerations || []
    state.imageAssets = backup.imageAssets || []
    for (const file of backup.files || []) {
      if (!(backup.knowledgeBases || []).some(base => base.id === file.knowledgeBaseId)) throw new Error('备份文件引用了未知知识库')
      const relativePath = String(file.relativePath || '').replaceAll('\\', '/')
      if (!relativePath || relativePath.startsWith('/') || relativePath.split('/').some(part => part === '..' || part === '.tiny-note.json')) throw new Error('备份文件路径无效')
      base64ToBytes(file.contentBase64 || '')
    }
    state.notes = backup.notes || []
    state.notebooks = (backup.notebooks || []).map(book => ({ ...book, parentId: book.parentId || null }))
    if (!state.notebooks.some(book => book.name === '未分类')) state.notebooks.push({ id: 'uncategorized', parentId: null, name: '未分类', description: '', createdAt: now, updatedAt: now })
    const fallbackId = state.notebooks.find(book => book.name === '未分类')!.id
    state.notebooks.find(book => book.id === fallbackId)!.parentId = null
    state.notes.forEach(note => { note.notebookId ||= fallbackId })
    state.tags = (backup.tags || []).map(tag => ({ ...tag }))
    state.noteTags = (backup.noteTags || []).map(link => ({ ...link }))
    if (backup.version < 3) migrateLegacyNoteTags(state, now, state.notebooks.find(book => book.id === fallbackId)!)
    state.kbs = backup.knowledgeBases || []
    state.libraryFiles = browserItemList((backup.files || []).map(file => ({ knowledgeBaseId: file.knowledgeBaseId, relativePath: file.relativePath, kind: 'file', size: base64ToBytes(file.contentBase64 || '').length, modifiedAt: now, contentBase64: file.contentBase64 })))
    state.templates = browserItemList([...browserTemplateSeed.map(template => ({ ...template, updatedAt: now })), ...(backup.templates || []).filter(template => !template.builtin)])
    state.noteLinks = backup.links || []
    state.notes.forEach(note => { delete note.tags; note.pinned = Boolean(note.pinned) })
    rebuildNoteLinks(state)
    state.settings = backup.settings || state.settings
    state.calendarEvents = backup.calendarEvents || []
    state.todoLists = backupTodoLists.map(item => ({ ...item }))
    state.todos = (backup.todos || []).map(todo => ({ ...todo, listId: backup.version >= 5 ? todo.listId || null : null }))
    state.reminders = backup.reminders || []
    result = null
  }
  else if (agentResult) result = agentResult.result
  else result = []
  writeBrowserState(state); return result as CommandResult<K>
}



