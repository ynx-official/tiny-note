import { defineComponent, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import NoteWorkspace from './NoteWorkspace.vue'
import type { NotesWorkspace } from '../../composables/useNotesWorkspace'

it('keeps the editor mounted and only announces a slow body request after 200ms', async () => {
  vi.useFakeTimers()
  const bodyLoading = ref(false)
  const workspace = {
    bodyLoading, bodyError: ref(''), initializing: ref(false),
    t: (key: string) => key, sidebarCollapsed: ref(false), showDeleted: ref(false),
    store: { active: { id: 'current' } }, noteEditorRef: ref(null),
    tocVisible: ref(false), route: { query: {} }
  } as unknown as NotesWorkspace
  const wrapper = mount(NoteWorkspace, {
    props: { workspace },
    global: { stubs: { NoteEditor: { template: '<article>当前文章</article>' } } }
  })
  try {
    const editor = wrapper.get('article').element
    bodyLoading.value = true
    await nextTick()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(199)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.get('[role="status"]').text()).toContain('正在读取')
    expect(wrapper.get('article').element).toBe(editor)
    bodyLoading.value = false
    await nextTick()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    bodyLoading.value = true
    await nextTick()
    await vi.advanceTimersByTimeAsync(50)
    bodyLoading.value = false
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  } finally { wrapper.unmount(); vi.useRealTimers() }
})

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
