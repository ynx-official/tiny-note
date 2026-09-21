import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { expect, it, vi } from 'vitest'
import { messages } from '../../i18n'
import { useNotesWorkspace } from '../../composables/useNotesWorkspace'
import NotesSidebar from './NotesSidebar.vue'
import NoteWorkspace from './NoteWorkspace.vue'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('../../services/tauri', () => ({ invoke: mocks.invoke }))

it('lists notes across collapsed notebooks and uncategorized notes, paginates with retry, and opens a selected article', async () => {
  const notes = ['工作记录', '生活随笔', '未分类文章', '下一页文章'].map((title, index) => ({
    id: `note-${index}`, title, notebookId: index < 2 ? `book-${index}` : null,
    knowledgeBaseId: null, pinned: false, version: 1, deletedAt: null,
    createdAt: '', updatedAt: '2026-09-21T00:00:00Z', excerpt: `${title}摘要`
  }))
  let failNextPage = true
  mocks.invoke.mockImplementation(async (command, args) => {
    if (command === 'notebook_list') return ['工作', '生活'].map((name, index) => ({ id: `book-${index}`, name, parentId: null }))
    if (command === 'note_page') {
      if (args.cursor && failNextPage) { failNextPage = false; throw new Error('分页读取失败') }
      return { items: args.cursor ? notes.slice(3) : notes.slice(0, 3), total: 4, hasMore: !args.cursor, nextCursor: args.cursor ? '' : 'next', notebookCounts: {} }
    }
    if (command === 'note_get') return { ...notes.find(note => note.id === args.id), contentHtml: '<p>正文</p>', contentText: '正文', contentMarkdown: '正文' }
    return []
  })
  const Harness = defineComponent({
    components: { NotesSidebar, NoteWorkspace },
    setup() { return { workspace: useNotesWorkspace() } },
    template: '<NotesSidebar :workspace="workspace" /><NoteWorkspace :workspace="workspace" />'
  })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/notes', component: Harness }] })
  await router.push('/notes?note=note-0')
  const wrapper = mount(Harness, { global: {
    plugins: [createPinia(), router, createI18n({ legacy: false, locale: 'zh-CN', messages })],
    stubs: { NoteEditor: {
      props: { note: Object },
      setup(_props, { expose }) { expose({ saveLatestContent: async () => true }) },
      template: '<article class="test-editor">{{ note?.title }}</article>'
    } }
  } })
  try {
    await flushPromises()
    await wrapper.get('.tree-all-row').trigger('click')
    await flushPromises()
    const list = wrapper.get('[aria-label="全部笔记列表"]')
    expect(wrapper.find('.test-editor').exists()).toBe(false)
    expect(list.findAll('.all-notes-row')).toHaveLength(3)
    expect(list.text()).toContain('工作记录')
    expect(list.text()).toContain('生活随笔')
    expect(list.text()).toContain('未分类文章')
    expect(router.currentRoute.value.query.note).toBeUndefined()
    await list.get('.note-page-controls button').trigger('click')
    await flushPromises()
    expect(list.get('[role="alert"]').text()).toContain('分页读取失败')
    expect(list.findAll('.all-notes-row')).toHaveLength(3)
    await list.get('.note-page-controls button').trigger('click')
    await flushPromises()
    expect(list.findAll('.all-notes-row')).toHaveLength(4)
    expect(list.find('.note-page-controls').exists()).toBe(false)
    await list.findAll('.all-notes-row')[3]!.trigger('click')
    await flushPromises()
    expect(wrapper.get('.test-editor').text()).toContain('下一页文章')
    expect(mocks.invoke).toHaveBeenCalledWith('note_get', { id: 'note-3' })
  } finally { wrapper.unmount() }
})
