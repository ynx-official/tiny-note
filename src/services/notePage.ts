import { invoke } from './tauri'
import { errorMessage, type NoteSummary, type NotePageFilter } from '../types/domain'

export interface NotePageState {
  items: NoteSummary[]
  total: number
  hasMore: boolean
  nextCursor: string
  notebookCounts: Record<string, number>
  loading: boolean
  error: string
  filter: NotePageFilter
}
const sequences = new WeakMap<NotePageState, number>()
export function createNotePageState(): NotePageState {
  return { items: [], total: 0, hasMore: false, nextCursor: '', notebookCounts: {}, loading: false, error: '', filter: {} }
}
export async function loadNotePage(state: NotePageState, filter: NotePageFilter = state.filter, append = false): Promise<boolean> {
  if (append && (state.loading || !state.hasMore)) return false
  const sequence = (sequences.get(state) || 0) + 1
  sequences.set(state, sequence)
  const request = { ...filter, limit: filter.limit || 80, cursor: append ? state.nextCursor : undefined }
  if (!append) {
    state.filter = { ...filter, cursor: undefined }
    state.items = []
    state.total = 0
    state.hasMore = false
    state.nextCursor = ''
    state.notebookCounts = {}
  }
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
    return true
  } catch (cause) {
    if (sequences.get(state) === sequence) state.error = errorMessage(cause, '笔记列表读取失败')
    return false
  } finally {
    if (sequences.get(state) === sequence) state.loading = false
  }
}
