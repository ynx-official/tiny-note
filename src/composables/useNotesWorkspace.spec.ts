import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { messages } from '../i18n'
import { useNotesWorkspace } from './useNotesWorkspace'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('../services/tauri', () => ({ invoke: mocks.invoke }))

const existingNote = {
  id: 'existing-note',
  title: '已经存在的文章',
  contentHtml: '<h1>已经存在的文章</h1><p>首次打开也应显示正文</p>',
  contentText: '已经存在的文章\n首次打开也应显示正文',
  contentMarkdown: '# 已经存在的文章\n\n首次打开也应显示正文',
  notebookId: null,
  knowledgeBaseId: null,
  pinned: false,
  deletedAt: null,
  createdAt: '2026-08-27T00:00:00Z',
  updatedAt: '2026-08-27T00:00:00Z'
}

const newerEmptyDraft = {
  ...existingNote,
  id: 'newer-empty-draft',
  title: '未命名笔记',
  contentHtml: '<p></p>',
  contentText: '',
  contentMarkdown: '',
  updatedAt: '2026-08-27T01:00:00Z'
}

const WorkspaceHarness = defineComponent({
  setup() {
    return { workspace: useNotesWorkspace() }
  },
  template: '<article data-testid="active-note">{{ workspace.store.active?.contentText }}</article>'
})

describe('useNotesWorkspace startup', () => {
  beforeEach(() => {
    mocks.invoke.mockReset()
    mocks.invoke.mockImplementation((command: string, payload?: { deleted?: boolean }) => {
      if (command === 'note_list') return Promise.resolve(payload?.deleted ? [] : [newerEmptyDraft, existingNote])
      return Promise.resolve([])
    })
  })

  it('loads and selects an existing note on the first visit', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/notes', component: WorkspaceHarness }]
    })
    await router.push('/notes')
    await router.isReady()

    const wrapper = mount(WorkspaceHarness, {
      global: {
        plugins: [
          createPinia(),
          router,
          createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'en', messages })
        ]
      }
    })
    await flushPromises()

    expect(mocks.invoke).toHaveBeenCalledWith('note_list', { search: null, deleted: false, pinned: null })
    expect(wrapper.get('[data-testid="active-note"]').text()).toContain('首次打开也应显示正文')
    wrapper.unmount()
  })
})
