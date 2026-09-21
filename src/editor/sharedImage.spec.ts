import { Editor } from '@tiptap/core'
import { describe, expect, it, vi } from 'vitest'
import { createNoteExtensions } from './noteExtensions'
const mocks = vi.hoisted(() => ({ request: vi.fn(async () => ({ url: 'https://private.example/image?signature=temporary' })) }))
vi.mock('../services/apiClient', () => ({ apiRequest: mocks.request, subscribeAuth: () => () => {} }))
describe('shared attachment rendering', () => {
  it('resolves an authenticated image without saving its temporary URL in the note', async () => {
    const stable = '/api/files/20a72340-1234-4234-8234-123456789abc'
    const editor = new Editor({ extensions: createNoteExtensions(), content: `<p><img src="${stable}" alt="shared"></p>` })
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledWith('/objects/20a72340-1234-4234-8234-123456789abc/download-url'))
    expect(editor.view.dom.querySelector('img')?.src).toContain('signature=temporary')
    expect(editor.getHTML()).toContain(stable)
    expect(editor.getHTML()).not.toContain('signature=temporary')
    editor.destroy()
  })
})
