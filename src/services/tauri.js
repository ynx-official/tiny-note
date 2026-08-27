import { invoke as tauriInvoke } from '@tauri-apps/api/core'

const key = 'tiny-note-browser-state'
function browserState() { try { return JSON.parse(localStorage.getItem(key) || '{}') } catch { return {} } }
function saveBrowserState(state) { localStorage.setItem(key, JSON.stringify(state)) }
function normalizeRelativePath(value = '') { return String(value).replaceAll('\\', '/').replace(/^\/+|\/+$/g, '') }
function parentPath(value = '') { const path = normalizeRelativePath(value); const index = path.lastIndexOf('/'); return index < 0 ? '' : path.slice(0, index) }
function entryName(value = '') { const path = normalizeRelativePath(value); return path.split('/').pop() || path }
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
const browserDemoImageDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
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
const browserAgentToolDefaults = [
  ['list_knowledge_bases', '列出现有知识库元数据', false], ['get_current_time', '获取本机当前时间', false],
  ['list_mcp_tools', '列出已发现的 MCP 工具', false], ['call_mcp_tool', '调用外部 MCP 工具', true],
  ['delegate_task', '委派独立子任务', true], ['run_sandbox_script', '执行隔离计算脚本', true],
  ['list_notes', '列出未删除的普通笔记', false], ['search_notes', '搜索未删除的普通笔记', false], ['get_note', '读取指定笔记的完整 Markdown', false],
  ['list_notebooks', '列出笔记本及直属统计', false], ['list_agent_files', '浏览 Agent 工作区', false],
  ['read_agent_file', '读取 Agent 工作区文本文件', false], ['write_agent_file', '写入 Agent 工作区文本文件', true],
  ['read_skill', '读取 Agent 技能', false], ['write_skill', '创建或更新 Agent 技能', true],
  ['create_note', '创建笔记', true], ['create_note_in_knowledge_base', '在知识库中新建笔记', true], ['move_note_to_knowledge_base', '移动笔记到其他知识库', true], ['update_note', '生成笔记修改提案', true], ['delete_note', '将笔记移入最近删除', true],
  ['create_notebook', '创建笔记本', true], ['update_notebook', '更新笔记本信息', true], ['move_notebook', '移动笔记本层级', true], ['delete_notebook', '删除笔记本并安全归位内容', true],
  ['create_knowledge_base', '创建知识库', true], ['update_knowledge_base', '更新知识库信息', true], ['delete_knowledge_base', '删除知识库并移入回收站', true],
  ['update_memory', '更新 Agent 记忆', true]
]
function browserAgentTools(state) {
  const policies = state.agentToolPolicies || {}
  return browserAgentToolDefaults.map(([name, description, defaultRequireApproval]) => ({ name, description, defaultRequireApproval, requireApproval: Object.hasOwn(policies, name) ? policies[name] : defaultRequireApproval }))
}
function ensureLibraryParents(state, knowledgeBaseId, relativePath, now) {
  const parts = normalizeRelativePath(relativePath).split('/').filter(Boolean)
  parts.pop()
  let current = ''
  for (const part of parts) {
    current = current ? `${current}/${part}` : part
    if (!state.libraryFiles.some(file => file.knowledgeBaseId === knowledgeBaseId && file.relativePath === current)) {
      state.libraryFiles.push({ knowledgeBaseId, relativePath: current, kind: 'folder', size: 0, modifiedAt: now })
    }
  }
}
function libraryEntry(file) {
  return { name: entryName(file.relativePath), relativePath: file.relativePath, kind: file.kind, size: file.size || 0, modifiedAt: file.modifiedAt, extension: file.kind === 'file' ? (entryName(file.relativePath).split('.').pop() || '').toLowerCase() : null }
}
function normalizeTags(tags = []) {
  const seen = new Set()
  return (Array.isArray(tags) ? tags : []).map(tag => String(tag).trim().replace(/^#/, '').replace(/\s+/g, ' ')).filter(tag => {
    const key = tag.toLocaleLowerCase()
    if (!tag || seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 32)
}
function ensureBrowserTag(state, name, now) {
  const normalized = normalizeTags([name])[0]
  if (!normalized) return null
  let tag = state.tags.find(item => item.name.toLocaleLowerCase() === normalized.toLocaleLowerCase())
  if (!tag) {
    tag = { id: crypto.randomUUID(), name: normalized, createdAt: now, updatedAt: now }
    state.tags.push(tag)
  }
  return tag
}
function browserTagDto(state, tag) {
  return { ...tag, noteCount: state.noteTags.filter(link => link.tagId === tag.id && state.notes.some(note => note.id === link.noteId && !note.deletedAt && !note.externalPath)).length }
}
function validateBrowserNotebookParent(state, id, parentId) {
  if (!parentId) return
  if (id === parentId || !state.notebooks.some(book => book.id === parentId)) throw new Error('目标笔记本无效')
  let cursor = parentId
  const visited = new Set()
  while (cursor) {
    if (cursor === id || visited.has(cursor)) throw new Error('笔记本不能移动到自身或其子笔记本中')
    visited.add(cursor)
    cursor = state.notebooks.find(book => book.id === cursor)?.parentId || null
  }
}
function syncBrowserLinks(state, sourceNoteId) {
  state.noteLinks = (state.noteLinks || []).filter(link => link.sourceNoteId !== sourceNoteId)
  const source = state.notes.find(note => note.id === sourceNoteId)
  if (!source || source.externalPath) return
  const matches = String(source.contentMarkdown || '').matchAll(/\[\[([^\]]+)\]\]/g)
  for (const match of matches) {
    const title = String(match[1] || '').trim()
    const target = state.notes.find(note => !note.deletedAt && !note.externalPath && note.id !== sourceNoteId && String(note.title).toLowerCase() === title.toLowerCase())
    if (target && !state.noteLinks.some(link => link.sourceNoteId === sourceNoteId && link.targetNoteId === target.id)) state.noteLinks.push({ sourceNoteId, targetNoteId: target.id, targetTitle: target.title })
  }
}
function rebuildBrowserLinks(state) {
  state.noteLinks = []
  state.notes.filter(note => !note.deletedAt && !note.externalPath).forEach(note => syncBrowserLinks(state, note.id))
}
function bytesToBase64(bytes) {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index])
  return globalThis.btoa(binary)
}
function base64ToBytes(value) {
  const binary = globalThis.atob(value)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}
function storedFileText(file) {
  if (!file) return ''
  if (typeof file.content === 'string') return file.content
  if (!file.contentBase64) return ''
  try { return new globalThis.TextDecoder().decode(base64ToBytes(file.contentBase64)) } catch { return '' }
}

function browserPlannerReminder(state, ownerType, ownerId, input, now) {
  state.reminders = state.reminders.filter(item => !(item.ownerType === ownerType && item.ownerId === ownerId))
  if (!input) return null
  const nextFireAt = input.mode === 'before' ? null : (input.triggerAt || (input.mode === 'interval' ? new Date(Date.now() + Number(input.intervalMinutes || 1) * 60000).toISOString() : null))
  const reminder = { id: crypto.randomUUID(), ownerType, ownerId, mode: input.mode, triggerAt: input.triggerAt || null, offsetMinutes: input.offsetMinutes || null, intervalMinutes: input.intervalMinutes || null, nextFireAt, enabled: input.enabled !== false, lastFiredAt: null, stoppedAt: null, createdAt: now, updatedAt: now }
  state.reminders.push(reminder)
  return reminder
}

function normalizeBrowserTodoListInput(input = {}) {
  const name = String(input.name || '').trim()
  const color = String(input.color || '').trim().toUpperCase()
  if (!name) throw new Error('清单名称不能为空')
  if (!/^#[\dA-F]{6}$/.test(color)) throw new Error('清单颜色无效')
  return { name, color }
}

function validateBrowserTodoListId(state, listId) {
  if (listId && !state.todoLists.some(item => item.id === listId)) throw new Error('清单不存在')
}

export async function invoke(command, args = {}) {
  if (window.__TAURI_INTERNALS__) return tauriInvoke(command, args)
  const state = browserState()
  const now = new Date().toISOString()
  if (!state.notes) state.notes = []
  state.notes.forEach(note => { if (typeof note.contentMarkdown !== 'string') note.contentMarkdown = '' })
  if (!state.notebooks) state.notebooks = [{ id: 'uncategorized', parentId: null, name: '未分类', description: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
  state.notebooks.forEach(book => { if (!Object.hasOwn(book, 'parentId')) book.parentId = null })
  let uncategorized = state.notebooks.find(book => book.name === '未分类')
  if (!uncategorized) { uncategorized = { id: 'uncategorized', parentId: null, name: '未分类', description: '', createdAt: now, updatedAt: now }; state.notebooks.push(uncategorized) }
  if (!state.tags) state.tags = []
  if (!state.noteTags) state.noteTags = []
  state.notes.forEach(note => {
    note.notebookId ||= uncategorized.id
    for (const name of normalizeTags(note.tags)) {
      const tag = ensureBrowserTag(state, name, now)
      if (tag && !state.noteTags.some(link => link.noteId === note.id && link.tagId === tag.id)) state.noteTags.push({ noteId: note.id, tagId: tag.id })
    }
    delete note.tags
  })
  if (!state.kbs) state.kbs = [{ id: 'personal-demo', category: 'personal', name: '我的笔记', description: '', rootPath: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { id: 'local-demo', category: 'local', name: '我的书籍', description: '', rootPath: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
  if (!state.libraryFiles) state.libraryFiles = []
  if (!state.memories) state.memories = browserMemorySeed.map(file => ({ ...file, updatedAt: new Date().toISOString() }))
  if (!state.agentSkills) state.agentSkills = browserSkillSeed.map(skill => ({ ...skill, updatedAt: new Date().toISOString() }))
  else {
    state.agentSkills.forEach(skill => {
      const replacement = browserSkillSeed.find(seed => seed.name === skill.name)
      if (replacement && browserLegacySkillContent[skill.name]?.includes(skill.content)) Object.assign(skill, replacement, { updatedAt: new Date().toISOString() })
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
    rebuildBrowserLinks(state)
  }
  if (!state.templates) state.templates = browserTemplateSeed.map(template => ({ ...template, updatedAt: now }))
  state.notes.forEach(note => { note.pinned = Boolean(note.pinned) })
  state.noteRevisions.forEach(revision => { if (typeof revision.contentMarkdown !== 'string') revision.contentMarkdown = '' })
  let result
  if (command === 'calendar_event_list') result = state.calendarEvents.filter(item => (!args.start || item.endDate >= args.start) && (!args.end || item.startDate <= args.end)).map(item => ({ ...item, reminder: state.reminders.find(value => value.ownerType === 'calendarEvent' && value.ownerId === item.id) || null }))
  else if (command === 'calendar_event_get') { const item = state.calendarEvents.find(value => value.id === args.id); result = item ? { ...item, reminder: state.reminders.find(value => value.ownerType === 'calendarEvent' && value.ownerId === item.id) || null } : null }
  else if (command === 'calendar_event_create') { const input = args.input || {}; const id = crypto.randomUUID(); const reminder = browserPlannerReminder(state, 'calendarEvent', id, input.reminder, now); result = { id, title: input.title, startDate: input.startDate, endDate: input.endDate, startTime: input.startTime || '', endTime: input.endTime || '', allDay: Boolean(input.allDay), description: input.description || '', color: input.color || '#1E88E5', priority: input.priority || 'important', completed: Boolean(input.completed), reminder, createdAt: now, updatedAt: now }; state.calendarEvents.push({ ...result, reminder: undefined }) }
  else if (command === 'calendar_event_update') { const item = state.calendarEvents.find(value => value.id === args.id); if (!item) throw new Error('日程不存在'); const input = args.input || {}; Object.assign(item, input, { updatedAt: now }); const reminder = browserPlannerReminder(state, 'calendarEvent', item.id, input.reminder, now); if (item.completed && reminder) Object.assign(reminder, { enabled: false, nextFireAt: null, stoppedAt: now }); result = { ...item, reminder } }
  else if (command === 'calendar_event_delete') { state.calendarEvents = state.calendarEvents.filter(item => item.id !== args.id); state.reminders = state.reminders.filter(item => !(item.ownerType === 'calendarEvent' && item.ownerId === args.id)); result = null }
  else if (command === 'todo_custom_list_list') result = [...state.todoLists].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  else if (command === 'todo_custom_list_create') { const input = normalizeBrowserTodoListInput(args.input); result = { id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now }; state.todoLists.push(result) }
  else if (command === 'todo_custom_list_update') { const item = state.todoLists.find(value => value.id === args.id); if (!item) throw new Error('清单不存在'); Object.assign(item, normalizeBrowserTodoListInput(args.input), { updatedAt: now }); result = { ...item } }
  else if (command === 'todo_custom_list_delete') { if (!state.todoLists.some(value => value.id === args.id)) throw new Error('清单不存在'); state.todoLists = state.todoLists.filter(value => value.id !== args.id); state.todos.forEach(todo => { if (todo.listId === args.id) Object.assign(todo, { listId: null, updatedAt: now }) }); result = null }
  else if (command === 'todo_list') result = state.todos.map(item => ({ ...item, reminder: state.reminders.find(value => value.ownerType === 'todo' && value.ownerId === item.id) || null }))
  else if (command === 'todo_get') { const item = state.todos.find(value => value.id === args.id); result = item ? { ...item, reminder: state.reminders.find(value => value.ownerType === 'todo' && value.ownerId === item.id) || null } : null }
  else if (command === 'todo_create') { const input = args.input || {}; const id = crypto.randomUUID(); const listId = input.listId || null; validateBrowserTodoListId(state, listId); const reminder = browserPlannerReminder(state, 'todo', id, input.reminder, now); result = { id, title: input.title, notes: input.notes || '', listId, startAt: input.startAt || null, dueAt: input.dueAt || null, priority: input.priority || 'none', completedAt: null, reminder, createdAt: now, updatedAt: now }; state.todos.unshift({ ...result, reminder: undefined }) }
  else if (command === 'todo_update') { const item = state.todos.find(value => value.id === args.id); if (!item) throw new Error('待办不存在'); const input = args.input || {}; const listId = Object.hasOwn(input, 'listId') ? input.listId || null : item.listId || null; validateBrowserTodoListId(state, listId); Object.assign(item, input, { listId, updatedAt: now }); const reminder = browserPlannerReminder(state, 'todo', item.id, input.reminder, now); result = { ...item, reminder } }
  else if (command === 'todo_set_completed') { const item = state.todos.find(value => value.id === args.id); if (!item) throw new Error('待办不存在'); item.completedAt = args.completed ? now : null; item.updatedAt = now; const reminder = state.reminders.find(value => value.ownerType === 'todo' && value.ownerId === item.id) || null; if (args.completed && reminder) Object.assign(reminder, { enabled: false, nextFireAt: null, stoppedAt: now }); result = { ...item, reminder } }
  else if (command === 'todo_delete') { state.todos = state.todos.filter(item => item.id !== args.id); state.reminders = state.reminders.filter(item => !(item.ownerType === 'todo' && item.ownerId === args.id)); result = null }
  else if (command === 'reminder_stop') { const reminder = state.reminders.find(item => item.ownerType === args.ownerType && item.ownerId === args.ownerId); if (reminder) Object.assign(reminder, { enabled: false, nextFireAt: null, stoppedAt: now, updatedAt: now }); result = null }
  else if (command === 'background_task_list') result = state.backgroundTasks.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  else if (command === 'background_task_get') result = state.backgroundTasks.find(task => task.id === args.id) || null
  else if (command === 'background_task_enqueue') {
    const input = args.input || {}
    if (!['conversation_summary', 'note_ai', 'image_generation'].includes(input.kind)) throw new Error('无效的后台任务类型')
    const id = crypto.randomUUID()
    const resourceKey = input.conversationId ? `conversation:${input.conversationId}` : input.targetNoteId ? `note:${input.targetNoteId}` : `task:${id}`
    if (input.kind === 'conversation_summary' && state.backgroundTasks.some(task => task.kind === input.kind && task.conversationId === input.conversationId && ['queued', 'running', 'awaiting_approval', 'awaiting_input'].includes(task.status))) throw new Error('当前对话已有正在处理的总结任务')
    result = { id, kind: input.kind, title: input.title, status: 'queued', payload: input.payload || {}, output: '', result: null, errorCode: null, errorMessage: null, conversationId: input.conversationId || null, targetNoteId: input.targetNoteId || null, resourceKey, modelProfileId: input.modelProfileId || null, agentRunId: null, retryOf: null, createdAt: now, startedAt: null, completedAt: null, updatedAt: now }
    state.backgroundTasks.unshift(result)
  }
  else if (command === 'background_task_transition') {
    const input = args.input || {}; const task = state.backgroundTasks.find(item => item.id === input.id); if (!task) throw new Error('后台任务不存在')
    Object.assign(task, { status: input.status, output: task.output + (input.outputDelta || ''), result: input.result ?? task.result, errorCode: input.errorCode || null, errorMessage: input.errorMessage || null, agentRunId: input.agentRunId || task.agentRunId, startedAt: task.startedAt || (input.status === 'running' ? now : null), completedAt: ['succeeded', 'failed', 'cancelled'].includes(input.status) ? now : task.completedAt, updatedAt: now }); result = { ...task }
  }
  else if (command === 'background_task_cancel') { const task = state.backgroundTasks.find(item => item.id === args.id); if (!task) throw new Error('后台任务不存在'); Object.assign(task, { status: 'cancelled', completedAt: now, updatedAt: now }); result = { ...task } }
  else if (command === 'background_task_retry') { const original = state.backgroundTasks.find(item => item.id === args.id); if (!original) throw new Error('后台任务不存在'); const id = crypto.randomUUID(); result = { ...original, id, status: 'queued', output: '', result: null, errorCode: null, errorMessage: null, agentRunId: null, retryOf: original.id, createdAt: now, startedAt: null, completedAt: null, updatedAt: now }; state.backgroundTasks.unshift(result) }
  else if (command === 'background_task_clear_finished') { const before = state.backgroundTasks.length; state.backgroundTasks = state.backgroundTasks.filter(task => !['succeeded', 'failed', 'cancelled', 'interrupted'].includes(task.status)); result = before - state.backgroundTasks.length }
  else if (command === 'chat_list') result = state.chatConversations.map(conversation => { const messages = state.chatMessages.filter(message => message.conversationId === conversation.id); return { ...conversation, messageCount: messages.length, preview: messages.at(-1)?.content || '' } }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  else if (command === 'chat_create') { result = { id: crypto.randomUUID(), title: '新对话', modelProfileId: args.modelProfileId || null, mode: args.mode || 'chat', messageCount: 0, preview: '', createdAt: now, updatedAt: now }; state.chatConversations.unshift(result) }
  else if (command === 'chat_set_mode') { const conversation = state.chatConversations.find(item => item.id === args.id); if (!conversation) throw new Error('对话不存在'); if (!['chat', 'memoryless', 'agent'].includes(args.mode)) throw new Error('无效的对话模式'); conversation.mode = args.mode; conversation.updatedAt = now; result = { ...conversation } }
  else if (command === 'chat_get') { const conversation = state.chatConversations.find(item => item.id === args.id); result = conversation ? { conversation: { ...conversation, messageCount: state.chatMessages.filter(message => message.conversationId === conversation.id).length, preview: state.chatMessages.filter(message => message.conversationId === conversation.id).at(-1)?.content || '' }, messages: state.chatMessages.filter(message => message.conversationId === conversation.id) } : null }
  else if (command === 'chat_add_message') { const conversation = state.chatConversations.find(item => item.id === args.conversationId); result = { id: crypto.randomUUID(), conversationId: args.conversationId, role: args.role, content: args.content, references: args.references || [], sources: args.sources || [], proposalId: args.proposalId || null, agentRunId: args.agentRunId || null, createdAt: now }; state.chatMessages.push(result); if (conversation) conversation.updatedAt = now }
  else if (command === 'chat_delete') { state.chatConversations = state.chatConversations.filter(item => item.id !== args.id); state.chatMessages = state.chatMessages.filter(item => item.conversationId !== args.id); result = null }
  else if (command === 'chat_generate_title') { const conversation = state.chatConversations.find(item => item.id === args.conversationId); const firstRound = state.chatMessages.filter(item => item.conversationId === args.conversationId).slice(0, 2); const first = firstRound.find(item => item.role === 'user'); const compact = String(first?.content || '').replace(/\s+/g, ' ').trim(); result = firstRound.length < 2 ? '新对话' : (compact.length > 24 ? compact.slice(0, 24) + '…' : (compact || '新对话')); if (conversation?.title === '新对话' && result !== '新对话') { conversation.title = result; conversation.updatedAt = now } }
  else if (command === 'image_model_list') result = (state.models || []).filter(model => Boolean(model.imageEnabled))
  else if (command === 'image_generate') {
    const request = args.request || {}
    if (!String(request.prompt || '').trim()) throw new Error('图片描述不能为空')
    const mode = request.mode || 'generate'
    if (!['generate', 'reference', 'edit', 'inpaint'].includes(mode)) throw new Error('图片生成模式无效')
    if (mode === 'reference' && (!request.inputImages?.length || request.inputImages.length > 4)) throw new Error('参考图模式需要上传 1 至 4 张图片')
    if (['edit', 'inpaint'].includes(mode) && request.inputImages?.length !== 1) throw new Error('图片编辑需要上传 1 张原图')
    if (mode === 'inpaint' && !request.maskImage) throw new Error('局部重绘需要绘制蒙版')
    const generationId = crypto.randomUUID()
    const previewUri = mode === 'generate' ? browserDemoImageDataUri : request.inputImages?.[0]?.dataUrl || browserDemoImageDataUri
    const assets = Array.from({ length: Math.min(4, Math.max(1, Number(request.count) || 1)) }, () => ({ id: crypto.randomUUID(), generationId, relativePath: `generated-images/demo-${crypto.randomUUID()}.png`, mimeType: 'image/png', byteSize: 68, width: 1, height: 1, createdAt: now, dataUri: previewUri }))
    const generationAssets = assets.map(asset => ({ id: asset.id, generationId: asset.generationId, relativePath: asset.relativePath, mimeType: asset.mimeType, byteSize: asset.byteSize, width: asset.width, height: asset.height, createdAt: asset.createdAt }))
    const generation = { id: generationId, taskId: request.requestId, prompt: String(request.prompt).trim(), imageModelProfileId: request.imageModelProfileId || '', size: request.size || 'square', count: assets.length, mode, status: 'succeeded', errorCode: null, errorMessage: null, createdAt: now, completedAt: now, assets: generationAssets }
    state.imageGenerations.unshift(generation)
    state.imageAssets.push(...assets)
    result = { generationId, assets, usage: null }
  }
  else if (command === 'image_cancel') result = null
  else if (command === 'image_generation_list') result = state.imageGenerations.slice(0, Math.min(500, args.limit || 100)).map(generation => ({ ...generation, assets: generation.assets || [] }))
  else if (command === 'image_asset_read') { const asset = state.imageAssets.find(item => item.id === args.assetId); result = asset ? { ...asset, dataUri: asset.dataUri || browserDemoImageDataUri } : null }
  else if (command === 'image_generation_delete') { const generation = state.imageGenerations.find(item => item.id === args.generationId); state.imageGenerations = state.imageGenerations.filter(item => item.id !== args.generationId); state.imageAssets = state.imageAssets.filter(item => item.generationId !== args.generationId); result = generation ? null : null }
  else if (command === 'external_markdown_list') result = state.notes.filter(note => note.externalPath).map(note => ({ id: note.id, title: note.title, path: note.externalPath, fileName: String(note.externalPath).split(/[\\/]/).pop() || 'Markdown 文件', updatedAt: note.updatedAt, available: true })).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  else if (command === 'external_markdown_read') { const note = state.notes.find(item => item.id === args.id && item.externalPath); if (!note) throw new Error('外部来源记录不存在'); result = { path: note.externalPath, fileName: String(note.externalPath).split(/[\\/]/).pop() || 'Markdown 文件', content: null, error: null, changed: false } }
  else if (command === 'external_markdown_clear') { const ids = new Set(state.notes.filter(note => note.externalPath).map(note => note.id)); state.notes = state.notes.filter(note => !ids.has(note.id)); state.noteTags = state.noteTags.filter(link => !ids.has(link.noteId)); rebuildBrowserLinks(state); result = ids.size }
  else if (command === 'note_list') result = state.notes.filter(n => !n.externalPath && Boolean(n.deletedAt) === Boolean(args.deleted) && (args.knowledgeBaseId == null || n.knowledgeBaseId === args.knowledgeBaseId) && (args.pinned == null || Boolean(n.pinned) === Boolean(args.pinned)) && (!args.search || `${n.title} ${n.contentText}`.toLowerCase().includes(args.search.toLowerCase()))).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || String(b.updatedAt).localeCompare(String(a.updatedAt)))
  else if (command === 'note_get') result = state.notes.find(n => n.id === args.id)
  else if (command === 'note_set_pinned') { const n = state.notes.find(n => n.id === args.id); if (n) Object.assign(n, { pinned: Boolean(args.pinned), updatedAt: now }); result = n }
  else if (command === 'note_link_list') { const links = state.noteLinks.filter(link => link.sourceNoteId === args.noteId || link.targetNoteId === args.noteId); result = links.map(link => ({ ...link, targetTitle: link.sourceNoteId === args.noteId ? link.targetTitle : state.notes.find(note => note.id === link.sourceNoteId)?.title || link.targetTitle })) }
  else if (command === 'note_template_list') result = state.templates
  else if (command === 'note_template_upsert') { const input = args.template || {}; const template = { ...input, id: input.id || crypto.randomUUID(), builtin: false, updatedAt: now }; state.templates = [...state.templates.filter(item => item.id !== template.id), template]; result = template }
  else if (command === 'note_template_delete') { state.templates = state.templates.filter(item => item.builtin || item.id !== args.id); result = null }
  else if (command === 'note_create') { result = { id: crypto.randomUUID(), notebookId: args.input?.notebookId || uncategorized.id, knowledgeBaseId: args.input?.knowledgeBaseId || null, title: args.input?.title || '未命名笔记', contentHtml: args.input?.contentHtml || '', contentText: args.input?.contentText || '', contentMarkdown: args.input?.contentMarkdown || '', pinned: Boolean(args.input?.pinned), deletedAt: null, createdAt: now, updatedAt: now }; state.notes.unshift(result); rebuildBrowserLinks(state) }
  else if (command === 'note_open_external_markdown') { const existing = state.notes.find(note => note.externalPath === args.input?.path); result = existing || { id: crypto.randomUUID(), notebookId: uncategorized.id, knowledgeBaseId: null, pinned: false, deletedAt: null, createdAt: now }; Object.assign(result, args.input, { notebookId: args.input?.notebookId || uncategorized.id, externalPath: args.input?.path, updatedAt: now }); if (!existing) state.notes.unshift(result); rebuildBrowserLinks(state) }
  else if (command === 'note_update') { const n = state.notes.find(n => n.id === args.id); if (n) Object.assign(n, args.input, { notebookId: args.input?.notebookId || uncategorized.id, pinned: Boolean(args.input?.pinned), updatedAt: now }); if (n) rebuildBrowserLinks(state); result = n }
  else if (command === 'note_delete') { const n = state.notes.find(n => n.id === args.id); if (n) { n.deletedAt = now; rebuildBrowserLinks(state) } result = null }
  else if (command === 'note_copy') { const n = state.notes.find(n => n.id === args.id); result = n ? { ...n, id: crypto.randomUUID(), title: `${n.title} 副本`, createdAt: now, updatedAt: now } : null; if (result) { state.notes.unshift(result); state.noteTags.push(...state.noteTags.filter(link => link.noteId === n.id).map(link => ({ noteId: result.id, tagId: link.tagId }))); rebuildBrowserLinks(state) } }
  else if (command === 'note_move') { const n = state.notes.find(n => n.id === args.id); if (n) { n.notebookId = args.notebookId || uncategorized.id; n.updatedAt = now } result = null }
  else if (command === 'note_move_to_knowledge_base') { const n = state.notes.find(n => n.id === args.id); if (!n) throw new Error('笔记不存在'); n.knowledgeBaseId = args.knowledgeBaseId || null; n.updatedAt = now; result = n }
  else if (command === 'note_restore') { const n = state.notes.find(n => n.id === args.id); if (n) { n.deletedAt = null; rebuildBrowserLinks(state) } result = null }
  else if (command === 'note_purge') { state.notes = state.notes.filter(n => n.id !== args.id); state.noteTags = state.noteTags.filter(link => link.noteId !== args.id) }
  else if (command === 'notebook_list') result = state.notebooks
  else if (command === 'notebook_create') { const id = crypto.randomUUID(); validateBrowserNotebookParent(state, id, args.parentId || null); result = { id, parentId: args.parentId || null, name: String(args.name || '').trim(), description: args.description || '', createdAt: now, updatedAt: now }; if (!result.name || result.name === '未分类') throw new Error('笔记本名称无效'); state.notebooks.push(result) }
  else if (command === 'notebook_update') { const n = state.notebooks.find(n => n.id === args.id); const name = String(args.name || '').trim(); if (!n || n.name === '未分类') throw new Error('系统笔记本不能修改'); if (!name || name === '未分类') throw new Error('笔记本名称无效'); validateBrowserNotebookParent(state, n.id, args.parentId || null); Object.assign(n, { parentId: args.parentId || null, name, description: args.description || '', updatedAt: now }); result = null }
  else if (command === 'notebook_move') { const n = state.notebooks.find(n => n.id === args.id); if (!n || n.name === '未分类') throw new Error('系统笔记本不能移动'); validateBrowserNotebookParent(state, n.id, args.parentId || null); Object.assign(n, { parentId: args.parentId || null, updatedAt: now }); result = null }
  else if (command === 'notebook_delete') { const target = state.notebooks.find(n => n.id === args.id); if (!target || target.name === '未分类') throw new Error('系统笔记本不能删除'); state.notebooks.forEach(n => { if (n.parentId === target.id) n.parentId = target.parentId || null }); state.notes.forEach(n => { if (n.notebookId === target.id) n.notebookId = uncategorized.id }); state.notebooks = state.notebooks.filter(n => n.id !== args.id); result = null }
  else if (command === 'tag_list') result = state.tags.map(tag => browserTagDto(state, tag)).sort((a, b) => a.name.localeCompare(b.name))
  else if (command === 'tag_create') { const name = normalizeTags([args.name])[0]; if (!name) throw new Error('标签名称不能为空'); if (state.tags.some(tag => tag.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('标签已存在'); const tag = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now }; state.tags.push(tag); result = browserTagDto(state, tag) }
  else if (command === 'tag_update') { const tag = state.tags.find(item => item.id === args.id); const name = normalizeTags([args.name])[0]; if (!tag || !name) throw new Error('标签不存在或名称无效'); if (state.tags.some(item => item.id !== tag.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('标签已存在'); Object.assign(tag, { name, updatedAt: now }); result = browserTagDto(state, tag) }
  else if (command === 'tag_delete') { if (!state.tags.some(tag => tag.id === args.id)) throw new Error('标签不存在'); state.tags = state.tags.filter(tag => tag.id !== args.id); state.noteTags = state.noteTags.filter(link => link.tagId !== args.id); result = null }
  else if (command === 'note_tag_list') result = state.noteTags.filter(link => link.noteId === args.noteId).map(link => state.tags.find(tag => tag.id === link.tagId)).filter(Boolean).map(tag => browserTagDto(state, tag)).sort((a, b) => a.name.localeCompare(b.name))
  else if (command === 'tag_note_list') { const noteIds = new Set(args.untagged ? state.notes.filter(note => !note.externalPath && !state.noteTags.some(link => link.noteId === note.id)).map(note => note.id) : state.noteTags.filter(link => link.tagId === args.tagId).map(link => link.noteId)); result = state.notes.filter(note => !note.deletedAt && !note.externalPath && noteIds.has(note.id)).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || String(b.updatedAt).localeCompare(String(a.updatedAt))) }
  else if (command === 'tag_note_add') { if (!state.tags.some(tag => tag.id === args.tagId)) throw new Error('标签不存在'); for (const noteId of new Set(args.noteIds || [])) { if (!state.notes.some(note => note.id === noteId && !note.deletedAt)) throw new Error('笔记不存在'); if (!state.noteTags.some(link => link.noteId === noteId && link.tagId === args.tagId)) state.noteTags.push({ noteId, tagId: args.tagId }) } result = null }
  else if (command === 'tag_note_remove') { const ids = new Set(args.noteIds || []); state.noteTags = state.noteTags.filter(link => link.tagId !== args.tagId || !ids.has(link.noteId)); result = null }
  else if (command === 'knowledge_base_list') result = state.kbs
  else if (command === 'knowledge_base_create') { result = { id: crypto.randomUUID(), category: args.input.category, name: args.input.name, description: args.input.description || '', cover: null, rootPath: '', createdAt: now, updatedAt: now }; state.kbs.push(result) }
  else if (command === 'knowledge_base_update') { const k = state.kbs.find(k => k.id === args.id); if (k) Object.assign(k, { name: args.name, description: args.description || '', cover: args.cover }); result = null }
  else if (command === 'knowledge_base_delete') { state.kbs = state.kbs.filter(k => k.id !== args.id); state.notes.forEach(note => { if (note.knowledgeBaseId === args.id) note.knowledgeBaseId = null }); state.libraryFiles = state.libraryFiles.filter(file => file.knowledgeBaseId !== args.id); result = null }
  else if (command === 'library_list') {
    const baseId = args.knowledgeBaseId
    const current = normalizeRelativePath(args.relativePath || '')
    const query = String(args.search || '').trim().toLowerCase()
    const scoped = state.libraryFiles.filter(file => file.knowledgeBaseId === baseId)
    const visible = scoped.filter(file => {
      const path = normalizeRelativePath(file.relativePath)
      const direct = parentPath(path) === current
      const searchable = !query || entryName(path).toLowerCase().includes(query)
      return query ? searchable : direct
    })
    result = visible.sort((a, b) => (a.kind === b.kind ? a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: 'base' }) : a.kind === 'folder' ? -1 : 1)).map(libraryEntry)
  }
  else if (command === 'library_create_folder') {
    const baseId = args.knowledgeBaseId
    const parent = normalizeRelativePath(args.relativePath || '')
    const folder = String(args.name || '').trim()
    const relativePath = parent ? `${parent}/${folder}` : folder
    if (folder && !folder.includes('/') && !folder.includes('\\') && !state.libraryFiles.some(file => file.knowledgeBaseId === baseId && file.relativePath === relativePath)) {
      ensureLibraryParents(state, baseId, relativePath, now)
      state.libraryFiles.push({ knowledgeBaseId: baseId, relativePath, kind: 'folder', size: 0, modifiedAt: now })
    }
    result = null
  }
  else if (command === 'library_write_file') {
    const baseId = args.knowledgeBaseId
    const relativePath = normalizeRelativePath(args.relativePath)
    ensureLibraryParents(state, baseId, relativePath, now)
    let finalPath = relativePath
    let suffix = 2
    while (state.libraryFiles.some(file => file.knowledgeBaseId === baseId && file.relativePath === finalPath)) {
      const name = entryName(relativePath)
      const parent = parentPath(relativePath)
      const dot = name.lastIndexOf('.')
      const stem = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      finalPath = `${parent ? `${parent}/` : ''}${stem} (${suffix})${ext}`
      suffix += 1
    }
    state.libraryFiles.push({ knowledgeBaseId: baseId, relativePath: finalPath, kind: 'file', size: String(args.content || '').length, modifiedAt: now, content: String(args.content || '') })
    result = libraryEntry(state.libraryFiles[state.libraryFiles.length - 1])
  }
  else if (command === 'library_write_file_bytes') {
    const baseId = args.knowledgeBaseId
    const relativePath = normalizeRelativePath(args.relativePath)
    ensureLibraryParents(state, baseId, relativePath, now)
    let finalPath = relativePath
    let suffix = 2
    while (state.libraryFiles.some(file => file.knowledgeBaseId === baseId && file.relativePath === finalPath)) {
      const name = entryName(relativePath)
      const parent = parentPath(relativePath)
      const dot = name.lastIndexOf('.')
      const stem = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      finalPath = `${parent ? `${parent}/` : ''}${stem} (${suffix})${ext}`
      suffix += 1
    }
    const bytes = Array.isArray(args.content) ? Uint8Array.from(args.content) : base64ToBytes(args.contentBase64 || '')
    state.libraryFiles.push({ knowledgeBaseId: baseId, relativePath: finalPath, kind: 'file', size: bytes.length, modifiedAt: now, contentBase64: bytesToBase64(bytes) })
    result = libraryEntry(state.libraryFiles[state.libraryFiles.length - 1])
  }
  else if (command === 'library_import_url') {
    if (!/^https?:\/\//i.test(String(args.url || '').trim())) throw new Error('只支持 HTTP 或 HTTPS 地址')
    const response = await globalThis.fetch(args.url)
    if (!response.ok) throw new Error('URL 导入失败')
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length > 5 * 1024 * 1024) throw new Error('远程文件不能超过 5MB')
    const url = new globalThis.URL(args.url)
    const name = args.relativePath || url.pathname.split('/').filter(Boolean).pop() || 'imported.md'
    result = await invoke('library_write_file_bytes', { knowledgeBaseId: args.knowledgeBaseId, relativePath: name, content: Array.from(bytes) })
  }
  else if (command === 'library_rename') {
    const baseId = args.knowledgeBaseId
    const oldPath = normalizeRelativePath(args.relativePath)
    const nextName = String(args.newName || '').trim()
    const target = `${parentPath(oldPath) ? `${parentPath(oldPath)}/` : ''}${nextName}`
    const targetExists = state.libraryFiles.some(file => file.knowledgeBaseId === baseId && file.relativePath === target)
    if (!targetExists && nextName && !nextName.includes('/') && !nextName.includes('\\')) {
      state.libraryFiles.filter(file => file.knowledgeBaseId === baseId && (file.relativePath === oldPath || file.relativePath.startsWith(`${oldPath}/`))).forEach(file => { file.relativePath = target + file.relativePath.slice(oldPath.length) })
    }
    result = null
  }
  else if (command === 'library_move_to_trash') {
    const baseId = args.knowledgeBaseId
    const target = normalizeRelativePath(args.relativePath)
    state.libraryFiles = state.libraryFiles.filter(file => !(file.knowledgeBaseId === baseId && (file.relativePath === target || file.relativePath.startsWith(`${target}/`))))
    result = null
  }
  else if (command === 'library_preview') {
    const target = normalizeRelativePath(args.relativePath)
    const file = state.libraryFiles.find(item => item.knowledgeBaseId === args.knowledgeBaseId && item.relativePath === target)
    const extension = (entryName(target).split('.').pop() || '').toLowerCase()
    const kind = extension === 'html' || extension === 'htm' ? 'html' : extension || 'text'
    const extensionMime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }
    result = file ? extensionMime[extension] ? { title: entryName(target), kind: 'image', mimeType: extensionMime[extension], content: `data:${extensionMime[extension]};base64,${file.contentBase64 || ''}` } : ['pdf', 'epub'].includes(extension) ? { title: entryName(target), kind: 'unsupported', mimeType: 'application/octet-stream', content: '该文件已保存，但当前版本暂不提供预览。' } : { title: entryName(target), kind, mimeType: kind === 'html' ? 'text/html' : 'text/plain', content: storedFileText(file) } : null
  }
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
  else if (command === 'note_revision_restore') { const revision = state.noteRevisions.find(item => item.id === args.id); const note = state.notes.find(item => item.id === revision?.noteId); if (revision && note) { state.noteRevisions.unshift({ id: crypto.randomUUID(), noteId: note.id, title: note.title, contentHtml: note.contentHtml, contentText: note.contentText, contentMarkdown: note.contentMarkdown, reason: 'revision_restore', createdAt: now }); Object.assign(note, { title: revision.title, contentHtml: revision.contentHtml, contentText: revision.contentText, contentMarkdown: revision.contentMarkdown, updatedAt: now }); rebuildBrowserLinks(state) } result = note }
  else if (command === 'workspace_export') { const exportedNotes = state.notes.filter(note => !note.externalPath); const exportedIds = new Set(exportedNotes.map(note => note.id)); result = { format: 'tiny-note-workspace', version: 5, exportedAt: now, notebooks: state.notebooks, notes: exportedNotes, tags: state.tags.map(({ id, name, createdAt, updatedAt }) => ({ id, name, createdAt, updatedAt })), noteTags: state.noteTags.filter(link => exportedIds.has(link.noteId)).map(({ noteId, tagId }) => ({ noteId, tagId })), knowledgeBases: state.kbs, files: state.libraryFiles.filter(file => file.kind === 'file').map(file => ({ knowledgeBaseId: file.knowledgeBaseId, relativePath: file.relativePath, contentBase64: file.contentBase64 || bytesToBase64(new globalThis.TextEncoder().encode(file.content || '')) })), templates: state.templates, links: state.noteLinks.filter(link => exportedIds.has(link.sourceNoteId) && exportedIds.has(link.targetNoteId)), imageGenerations: state.imageGenerations, imageAssets: state.imageAssets.map(({ dataUri, ...asset }) => ({ ...asset, contentBase64: String(dataUri || '').split(',')[1] || '' })), calendarEvents: state.calendarEvents, todoLists: state.todoLists, todos: state.todos, reminders: state.reminders, settings: state.settings || { theme: 'system', language: 'zh-CN', fimEnabled: false } } }
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
    const fallbackId = state.notebooks.find(book => book.name === '未分类').id
    state.notebooks.find(book => book.id === fallbackId).parentId = null
    state.notes.forEach(note => { note.notebookId ||= fallbackId })
    state.tags = (backup.tags || []).map(tag => ({ ...tag }))
    state.noteTags = (backup.noteTags || []).map(link => ({ ...link }))
    if (backup.version < 3) {
      for (const note of state.notes) {
        for (const name of normalizeTags(note.tags)) {
          const tag = ensureBrowserTag(state, name, now)
          if (tag && !state.noteTags.some(link => link.noteId === note.id && link.tagId === tag.id)) state.noteTags.push({ noteId: note.id, tagId: tag.id })
        }
        delete note.tags
      }
    }
    state.kbs = backup.knowledgeBases || []
    state.libraryFiles = (backup.files || []).map(file => ({ knowledgeBaseId: file.knowledgeBaseId, relativePath: file.relativePath, kind: 'file', size: base64ToBytes(file.contentBase64 || '').length, modifiedAt: now, contentBase64: file.contentBase64 }))
    state.templates = [...browserTemplateSeed.map(template => ({ ...template, updatedAt: now })), ...(backup.templates || []).filter(template => !template.builtin)]
    state.noteLinks = backup.links || []
    state.notes.forEach(note => { delete note.tags; note.pinned = Boolean(note.pinned) })
    rebuildBrowserLinks(state)
    state.settings = backup.settings || state.settings
    state.calendarEvents = backup.calendarEvents || []
    state.todoLists = backupTodoLists.map(item => ({ ...item }))
    state.todos = (backup.todos || []).map(todo => ({ ...todo, listId: backup.version >= 5 ? todo.listId || null : null }))
    state.reminders = backup.reminders || []
    result = null
  }
  else if (command === 'settings_get') result = state.settings || { theme: 'system', language: 'zh-CN', fimEnabled: false }
  else if (command === 'settings_update') { state.settings = args.settings; result = state.settings }
  else if (command === 'memory_list') result = state.memories
  else if (command === 'memory_update') {
    const memory = state.memories.find(item => item.fileName === args.fileName)
    if (!memory) throw new Error('记忆文件不存在')
    memory.content = String(args.content || '')
    memory.size = memory.content.length
    memory.updatedAt = now
    result = null
  }
  else if (command === 'agent_skill_list') result = state.agentSkills.map(skill => ({ name: skill.name, description: skill.description, fileName: skill.fileName, builtin: skill.builtin, updatedAt: skill.updatedAt }))
  else if (command === 'agent_skill_read') result = state.agentSkills.find(skill => skill.fileName === `${args.name}/SKILL.md`) || null
  else if (command === 'agent_skill_upsert') {
    const request = args.request || {}
    const match = String(request.content || '').match(/description:\s*(.+)/)
    const skill = { name: request.name, description: match?.[1]?.trim() || '自定义 Agent 技能', fileName: `${request.name}/SKILL.md`, builtin: browserSkillSeed.some(item => item.name === request.name), content: request.content || '', updatedAt: now }
    state.agentSkills = [...state.agentSkills.filter(item => item.fileName !== skill.fileName), skill]
    result = skill
  }
  else if (command === 'agent_skill_delete') { state.agentSkills = state.agentSkills.filter(skill => skill.builtin || skill.fileName !== `${args.name}/SKILL.md`); result = null }
  else if (command === 'agent_mcp_list') result = state.mcpServers
  else if (command === 'agent_mcp_upsert') {
    const request = args.request || {}
    const previous = state.mcpServers.find(item => item.id === request.id)
    result = { id: request.id, name: request.name, command: request.command, args: request.args || [], enabled: request.enabled !== false, cachedTools: previous?.cachedTools || [], lastError: null, updatedAt: now }
    state.mcpServers = [...state.mcpServers.filter(item => item.id !== result.id), result]
  }
  else if (command === 'agent_mcp_refresh') {
    const server = state.mcpServers.find(item => item.id === args.id)
    if (!server) throw new Error('MCP 服务不存在')
    server.cachedTools = server.cachedTools || []
    server.lastError = '浏览器预览不能启动本机 MCP 服务，请在桌面应用中刷新。'
    server.updatedAt = now
    result = server
  }
  else if (command === 'agent_mcp_delete') { state.mcpServers = state.mcpServers.filter(item => item.id !== args.id); result = null }
  else if (command === 'usage_get_stats') {
    const range = args.range || 'all'
    const start = range === 'today' ? new Date(new Date().setHours(0, 0, 0, 0)).getTime() : range === '7d' ? Date.now() - 7 * 86400000 : range === '30d' ? Date.now() - 30 * 86400000 : 0
    const records = state.usageRecords.filter(item => item.ts >= start)
    const summary = records.reduce((acc, item) => { acc.totalPrompt += item.promptTokens; acc.totalCompletion += item.completionTokens; acc.totalTokens += item.totalTokens; acc.totalReasoning += item.reasoningTokens || 0; return acc }, { totalPrompt: 0, totalCompletion: 0, totalTokens: 0, totalReasoning: 0, totalRequests: records.length })
    result = { range, summary, byModel: [], byDay: [], bySource: [] }
  }
  else if (command === 'usage_clear') { state.usageRecords = []; result = null }
  else if (command === 'agent_get_pending_run' || command === 'agent_get_run') result = null
  else if (command === 'agent_cancel' || command === 'agent_resume') result = null
  else if (command === 'agent_list_tools') result = browserAgentTools(state)
  else if (command === 'agent_tool_policy_update') {
    const request = args.request || args
    const known = new Set(browserAgentToolDefaults.map(([name]) => name))
    if (!request.toolNames?.length || request.toolNames.some(name => !known.has(name))) throw new Error('工具审批策略无效')
    for (const name of request.toolNames) {
      if (request.requireApproval === null || request.requireApproval === undefined) delete state.agentToolPolicies[name]
      else state.agentToolPolicies[name] = Boolean(request.requireApproval)
    }
    result = browserAgentTools(state)
  }
  else if (command === 'model_list') result = (state.models || []).map(model => ({ ...model, imageEnabled: Boolean(model.imageEnabled), isImageDefault: Boolean(model.isImageDefault) }))
  else if (command === 'model_fetch_models') {
    // Keep the browser fallback aligned with the Tauri DTO shape while
    // accepting the legacy flat shape during hot reloads.
    const request = args.request || args
    const provider = String(request.provider || '').toLowerCase()
    const presets = provider.includes('deepseek') ? ['deepseek-chat', 'deepseek-reasoner'] : provider.includes('智谱') || provider.includes('zhipu') ? ['glm-4-flash', 'glm-4-plus'] : provider.includes('kimi') || provider.includes('moonshot') ? ['moonshot-v1-8k', 'moonshot-v1-32k'] : provider.includes('minimax') ? ['MiniMax-Text-01'] : provider.includes('千问') || provider.includes('qwen') ? ['qwen-turbo', 'qwen-plus', 'qwen-max'] : ['gpt-4o-mini', 'gpt-4.1-mini']
    result = presets.map(id => ({ id, name: id, ownedBy: request.provider || 'OpenAI-compatible' }))
  }
  else if (command === 'model_test') result = { ok: true, message: '连接成功', latencyMs: 86 }
  else if (command === 'model_query_balance') {
    const model = (state.models || []).find(item => item.id === args.modelId)
    result = { supported: false, available: null, currency: null, totalBalance: 0, grantedBalance: 0, toppedUpBalance: 0, voucherBalance: 0, cashBalance: 0, updatedAt: now, error: model?.provider?.toLowerCase().includes('deepseek') ? '余额查询需要桌面端凭据服务。' : null }
  }
  else if (command === 'model_upsert') { state.models = [...(state.models || []).filter(m => m.id !== args.profile.id), { endpointType: 'openaiChat', imageEnabled: false, isImageDefault: false, ...args.profile, apiKeyConfigured: Boolean(args.apiKey) || args.profile.apiKeyConfigured }]; result = null }
  else if (command === 'model_delete') { state.models = (state.models || []).filter(m => m.id !== args.id); result = null }
  else result = []
  saveBrowserState(state); return result
}
