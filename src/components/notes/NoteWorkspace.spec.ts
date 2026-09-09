import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import NoteWorkspace from './NoteWorkspace.vue'
import type { NotesWorkspace } from '../../composables/useNotesWorkspace'

it('connects the editor save handle to the workspace before clearing external history', async () => {
  const saveLatestContent = vi.fn(async () => true)
  const noteEditorRef = ref<{ saveLatestContent(): Promise<boolean> } | null>(null)
  const workspace = {
    t: (key: string) => key, sidebarCollapsed: ref(false), showDeleted: ref(false),
    store: { active: { id: 'external:file', external: true } }, noteEditorRef,
    tocVisible: ref(false), route: { query: {} }
  } as unknown as NotesWorkspace
  const wrapper = mount(NoteWorkspace, {
    props: { workspace },
    global: { stubs: { NoteEditor: defineComponent({
      setup(_props, { expose }) { expose({ saveLatestContent }); return () => null }
    }) } }
  })
  expect(await noteEditorRef.value?.saveLatestContent()).toBe(true)
  expect(saveLatestContent).toHaveBeenCalledOnce()
  wrapper.unmount()
  expect(noteEditorRef.value).toBeNull()
})
