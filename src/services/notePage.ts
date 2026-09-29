import { invoke } from './tauri'
import { errorMessage, type NoteSummary, type NotePageFilter } from '../types/domain'

export interface NotePageState {
  items: NoteSummary[]
  total: number
  hasMore: boolean
  nextCursor: string
  notebookCounts: Record<string, number>
  loading: boolean
  loaded: boolean
  retryAppend: boolean
  error: string
  filter: NotePageFilter
}
const sequences = new WeakMap<NotePageState, number>()
export function createNotePageState(): NotePageState {
  return { items: [], total: 0, hasMore: false, nextCursor: '', notebookCounts: {}, loading: false, loaded: false, retryAppend: false, error: '', filter: {} }
}
function filterKey(filter: NotePageFilter): string {
  return JSON.stringify(Object.entries({ ...filter, limit: filter.limit || 80 })
    .filter(([key, value]) => key !== 'cursor' && value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right)))
}
/** Stage the already loaded window offscreen; publish it once without loading UI. */
export async function revalidateNotePage(state: NotePageState): Promise<boolean> {
  if (state.loading) return false
  const sequence = (sequences.get(state) || 0) + 1
  sequences.set(state, sequence)
  const filter = { ...state.filter }
  const targetCount = Math.max(state.items.length, 1)
  const staged = createNotePageState()
  const cursors = new Set<string>()
  do {
    if (sequences.get(state) !== sequence) return false
    const cursor = staged.nextCursor || undefined
    if (cursor && cursors.has(cursor)) throw new Error('笔记目录分页游标未前进，请稍后重试')
    if (cursor) cursors.add(cursor)
    const page = await invoke('note_page', { ...filter, limit: filter.limit || 80, cursor })
    if (sequences.get(state) !== sequence) return false
    staged.items.push(...page.items)
    staged.total = page.total
    staged.hasMore = page.hasMore
    staged.nextCursor = page.nextCursor
    if (page.notebookCounts) staged.notebookCounts = page.notebookCounts
  } while (staged.items.length < targetCount && staged.hasMore && staged.nextCursor)
  const existing = new Map(state.items.map(item => [item.id, item]))
  state.items = [...new Map(staged.items.map(item => {
    const current = existing.get(item.id)
    return [item.id, current && ((current.version || 0) > (item.version || 0) || JSON.stringify(current) === JSON.stringify(item)) ? current : item]
  })).values()]
  Object.assign(state, { total: staged.total, hasMore: staged.hasMore, nextCursor: staged.nextCursor, notebookCounts: staged.notebookCounts, loaded: true, error: '', retryAppend: false })
  return true
}

export async function loadNotePage(state: NotePageState, filter: NotePageFilter = state.filter, append = false): Promise<boolean> {
  if (append && (state.loading || !state.hasMore)) return false
  const sequence = (sequences.get(state) || 0) + 1
  sequences.set(state, sequence)
  const request = { ...filter, limit: filter.limit || 80, cursor: append ? state.nextCursor : undefined }
  if (!append) {
    const sameFilter = filterKey(state.filter) === filterKey(filter)
    state.filter = { ...filter, cursor: undefined }
    // Keep the last successful view during revalidation, but never mislabel
    // results from another notebook, account-owned page or search filter.
    if (!sameFilter) {
      state.items = []
      state.total = 0
      state.hasMore = false
      state.nextCursor = ''
      state.notebookCounts = {}
      state.loaded = false
    }
  }
  state.retryAppend = append
  state.loading = true
  state.error = ''
  try {
    const page = await invoke('note_page', request)
    if (sequences.get(state) !== sequence) return false
    const combined = append ? [...state.items, ...page.items] : page.items
    state.items = [...new Map(combined.map(note => [note.id, note])).values()]
    state.total = page.total
    state.hasMore = page.hasMore
    state.nextCursor = page.nextCursor
    if (page.notebookCounts) state.notebookCounts = page.notebookCounts
    state.loaded = true
    return true
  } catch (cause) {
    if (sequences.get(state) === sequence) state.error = errorMessage(cause, '笔记列表读取失败')
    return false
  } finally {
    if (sequences.get(state) === sequence) state.loading = false
  }
}
