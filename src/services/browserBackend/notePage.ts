import type { BrowserArgs, BrowserState } from './types'
import type { NoteSummary, NotePage } from '../../types/domain'

export function browserNotePage(state: BrowserState, args: BrowserArgs): NotePage {
  const limit = Number(args.limit || 80)
  if (!Number.isInteger(limit) || limit < 1 || limit > 200 || (args.tagId && (args.untagged || args.excludeTagId)) || (args.untagged && args.excludeTagId)) throw new Error('笔记列表筛选参数无效')
  const search = String(args.search || '').trim().toLocaleLowerCase()
  const key = JSON.stringify([search, Boolean(args.deleted), args.pinned ?? null, args.notebookId || '', args.knowledgeBaseId || '', args.tagId || '', args.excludeTagId || '', Boolean(args.untagged)])
  const rows: NoteSummary[] = state.notes.filter(note => {
    if (note.externalPath || note.external || note.id.startsWith('external:') || Boolean(note.deletedAt) !== Boolean(args.deleted)) return false
    if (args.pinned != null && Boolean(note.pinned) !== args.pinned) return false
    if (args.notebookId && note.notebookId !== args.notebookId) return false
    if (args.knowledgeBaseId && note.knowledgeBaseId !== args.knowledgeBaseId) return false
    const tags = state.noteTags.filter(link => link.noteId === note.id)
    if (args.excludeTagId && tags.some(link => link.tagId === args.excludeTagId)) return false
    if ((args.untagged && tags.length) || (args.tagId && !tags.some(link => link.tagId === args.tagId))) return false
    return !search || `${note.title} ${note.contentText}`.toLocaleLowerCase().includes(search)
  }).map(note => ({
    id: note.id, notebookId: note.notebookId || null, knowledgeBaseId: note.knowledgeBaseId || null,
    title: note.title, excerpt: Array.from(String(note.contentText || '')).slice(0, 200).join(''), pinned: Boolean(note.pinned),
    version: note.version, deletedAt: note.deletedAt || null, createdAt: note.createdAt, updatedAt: note.updatedAt
  })).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
  const notebookCounts: Record<string, number> = {}
  for (const row of rows) notebookCounts[row.notebookId || ''] = (notebookCounts[row.notebookId || ''] || 0) + 1
  let start = 0
  if (args.cursor) {
    let cursor: { key: string; id: string }
    try { cursor = JSON.parse(atob(String(args.cursor))) } catch { throw new Error('分页游标无效') }
    if (cursor.key !== key) throw new Error('分页游标与筛选条件不一致')
    const index = rows.findIndex(row => row.id === cursor.id)
    if (index < 0) throw new Error('列表已变化，请重新加载')
    start = index + 1
  }
  const items = rows.slice(start, start + limit)
  const hasMore = start + items.length < rows.length
  return { items, total: rows.length, hasMore, notebookCounts, nextCursor: hasMore ? btoa(JSON.stringify({ key, id: items.at(-1)!.id }).replace(/[\u007f-\uffff]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)) : '' }
}
