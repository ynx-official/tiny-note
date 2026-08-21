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
  { name: 'knowledge-research', description: '检索并汇总 Tiny Note 本地知识，保留来源和不确定性。', fileName: 'knowledge-research/SKILL.md', builtin: true, content: '---\nname: knowledge-research\ndescription: 检索并汇总 Tiny Note 本地知识，保留来源和不确定性。\n---\n\n# 知识调研\n\n先检索，再汇总并保留来源。\n' },
  { name: 'note-organizer', description: '将零散材料整理为结构清晰、便于后续维护的笔记。', fileName: 'note-organizer/SKILL.md', builtin: true, content: '---\nname: note-organizer\ndescription: 将零散材料整理为结构清晰、便于后续维护的笔记。\n---\n\n# 笔记整理\n\n保持结构清晰，不添加未知事实。\n' }
]
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
  return { name: entryName(file.relativePath), relativePath: file.relativePath, kind: file.kind, size: file.size || 0, modifiedAt: file.modifiedAt, extension: file.kind === 'file' ? (entryName(file.relativePath).split('.').pop() || '').toLowerCase() : null, indexStatus: file.kind === 'file' ? 'indexed' : null }
}

export async function invoke(command, args = {}) {
  if (window.__TAURI_INTERNALS__) return tauriInvoke(command, args)
  const state = browserState()
  if (!state.notes) state.notes = []
  state.notes.forEach(note => { if (typeof note.contentMarkdown !== 'string') note.contentMarkdown = '' })
  if (!state.notebooks) state.notebooks = [{ id: 'uncategorized', name: '未分类', description: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
  if (!state.kbs) state.kbs = [{ id: 'personal-demo', category: 'personal', name: '我的笔记', description: '', rootPath: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { id: 'local-demo', category: 'local', name: '我的书籍', description: '', rootPath: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
  if (!state.libraryFiles) state.libraryFiles = []
  if (!state.memories) state.memories = browserMemorySeed.map(file => ({ ...file, updatedAt: new Date().toISOString() }))
  if (!state.agentSkills) state.agentSkills = browserSkillSeed.map(skill => ({ ...skill, updatedAt: new Date().toISOString() }))
  if (!state.mcpServers) state.mcpServers = []
  if (!state.usageRecords) state.usageRecords = []
  if (!state.chatConversations) state.chatConversations = []
  if (!state.chatMessages) state.chatMessages = []
  if (!state.editProposals) state.editProposals = []
  if (!state.noteRevisions) state.noteRevisions = []
  state.noteRevisions.forEach(revision => { if (typeof revision.contentMarkdown !== 'string') revision.contentMarkdown = '' })
  const now = new Date().toISOString()
  let result
  if (command === 'chat_list') result = state.chatConversations.map(conversation => { const messages = state.chatMessages.filter(message => message.conversationId === conversation.id); return { ...conversation, messageCount: messages.length, preview: messages.at(-1)?.content || '' } }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  else if (command === 'chat_create') { result = { id: crypto.randomUUID(), title: '新对话', modelProfileId: args.modelProfileId || null, mode: args.mode || 'chat', messageCount: 0, preview: '', createdAt: now, updatedAt: now }; state.chatConversations.unshift(result) }
  else if (command === 'chat_set_mode') { const conversation = state.chatConversations.find(item => item.id === args.id); if (!conversation) throw new Error('对话不存在'); if (!['chat', 'memoryless', 'agent'].includes(args.mode)) throw new Error('无效的对话模式'); conversation.mode = args.mode; conversation.updatedAt = now; result = { ...conversation } }
  else if (command === 'chat_get') { const conversation = state.chatConversations.find(item => item.id === args.id); result = conversation ? { conversation: { ...conversation, messageCount: state.chatMessages.filter(message => message.conversationId === conversation.id).length, preview: state.chatMessages.filter(message => message.conversationId === conversation.id).at(-1)?.content || '' }, messages: state.chatMessages.filter(message => message.conversationId === conversation.id) } : null }
  else if (command === 'chat_add_message') { const conversation = state.chatConversations.find(item => item.id === args.conversationId); result = { id: crypto.randomUUID(), conversationId: args.conversationId, role: args.role, content: args.content, references: args.references || [], sources: args.sources || [], proposalId: args.proposalId || null, agentRunId: args.agentRunId || null, createdAt: now }; state.chatMessages.push(result); if (conversation) conversation.updatedAt = now }
  else if (command === 'chat_delete') { state.chatConversations = state.chatConversations.filter(item => item.id !== args.id); state.chatMessages = state.chatMessages.filter(item => item.conversationId !== args.id); result = null }
  else if (command === 'chat_generate_title') { const conversation = state.chatConversations.find(item => item.id === args.conversationId); const firstRound = state.chatMessages.filter(item => item.conversationId === args.conversationId).slice(0, 2); const first = firstRound.find(item => item.role === 'user'); const compact = String(first?.content || '').replace(/\s+/g, ' ').trim(); result = firstRound.length < 2 ? '新对话' : (compact.length > 24 ? compact.slice(0, 24) + '…' : (compact || '新对话')); if (conversation?.title === '新对话' && result !== '新对话') { conversation.title = result; conversation.updatedAt = now } }
  else if (command === 'note_list') result = state.notes.filter(n => Boolean(n.deletedAt) === Boolean(args.deleted) && (!args.search || `${n.title} ${n.contentText}`.toLowerCase().includes(args.search.toLowerCase())))
  else if (command === 'note_get') result = state.notes.find(n => n.id === args.id)
  else if (command === 'note_create') { result = { id: crypto.randomUUID(), notebookId: args.input?.notebookId || 'uncategorized', title: args.input?.title || '未命名笔记', contentHtml: args.input?.contentHtml || '', contentText: args.input?.contentText || '', contentMarkdown: args.input?.contentMarkdown || '', deletedAt: null, createdAt: now, updatedAt: now }; state.notes.unshift(result) }
  else if (command === 'note_update') { const n = state.notes.find(n => n.id === args.id); if (n) Object.assign(n, args.input, { updatedAt: now }); result = n }
  else if (command === 'note_delete') { const n = state.notes.find(n => n.id === args.id); if (n) n.deletedAt = now; result = null }
  else if (command === 'note_copy') { const n = state.notes.find(n => n.id === args.id); result = n ? { ...n, id: crypto.randomUUID(), title: `${n.title} 副本`, createdAt: now, updatedAt: now } : null; if (result) state.notes.unshift(result) }
  else if (command === 'note_move') { const n = state.notes.find(n => n.id === args.id); if (n) n.notebookId = args.notebookId; result = null }
  else if (command === 'note_restore') { const n = state.notes.find(n => n.id === args.id); if (n) n.deletedAt = null; result = null }
  else if (command === 'note_purge') state.notes = state.notes.filter(n => n.id !== args.id)
  else if (command === 'notebook_list') result = state.notebooks
  else if (command === 'notebook_create') { result = { id: crypto.randomUUID(), name: args.name, description: args.description || '', createdAt: now, updatedAt: now }; state.notebooks.push(result) }
  else if (command === 'notebook_update') { const n = state.notebooks.find(n => n.id === args.id); if (n) Object.assign(n, { name: args.name, description: args.description || '', updatedAt: now }); result = null }
  else if (command === 'notebook_delete') { state.notes.forEach(n => { if (n.notebookId === args.id) n.notebookId = 'uncategorized' }); state.notebooks = state.notebooks.filter(n => n.id !== args.id); result = null }
  else if (command === 'knowledge_base_list') result = state.kbs
  else if (command === 'knowledge_base_create') { result = { id: crypto.randomUUID(), category: args.input.category, name: args.input.name, description: args.input.description || '', cover: null, rootPath: '', createdAt: now, updatedAt: now }; state.kbs.push(result) }
  else if (command === 'knowledge_base_update') { const k = state.kbs.find(k => k.id === args.id); if (k) Object.assign(k, { name: args.name, description: args.description || '', cover: args.cover }); result = null }
  else if (command === 'knowledge_base_delete') { state.kbs = state.kbs.filter(k => k.id !== args.id); state.libraryFiles = state.libraryFiles.filter(file => file.knowledgeBaseId !== args.id); result = null }
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
    result = file ? { title: entryName(target), kind, mimeType: kind === 'html' ? 'text/html' : 'text/plain', content: file.content || '' } : null
  }
  else if (command === 'context_search') {
    const query = String(args.query || '').toLowerCase()
    const noteSources = state.notes.filter(note => !note.deletedAt && `${note.title} ${note.contentText}`.toLowerCase().includes(query)).map(note => ({ id: `note:${note.id}`, sourceType: 'note', title: note.title, noteId: note.id, knowledgeBaseId: null, relativePath: null, snippet: note.contentText.slice(0, 160), content: note.contentText.slice(0, 2000), contentHash: '', score: 1, explicit: false, truncated: note.contentText.length > 2000 }))
    const fileSources = state.libraryFiles.filter(file => file.kind === 'file' && `${file.relativePath} ${file.content || ''}`.toLowerCase().includes(query)).map(file => ({ id: `file:${file.knowledgeBaseId}:${file.relativePath}`, sourceType: 'file', title: entryName(file.relativePath), noteId: null, knowledgeBaseId: file.knowledgeBaseId, relativePath: file.relativePath, snippet: String(file.content || '').slice(0, 160), content: String(file.content || '').slice(0, 2000), contentHash: '', score: 1, explicit: false, truncated: String(file.content || '').length > 2000 }))
    result = { sources: [...noteSources, ...fileSources].slice(0, 6), totalCharacters: 0, truncated: false }
  }
  else if (command === 'search_index_status' || command === 'search_index_rebuild' || command === 'search_index_retry_failed') result = { documents: state.notes.filter(note => !note.deletedAt).length + state.libraryFiles.filter(file => file.kind === 'file').length, chunks: state.notes.length + state.libraryFiles.length, indexed: state.notes.filter(note => !note.deletedAt).length + state.libraryFiles.filter(file => file.kind === 'file').length, failed: 0, unsupported: 0 }
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
  else if (command === 'note_revision_restore') { const revision = state.noteRevisions.find(item => item.id === args.id); const note = state.notes.find(item => item.id === revision?.noteId); if (revision && note) { state.noteRevisions.unshift({ id: crypto.randomUUID(), noteId: note.id, title: note.title, contentHtml: note.contentHtml, contentText: note.contentText, contentMarkdown: note.contentMarkdown, reason: 'revision_restore', createdAt: now }); Object.assign(note, { title: revision.title, contentHtml: revision.contentHtml, contentText: revision.contentText, contentMarkdown: revision.contentMarkdown, updatedAt: now }) } result = note }
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
  else if (command === 'agent_list_tools') result = [
    { name: 'get_current_time', description: '获取本机当前时间', requireApproval: false },
    { name: 'list_mcp_tools', description: '列出已发现的 MCP 工具', requireApproval: false },
    { name: 'call_mcp_tool', description: '调用外部 MCP 工具', requireApproval: true },
    { name: 'delegate_task', description: '委派独立子任务', requireApproval: true },
    { name: 'run_sandbox_script', description: '执行隔离计算脚本', requireApproval: true },
    { name: 'search_notes', description: '搜索未删除笔记', requireApproval: false },
    { name: 'get_note', description: '读取指定笔记', requireApproval: false },
    { name: 'retrieve_knowledge', description: '检索笔记和文本知识库', requireApproval: false },
    { name: 'list_agent_files', description: '浏览 Agent 工作区', requireApproval: false },
    { name: 'read_agent_file', description: '读取 Agent 工作区文本文件', requireApproval: false },
    { name: 'write_agent_file', description: '写入 Agent 工作区文本文件', requireApproval: true },
    { name: 'read_skill', description: '读取 Agent 技能', requireApproval: false },
    { name: 'write_skill', description: '创建或更新 Agent 技能', requireApproval: true },
    { name: 'create_note', description: '创建笔记', requireApproval: true },
    { name: 'update_note', description: '生成笔记修改提案', requireApproval: true },
    { name: 'update_memory', description: '更新 Agent 记忆', requireApproval: true }
  ]
  else if (command === 'model_list') result = state.models || []
  else if (command === 'model_fetch_models') {
    // Keep the browser fallback aligned with the Tauri DTO shape while
    // accepting the legacy flat shape during hot reloads.
    const request = args.request || args
    const provider = String(request.provider || '').toLowerCase()
    const presets = provider.includes('deepseek') ? ['deepseek-chat', 'deepseek-reasoner'] : provider.includes('智谱') || provider.includes('zhipu') ? ['glm-4-flash', 'glm-4-plus'] : provider.includes('kimi') || provider.includes('moonshot') ? ['moonshot-v1-8k', 'moonshot-v1-32k'] : provider.includes('minimax') ? ['MiniMax-Text-01'] : provider.includes('千问') || provider.includes('qwen') ? ['qwen-turbo', 'qwen-plus', 'qwen-max'] : ['gpt-4o-mini', 'gpt-4.1-mini']
    result = presets.map(id => ({ id, name: id, ownedBy: request.provider || 'OpenAI-compatible' }))
  }
  else if (command === 'model_query_balance') {
    const model = (state.models || []).find(item => item.id === args.modelId)
    result = { supported: false, available: null, currency: null, totalBalance: 0, grantedBalance: 0, toppedUpBalance: 0, voucherBalance: 0, cashBalance: 0, updatedAt: now, error: model?.provider?.toLowerCase().includes('deepseek') ? '余额查询需要桌面端凭据服务。' : null }
  }
  else if (command === 'model_upsert') { state.models = [...(state.models || []).filter(m => m.id !== args.profile.id), { ...args.profile, apiKeyConfigured: Boolean(args.apiKey) || args.profile.apiKeyConfigured }]; result = null }
  else if (command === 'model_delete') { state.models = (state.models || []).filter(m => m.id !== args.id); result = null }
  else result = []
  saveBrowserState(state); return result
}
