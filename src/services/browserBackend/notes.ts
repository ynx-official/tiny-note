import type { BrowserArgs, BrowserItem, BrowserState } from './types'
import type { BrowserHandlerResult } from './planner'

function item(value: Record<string, unknown>): BrowserItem { return value as BrowserItem }

function normalizeTags(tags: unknown[] = []) {
  const seen = new Set<string>()
  return tags.map(tag => String(tag).trim().replace(/^#/, '').replace(/\s+/g, ' ')).filter(tag => {
    const key = tag.toLocaleLowerCase()
    if (!tag || seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 32)
}

function ensureTag(state: BrowserState, name: string, now: string): BrowserItem | null {
  const normalized = normalizeTags([name])[0]
  if (!normalized) return null
  let tag = state.tags.find(value => value.name.toLocaleLowerCase() === normalized.toLocaleLowerCase())
  if (!tag) { tag = item({ id: crypto.randomUUID(), name: normalized, createdAt: now, updatedAt: now }); state.tags.push(tag) }
  return tag
}

function tagDto(state: BrowserState, tag: BrowserItem) {
  return { ...tag, noteCount: state.noteTags.filter(link => link.tagId === tag.id && state.notes.some(note => note.id === link.noteId && !note.deletedAt && !note.externalPath)).length }
}

function validateNotebookParent(state: BrowserState, id: string, parentId: string | null) {
  if (!parentId) return
  if (id === parentId || !state.notebooks.some(book => book.id === parentId)) throw new Error('目标笔记本无效')
  let cursor: string | null = parentId
  const visited = new Set<string>()
  while (cursor) {
    if (cursor === id || visited.has(cursor)) throw new Error('笔记本不能移动到自身或其子笔记本中')
    visited.add(cursor)
    cursor = state.notebooks.find(book => book.id === cursor)?.parentId || null
  }
}

export function syncNoteLinks(state: BrowserState, sourceNoteId: string) {
  state.noteLinks = state.noteLinks.filter(link => link.sourceNoteId !== sourceNoteId)
  const source = state.notes.find(note => note.id === sourceNoteId)
  if (!source || source.externalPath) return
  for (const match of String(source.contentMarkdown || '').matchAll(/\[\[([^\]]+)\]\]/g)) {
    const title = String(match[1] || '').trim()
    const target = state.notes.find(note => !note.deletedAt && !note.externalPath && note.id !== sourceNoteId && note.title.toLowerCase() === title.toLowerCase())
    if (target && !state.noteLinks.some(link => link.sourceNoteId === sourceNoteId && link.targetNoteId === target.id)) state.noteLinks.push({ sourceNoteId, targetNoteId: target.id, targetTitle: target.title })
  }
}

export function rebuildNoteLinks(state: BrowserState) {
  state.noteLinks = []
  state.notes.filter(note => !note.deletedAt && !note.externalPath).forEach(note => syncNoteLinks(state, note.id))
}

export function migrateLegacyNoteTags(state: BrowserState, now: string, uncategorized: BrowserItem) {
  state.notes.forEach(note => {
    note.notebookId ||= uncategorized.id
    for (const name of normalizeTags(note.tags)) {
      const tag = ensureTag(state, name, now)
      if (tag && !state.noteTags.some(link => link.noteId === note.id && link.tagId === tag.id)) state.noteTags.push({ noteId: note.id, tagId: tag.id })
    }
    delete note.tags
  })
}

export function handleNotesCommand(command: string, args: BrowserArgs, state: BrowserState, now: string, uncategorized: BrowserItem): BrowserHandlerResult | null {
  if (command === 'external_markdown_list') return { result: state.notes.filter(note => note.externalPath).map(note => ({ id: note.id, title: note.title, path: note.externalPath, fileName: String(note.externalPath).split(/[\\/]/).pop() || 'Markdown 文件', updatedAt: note.updatedAt, available: true })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }
  if (command === 'external_markdown_read') { const note = state.notes.find(value => value.id === args.id && value.externalPath); if (!note) throw new Error('外部来源记录不存在'); return { result: { path: note.externalPath, fileName: String(note.externalPath).split(/[\\/]/).pop() || 'Markdown 文件', content: null, error: null, changed: false } } }
  if (command === 'external_markdown_pick_files' || command === 'external_markdown_pick_folder') return { result: { selected: false, files: [] } }
  if (command === 'external_markdown_remove') { const note = state.notes.find(value => value.id === args.id && value.externalPath); if (!note) throw new Error('外部来源记录不存在'); state.notes = state.notes.filter(value => value.id !== note.id); state.noteTags = state.noteTags.filter(link => link.noteId !== note.id); rebuildNoteLinks(state); return { result: null } }
  if (command === 'external_markdown_clear') { const ids = new Set(state.notes.filter(note => note.externalPath).map(note => note.id)); state.notes = state.notes.filter(note => !ids.has(note.id)); state.noteTags = state.noteTags.filter(link => !ids.has(link.noteId)); rebuildNoteLinks(state); return { result: ids.size } }
  if (command === 'note_list') return { result: state.notes.filter(note => !note.externalPath && Boolean(note.deletedAt) === Boolean(args.deleted) && (args.knowledgeBaseId == null || note.knowledgeBaseId === args.knowledgeBaseId) && (args.pinned == null || Boolean(note.pinned) === Boolean(args.pinned)) && (!args.search || `${note.title} ${note.contentText}`.toLowerCase().includes(args.search.toLowerCase()))).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt)) }
  if (command === 'note_get') return { result: state.notes.find(note => note.id === args.id) || null }
  if (command === 'note_set_pinned') { const note = state.notes.find(value => value.id === args.id); if (note) Object.assign(note, { pinned: Boolean(args.pinned), updatedAt: now }); return { result: note || null } }
  if (command === 'note_link_list') { const links = state.noteLinks.filter(link => link.sourceNoteId === args.noteId || link.targetNoteId === args.noteId); return { result: links.map(link => ({ ...link, targetTitle: link.sourceNoteId === args.noteId ? link.targetTitle : state.notes.find(note => note.id === link.sourceNoteId)?.title || link.targetTitle })) } }
  if (command === 'note_template_list') return { result: state.templates }
  if (command === 'note_template_upsert') { const template = item({ ...args.template, id: args.template.id || crypto.randomUUID(), builtin: false, updatedAt: now }); state.templates = [...state.templates.filter(value => value.id !== template.id), template] as typeof state.templates; return { result: template } }
  if (command === 'note_template_delete') { state.templates = state.templates.filter(template => template.builtin || template.id !== args.id); return { result: null } }
  if (command === 'note_create') { const note = item({ id: crypto.randomUUID(), notebookId: args.input.notebookId || uncategorized.id, knowledgeBaseId: args.input.knowledgeBaseId || null, title: args.input.title || '未命名笔记', contentHtml: args.input.contentHtml || '', contentText: args.input.contentText || '', contentMarkdown: args.input.contentMarkdown || '', pinned: Boolean(args.input.pinned), deletedAt: null, createdAt: now, updatedAt: now }); state.notes.unshift(note); rebuildNoteLinks(state); return { result: note } }
  if (command === 'note_open_external_markdown') { const existing = state.notes.find(note => note.externalPath === args.input.path); const note = existing || item({ id: crypto.randomUUID(), notebookId: uncategorized.id, knowledgeBaseId: null, pinned: false, deletedAt: null, createdAt: now }); Object.assign(note, args.input, { notebookId: args.input.notebookId || uncategorized.id, externalPath: args.input.path, updatedAt: now }); if (!existing) state.notes.unshift(note); rebuildNoteLinks(state); return { result: note } }
  if (command === 'note_update') { const note = state.notes.find(value => value.id === args.id); if (note) Object.assign(note, args.input, { notebookId: args.input.notebookId || uncategorized.id, pinned: Boolean(args.input.pinned), updatedAt: now }); if (note) rebuildNoteLinks(state); return { result: note || null } }
  if (command === 'note_delete') { const note = state.notes.find(value => value.id === args.id); if (note) { note.deletedAt = now; rebuildNoteLinks(state) } return { result: null } }
  if (command === 'note_copy') { const source = state.notes.find(note => note.id === args.id); if (!source) return { result: null }; const copy = item({ ...source, id: crypto.randomUUID(), title: `${source.title} 副本`, createdAt: now, updatedAt: now }); state.notes.unshift(copy); state.noteTags.push(...state.noteTags.filter(link => link.noteId === source.id).map(link => ({ noteId: copy.id, tagId: link.tagId }))); rebuildNoteLinks(state); return { result: copy } }
  if (command === 'note_move') { const note = state.notes.find(value => value.id === args.id); if (note) Object.assign(note, { notebookId: args.notebookId || uncategorized.id, updatedAt: now }); return { result: null } }
  if (command === 'note_move_to_knowledge_base') { const note = state.notes.find(value => value.id === args.id); if (!note) throw new Error('笔记不存在'); Object.assign(note, { knowledgeBaseId: args.knowledgeBaseId || null, updatedAt: now }); return { result: note } }
  if (command === 'note_restore') { const note = state.notes.find(value => value.id === args.id); if (note) { note.deletedAt = null; rebuildNoteLinks(state) } return { result: null } }
  if (command === 'note_purge') { state.notes = state.notes.filter(note => note.id !== args.id); state.noteTags = state.noteTags.filter(link => link.noteId !== args.id); rebuildNoteLinks(state); return { result: null } }
  if (command === 'note_purge_expired') return { result: 0 }
  if (command === 'notebook_list') return { result: state.notebooks }
  if (command === 'notebook_create') { const id = crypto.randomUUID(); validateNotebookParent(state, id, args.parentId || null); const notebook = item({ id, parentId: args.parentId || null, name: args.name.trim(), description: args.description || '', createdAt: now, updatedAt: now }); if (!notebook.name || notebook.name === '未分类') throw new Error('笔记本名称无效'); state.notebooks.push(notebook); return { result: notebook } }
  if (command === 'notebook_update') { const notebook = state.notebooks.find(value => value.id === args.id); const name = args.name.trim(); if (!notebook || notebook.name === '未分类') throw new Error('系统笔记本不能修改'); if (!name || name === '未分类') throw new Error('笔记本名称无效'); validateNotebookParent(state, notebook.id, args.parentId || null); Object.assign(notebook, { parentId: args.parentId || null, name, description: args.description || '', updatedAt: now }); return { result: notebook } }
  if (command === 'notebook_move') { const notebook = state.notebooks.find(value => value.id === args.id); if (!notebook || notebook.name === '未分类') throw new Error('系统笔记本不能移动'); validateNotebookParent(state, notebook.id, args.parentId || null); Object.assign(notebook, { parentId: args.parentId || null, updatedAt: now }); return { result: notebook } }
  if (command === 'notebook_delete') { const target = state.notebooks.find(value => value.id === args.id); if (!target || target.name === '未分类') throw new Error('系统笔记本不能删除'); state.notebooks.forEach(book => { if (book.parentId === target.id) book.parentId = target.parentId || null }); state.notes.forEach(note => { if (note.notebookId === target.id) note.notebookId = uncategorized.id }); state.notebooks = state.notebooks.filter(book => book.id !== args.id); return { result: null } }
  if (command === 'tag_list') return { result: state.tags.map(tag => tagDto(state, tag)).sort((a, b) => a.name.localeCompare(b.name)) }
  if (command === 'tag_create') { const name = normalizeTags([args.name])[0]; if (!name) throw new Error('标签名称不能为空'); if (state.tags.some(tag => tag.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('标签已存在'); const tag = item({ id: crypto.randomUUID(), name, createdAt: now, updatedAt: now }); state.tags.push(tag); return { result: tagDto(state, tag) } }
  if (command === 'tag_update') { const tag = state.tags.find(value => value.id === args.id); const name = normalizeTags([args.name])[0]; if (!tag || !name) throw new Error('标签不存在或名称无效'); if (state.tags.some(value => value.id !== tag.id && value.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('标签已存在'); Object.assign(tag, { name, updatedAt: now }); return { result: tagDto(state, tag) } }
  if (command === 'tag_delete') { if (!state.tags.some(tag => tag.id === args.id)) throw new Error('标签不存在'); state.tags = state.tags.filter(tag => tag.id !== args.id); state.noteTags = state.noteTags.filter(link => link.tagId !== args.id); return { result: null } }
  if (command === 'note_tag_list') return { result: state.noteTags.filter(link => link.noteId === args.noteId).map(link => state.tags.find(tag => tag.id === link.tagId)).filter((tag): tag is BrowserItem => Boolean(tag)).map(tag => tagDto(state, tag)).sort((a, b) => a.name.localeCompare(b.name)) }
  if (command === 'tag_note_list') { const ids = new Set(args.untagged ? state.notes.filter(note => !note.externalPath && !state.noteTags.some(link => link.noteId === note.id)).map(note => note.id) : state.noteTags.filter(link => link.tagId === args.tagId).map(link => link.noteId)); return { result: state.notes.filter(note => !note.deletedAt && !note.externalPath && ids.has(note.id)).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt)) } }
  if (command === 'tag_note_add') { if (!args.tagId || !state.tags.some(tag => tag.id === args.tagId)) throw new Error('标签不存在'); for (const noteId of new Set(args.noteIds)) { if (!state.notes.some(note => note.id === noteId && !note.deletedAt)) throw new Error('笔记不存在'); if (!state.noteTags.some(link => link.noteId === noteId && link.tagId === args.tagId)) state.noteTags.push({ noteId, tagId: args.tagId }) } return { result: null } }
  if (command === 'tag_note_remove') { const ids = new Set(args.noteIds); state.noteTags = state.noteTags.filter(link => link.tagId !== args.tagId || !ids.has(link.noteId)); return { result: null } }
  return null
}
