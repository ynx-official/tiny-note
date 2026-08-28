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
    mocks.invoke.mockReset()
    mocks.invoke.mockImplementation((command: string, payload?: { deleted?: boolean }) => {
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
})
