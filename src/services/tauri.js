import { invoke as tauriInvoke } from '@tauri-apps/api/core'

const key = 'tiny-note-browser-state'
function browserState() { try { return JSON.parse(localStorage.getItem(key) || '{}') } catch { return {} } }
function saveBrowserState(state) { localStorage.setItem(key, JSON.stringify(state)) }
function normalizeRelativePath(value = '') { return String(value).replaceAll('\\', '/').replace(/^\/+|\/+$/g, '') }
function parentPath(value = '') { const path = normalizeRelativePath(value); const index = path.lastIndexOf('/'); return index < 0 ? '' : path.slice(0, index) }
function entryName(value = '') { const path = normalizeRelativePath(value); return path.split('/').pop() || path }
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

export async function invoke(command, args = {}) {
  if (window.__TAURI_INTERNALS__) return tauriInvoke(command, args)
  const state = browserState()
  if (!state.notes) state.notes = []
  if (!state.notebooks) state.notebooks = [{ id: 'uncategorized', name: '未分类', description: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
  if (!state.kbs) state.kbs = [{ id: 'personal-demo', category: 'personal', name: '我的笔记', description: '', rootPath: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { id: 'local-demo', category: 'local', name: '我的书籍', description: '', rootPath: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
  if (!state.libraryFiles) state.libraryFiles = []
  const now = new Date().toISOString()
  let result
  if (command === 'note_list') result = state.notes.filter(n => Boolean(n.deletedAt) === Boolean(args.deleted) && (!args.search || `${n.title} ${n.contentText}`.toLowerCase().includes(args.search.toLowerCase())))
  else if (command === 'note_get') result = state.notes.find(n => n.id === args.id)
  else if (command === 'note_create') { result = { id: crypto.randomUUID(), notebookId: args.input?.notebookId || 'uncategorized', title: args.input?.title || '未命名笔记', contentHtml: args.input?.contentHtml || '', contentText: args.input?.contentText || '', deletedAt: null, createdAt: now, updatedAt: now }; state.notes.unshift(result) }
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
  else if (command === 'settings_get') result = state.settings || { theme: 'system', language: 'zh-CN', fimEnabled: false }
  else if (command === 'settings_update') { state.settings = args.settings; result = state.settings }
  else if (command === 'model_list') result = state.models || []
  else if (command === 'model_fetch_models') {
    // Keep the browser fallback aligned with the Tauri DTO shape while
    // accepting the legacy flat shape during hot reloads.
    const request = args.request || args
    const provider = String(request.provider || '').toLowerCase()
    const presets = provider.includes('deepseek') ? ['deepseek-chat', 'deepseek-reasoner'] : provider.includes('智谱') || provider.includes('zhipu') ? ['glm-4-flash', 'glm-4-plus'] : provider.includes('kimi') || provider.includes('moonshot') ? ['moonshot-v1-8k', 'moonshot-v1-32k'] : provider.includes('minimax') ? ['MiniMax-Text-01'] : provider.includes('千问') || provider.includes('qwen') ? ['qwen-turbo', 'qwen-plus', 'qwen-max'] : ['gpt-4o-mini', 'gpt-4.1-mini']
    result = presets.map(id => ({ id, name: id, ownedBy: request.provider || 'OpenAI-compatible' }))
  }
  else if (command === 'model_upsert') { state.models = [...(state.models || []).filter(m => m.id !== args.profile.id), { ...args.profile, apiKeyConfigured: Boolean(args.apiKey) || args.profile.apiKeyConfigured }]; result = null }
  else if (command === 'model_delete') { state.models = (state.models || []).filter(m => m.id !== args.id); result = null }
  else result = []
  saveBrowserState(state); return result
}
