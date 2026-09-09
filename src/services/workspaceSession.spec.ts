import { describe, expect, it } from 'vitest'
import { createPinia } from 'pinia'
import { useAppStore } from '../stores/app'
import { useNotesStore } from '../stores/notes'
import { resetWorkspaceSession } from './workspaceSession'

describe('workspace session cleanup', () => {
  it('removes user-scoped data after authentication is lost', async () => {
    const pinia = createPinia()
    const app = useAppStore(pinia)
    const notes = useNotesStore(pinia)
    app.models = [{ id: 'private-model', name: 'Private model' } as never]
    notes.notes = [{ id: 'private-note', title: 'Private note' } as never]

    await resetWorkspaceSession(pinia)

    expect(app.models).toEqual([])
    expect(notes.notes).toEqual([])
  })
})
