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

const externalSource = {
  id: 'external-note',
  title: '外部文章',
  path: 'D:\\Notes\\外部文章.md',
  fileName: '外部文章.md',
  updatedAt: '2026-08-28T00:00:00Z',
  available: true
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

describe('useNotesWorkspace external source actions', () => {
  beforeEach(() => {
    mocks.invoke.mockReset()
    mocks.invoke.mockImplementation((command: string, payload?: { deleted?: boolean }) => {
      if (command === 'note_list') return Promise.resolve(payload?.deleted ? [] : [existingNote])
      if (command === 'external_markdown_list') return Promise.resolve([externalSource])
      if (command === 'external_markdown_pick_files' || command === 'external_markdown_pick_folder') return Promise.resolve({ selected: false, files: [] })
      return Promise.resolve([])
    })
  })

  it('picks files or a recursive folder from the area menu and removes a source by id', async () => {
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
    const workspace = wrapper.vm.workspace
    workspace.openExternalAreaMenu(new MouseEvent('contextmenu', { clientX: 180, clientY: 120 }))
    await workspace.pickExternalFiles()
    expect(mocks.invoke).toHaveBeenCalledWith('external_markdown_pick_files')

    workspace.openExternalAreaMenu(new MouseEvent('contextmenu', { clientX: 180, clientY: 120 }))
    await workspace.pickExternalFolder()
    expect(mocks.invoke).toHaveBeenCalledWith('external_markdown_pick_folder')

    workspace.openExternalSourceMenu(new MouseEvent('contextmenu', { clientX: 180, clientY: 120 }), externalSource)
    await workspace.removeExternalSource()
    expect(mocks.invoke).toHaveBeenCalledWith('external_markdown_remove', { id: 'external-note' })
    wrapper.unmount()
  })

  it('does not remove the active external source when its latest edit cannot be saved', async () => {
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
    const workspace = wrapper.vm.workspace
    workspace.store.notes.push({ ...existingNote, id: externalSource.id, external: true, externalPath: externalSource.path })
    workspace.store.activeId = externalSource.id
    workspace.noteEditorRef.value = { saveLatestContent: vi.fn().mockResolvedValue(false) }

    workspace.openExternalSourceMenu(new MouseEvent('contextmenu'), externalSource)
    await workspace.removeExternalSource()

    expect(mocks.invoke).not.toHaveBeenCalledWith('external_markdown_remove', expect.anything())
    wrapper.unmount()
  })

})
