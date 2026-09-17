import type { Pinia } from 'pinia'
import { useChatSessionStore } from '../stores/chatSession'

interface ResettableStore { $reset: () => void }

/** Clears user-scoped Pinia state after logout or token invalidation. */
export async function resetWorkspaceSession(pinia: Pinia): Promise<void> {
  // Invalidate in-flight chat work before yielding to lazy store imports.
  useChatSessionStore(pinia).$reset()
  const [app, notes, library, tags, calendar, todos, tasks, images] = await Promise.all([
    import('../stores/app'), import('../stores/notes'), import('../stores/library'), import('../stores/tags'),
    import('../stores/calendar'), import('../stores/todos'), import('../stores/tasks'), import('../stores/images')
  ])
  const stores: ResettableStore[] = [
    app.useAppStore(pinia), notes.useNotesStore(pinia), library.useLibraryStore(pinia), tags.useTagsStore(pinia),
    calendar.useCalendarStore(pinia), todos.useTodosStore(pinia), tasks.useTasksStore(pinia), images.useImagesStore(pinia)
  ]
  for (const store of stores) store.$reset()
}
