import { flushPromises } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { mountEditor, switchMode, note } from './NoteEditor.testHarness'

const resolveImage = vi.hoisted(() => vi.fn())
vi.mock('../services/noteImage', () => ({ resolveNoteImage: resolveImage }))

function pasteImage(element: Element) {
  const file = new File(['image'], 'clipboard.png', { type: 'image/png' })
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: { files: [file] } })
  element.dispatchEvent(event)
  return { file, event }
}

it.each(['rich', 'markdown'] as const)('pastes images through OSS/fallback resolution in %s mode', async mode => {
  resolveImage.mockResolvedValue('https://oss.example/clipboard.png')
  const w = await mountEditor()
  try {
    await switchMode(w, mode)
    const { file, event } = pasteImage(w.get(mode === 'rich' ? '.vditor-ir' : '.vditor-sv').element)
    expect(event.defaultPrevented).toBe(true)
    await flushPromises()
    expect(resolveImage).toHaveBeenCalledWith(file)
    expect(w.vm.editor.getMarkdown()).toContain('![](https://oss.example/clipboard.png)')
  } finally { w.unmount() }
})

it('does not insert a pending clipboard image into a different note', async () => {
  let finish!: (url: string) => void
  resolveImage.mockReturnValue(new Promise<string>(resolve => { finish = resolve }))
  const w = await mountEditor()
  try {
    pasteImage(w.get('.vditor-ir').element)
    const next = note('next'); w.notesStore.notes.push(next)
    await w.setProps({ note: next }); await flushPromises()
    finish('https://oss.example/clipboard.png'); await flushPromises()
    expect(w.vm.editor.getMarkdown()).not.toContain('clipboard.png')
  } finally { w.unmount() }
})

it('inserts the Base64 fallback returned for a clipboard image', async () => {
  resolveImage.mockResolvedValue('data:image/png;base64,aW1hZ2U=')
  const w = await mountEditor()
  try {
    pasteImage(w.get('.vditor-ir').element)
    await flushPromises()
    expect(w.vm.editor.getMarkdown()).toContain('![](data:image/png;base64,aW1hZ2U=)')
  } finally { w.unmount() }
})
