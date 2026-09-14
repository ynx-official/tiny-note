import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { messages } from '../../i18n'
import { useNotesWorkspace } from '../../composables/useNotesWorkspace'
import NotesSidebar from './NotesSidebar.vue'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('../../services/tauri', () => ({ invoke: mocks.invoke }))

const externalSource = {
  id: 'external-note',
  title: '外部文章',
  path: 'D:\\Notes\\外部文章.md',
  fileName: '外部文章.md',
  updatedAt: '2026-08-28T00:00:00Z',
  available: true
}

const SidebarHarness = defineComponent({
  components: { NotesSidebar },
  setup() {
    return { workspace: useNotesWorkspace() }
  },
  template: '<NotesSidebar :workspace="workspace" />'
})

describe('NotesSidebar external sources', () => {
  beforeEach(() => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
    mocks.invoke.mockReset()
    mocks.invoke.mockImplementation((command: string, payload?: { deleted?: boolean }) => {
      if (command === 'note_page') return Promise.resolve({ items: [], total: 0, hasMore: false, nextCursor: '' })
      if (command === 'note_list') return Promise.resolve(payload?.deleted ? [] : [])
      if (command === 'external_markdown_list') return Promise.resolve([externalSource])
      if (command === 'external_markdown_pick_files' || command === 'external_markdown_pick_folder') return Promise.resolve({ selected: false, files: [] })
      return Promise.resolve([])
    })
  })

  it('shows open actions on blank space and only remove on an existing source', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/notes', component: SidebarHarness }]
    })
    await router.push('/notes')
    await router.isReady()
    const wrapper = mount(SidebarHarness, {
      global: {
        plugins: [
          createPinia(),
          router,
          createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en', messages })
        ]
      }
    })
    await flushPromises()

    await wrapper.get('button[aria-expanded="false"]').trigger('click')
    await wrapper.get('.external-source-tree').trigger('contextmenu')

    const areaMenu = wrapper.get('[aria-label="外部来源区域操作"]')
    expect(areaMenu.text()).toContain('打开文件')
    expect(areaMenu.text()).toContain('打开文件夹')

    await wrapper.get('.tree-external-source').trigger('contextmenu')

    const sourceMenu = wrapper.get('[aria-label="外部文件操作"]')
    expect(sourceMenu.text()).toContain('移除')
    expect(sourceMenu.text()).not.toContain('打开文件')
    wrapper.unmount()
  })

  it('previews and submits a Markdown notebook folder import', async () => {
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'note_page') return { items: [], total: 0, hasMore: false, nextCursor: '' }
      if (command === 'notebook_list' || command === 'note_template_list' || command === 'external_markdown_list') return []
      if (command === 'markdown_notebook_pick_folder') return {
        selected: true,
        rootName: 'My Notes',
        notebookPaths: ['archive'],
        ignoredDirectoryCount: 1,
        errors: [],
        files: [{ relativePath: 'archive/summary.md', contentMarkdown: '# Summary\n<script>alert(1)</script>', size: 35 }]
      }
      if (command === 'note_import_markdown') return { rootNotebookId: 'book-1', rootNotebookName: 'My Notes', notebookCount: 2, noteCount: 1, firstNoteId: '', renamed: {} }
      return []
    })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/notes', component: SidebarHarness }] })
    await router.push('/notes')
    await router.isReady()
    const wrapper = mount(SidebarHarness, { global: { plugins: [createPinia(), router, createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en', messages })] } })
    await flushPromises()

    await wrapper.get('.new-note-dropdown-btn').trigger('click')
    const importButton = wrapper.findAll('.dropdown-item').find(button => button.text().includes('导入 Markdown 笔记本'))
    expect(importButton).toBeTruthy()
    await importButton!.trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('My Notes')
    const confirm = Array.from(document.body.querySelectorAll('button')).find(button => button.textContent?.includes('开始导入')) as HTMLButtonElement
    confirm.click()
    await flushPromises()

    const call = mocks.invoke.mock.calls.find(([command]) => command === 'note_import_markdown')
    expect(call?.[1].files[0].contentHtml).not.toContain('<script>')
    expect(document.body.textContent).not.toContain('开始导入')
    wrapper.unmount()
  })
})
