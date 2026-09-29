import { watch } from 'vue'
import type { useNotesStore } from '../stores/notes'
import { useNoteSyncStore } from '../stores/noteSync'
import { noteHasUnsavedChanges, readNoteBody } from './noteCache'
import { revalidateNotePage } from './notePage'
import { invoke } from './tauri'
import { errorMessage } from '../types/domain'

export const NOTE_REMOTE_REFRESH_MS = 30_000
type NotesStore = ReturnType<typeof useNotesStore>
const requests = new WeakMap<object, Promise<void>>()

/** Manual and automatic checks share one flight, but never force-save a draft. */
export async function refreshRemoteNotes(store: NotesStore, catalog = true) {
  const scope = store.cacheScope
  const pending = requests.get(scope)
  if (pending) return pending
  const sync = useNoteSyncStore()
  if (!catalog && (!store.active || store.active.external || store.saving || noteHasUnsavedChanges(store.active))) return
  sync.checking = true
  const request = Promise.resolve().then(async () => {
    if (store.cacheScope !== scope) return
    try {
      const active = store.active
      const refreshBody = async () => {
        sync.draftProtected = Boolean(active && !active.external && (store.saving || noteHasUnsavedChanges(active)))
        if (!active || active.external || sync.draftProtected) return
        const updated = await readNoteBody(store, active.id)
        if (store.cacheScope !== scope || store.activeId !== active.id) return
        sync.draftProtected = noteHasUnsavedChanges(updated)
        if (!sync.draftProtected) store.showDeleted = Boolean(updated.deletedAt)
      }
      const results = await Promise.allSettled([
        refreshBody(),
        ...(catalog ? [revalidateNotePage(store.catalog), ...Object.values(store.notebookPages).map(page => revalidateNotePage(page))] : []),
        ...(catalog && store.showDeleted ? [revalidateNotePage(store.trashPage)] : []),
        ...(catalog ? [invoke('notebook_list').then(notebooks => {
          if (store.cacheScope === scope && JSON.stringify(store.notebooks) !== JSON.stringify(notebooks)) store.notebooks = notebooks
        })] : [])
      ])
      if (store.cacheScope !== scope) return
      const failure = results.find(result => result.status === 'rejected')
      if (failure?.status === 'rejected') throw failure.reason
      sync.lastCheckedAt = Date.now()
      sync.error = ''
    } catch (error) {
      if (store.cacheScope === scope) sync.error = errorMessage(error, '同步失败，稍后会自动重试')
    } finally {
      if (store.cacheScope === scope) sync.checking = false
    }
  })
  requests.set(scope, request)
  try { await request } finally { if (requests.get(scope) === request) requests.delete(scope) }
}

export function startNoteRemoteRefresh(store: NotesStore, refreshOnStart = true) {
  const scope = store.cacheScope
  const sync = useNoteSyncStore()
  let stopped = false
  let timer: ReturnType<typeof setInterval> | undefined
  const refresh = (catalog = true) => {
    if (stopped || store.cacheScope !== scope || !sync.preferences.enabled || document.visibilityState === 'hidden' || navigator.onLine === false) return
    void refreshRemoteNotes(store, catalog)
  }
  const stopWatch = watch(() => [sync.preferences.enabled, sync.intervalMs], () => {
    clearInterval(timer)
    if (sync.preferences.enabled) timer = setInterval(refresh, sync.intervalMs)
  }, { immediate: true, flush: 'sync' })
  const onResume = () => refresh()
  window.addEventListener('focus', onResume)
  window.addEventListener('online', onResume)
  document.addEventListener('visibilitychange', onResume)
  if (refreshOnStart) refresh(false)
  return () => {
    stopped = true
    stopWatch()
    clearInterval(timer)
    window.removeEventListener('focus', onResume)
    window.removeEventListener('online', onResume)
    document.removeEventListener('visibilitychange', onResume)
  }
}
