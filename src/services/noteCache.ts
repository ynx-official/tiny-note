import { toRaw } from 'vue'
import { invoke } from './tauri'
import type { Note, NoteSummary } from '../types/domain'

export interface NoteCacheState { notes: Note[]; deleted: Note[]; activeId: string | null; cacheScope: object }
const persisted = new WeakMap<Note, string>()
const touched = new WeakMap<Note, number>()
const requests = new WeakMap<object, Map<string, Promise<Note>>>()
let touchSequence = 0

function signature(note: Note): string {
  return JSON.stringify([note.title, note.notebookId, note.knowledgeBaseId, note.contentHtml, note.contentText, note.contentMarkdown, Boolean(note.pinned)])
}
export function trackPersistedNote(note: Note, saved: Note = note) { persisted.set(toRaw(note), signature(saved)) }
// Source editor drafts can precede parsing into the Note body. Protect them too.
export function protectNoteDraft(note: Note) { persisted.delete(toRaw(note)) }
export function noteHasUnsavedChanges(note: Note) { return persisted.get(toRaw(note)) !== signature(note) }
export function noteSummary(note: Note): NoteSummary {
  return { id: note.id, title: note.title, notebookId: note.notebookId, knowledgeBaseId: note.knowledgeBaseId, excerpt: Array.from(note.contentText || '').slice(0, 200).join(''), pinned: Boolean(note.pinned), version: note.version, deletedAt: note.deletedAt, createdAt: note.createdAt, updatedAt: note.updatedAt }
}
export function assertNoteBody(note: Note): void {
  if (typeof note.contentHtml !== 'string' || typeof note.contentText !== 'string' || typeof note.contentMarkdown !== 'string') throw new Error('笔记正文尚未加载，不能保存目录摘要')
}
export function cachedNote(state: NoteCacheState, id: string): Note | undefined { return [...state.notes, ...state.deleted].find(note => note.id === id) }
export function trimNoteCache(state: NoteCacheState, protectedId = '', maxNotes = 20, maxBytes = 64 * 1024 * 1024) {
  const notes = [...new Map([...state.notes, ...state.deleted].map(note => [note.id, note])).values()]
  const bytes = (note: Note) => 2 * ((note.contentHtml?.length || 0) + (note.contentText?.length || 0) + (note.contentMarkdown?.length || 0))
  let total = notes.reduce((sum, note) => sum + bytes(note), 0)
  let count = notes.length
  const removed = new Set<string>()
  for (const note of notes.sort((a, b) => (touched.get(toRaw(a)) || 0) - (touched.get(toRaw(b)) || 0))) {
    if (count <= maxNotes && total <= maxBytes) break
    if (note.id === state.activeId || note.id === protectedId || noteHasUnsavedChanges(note)) continue
    removed.add(note.id); total -= bytes(note); count--
  }
  if (removed.size) { state.notes = state.notes.filter(note => !removed.has(note.id)); state.deleted = state.deleted.filter(note => !removed.has(note.id)) }
}
export function cacheNoteBody(state: NoteCacheState, note: Note): Note {
  assertNoteBody(note)
  const existing = cachedNote(state, note.id)
  if (existing && noteHasUnsavedChanges(existing)) return existing
  const index = state.notes.findIndex(item => item.id === note.id)
  if (index >= 0) state.notes[index] = note
  else state.notes.push(note)
  state.deleted = state.deleted.filter(item => item.id !== note.id)
  trackPersistedNote(note)
  touched.set(toRaw(note), ++touchSequence)
  trimNoteCache(state, note.id)
  return note
}
export async function readNoteBody(state: NoteCacheState, id: string, expectedVersion?: number): Promise<Note> {
  const existing = cachedNote(state, id)
  if (existing && (existing.external || noteHasUnsavedChanges(existing) || (expectedVersion !== undefined && existing.version === expectedVersion))) {
    touched.set(toRaw(existing), ++touchSequence)
    return existing
  }
  if (id.startsWith('external:')) throw new Error('请从外部来源历史重新打开该文件')
  const scope = state.cacheScope
  let inflight = requests.get(scope)
  if (!inflight) { inflight = new Map(); requests.set(scope, inflight) }
  const pending = inflight.get(id)
  if (pending) return pending
  const request = (async () => {
    const note = await invoke('note_get', { id })
    if (state.cacheScope !== scope) throw new Error('登录状态已变化，请重新打开笔记')
    if (!note) throw new Error('笔记不存在或已被删除')
    return cacheNoteBody(state, note)
  })()
  inflight.set(id, request)
  try { return await request } finally { if (inflight.get(id) === request) inflight.delete(id) }
}
