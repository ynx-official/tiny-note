import { defineComponent } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App.vue'
import ChatView from './ChatView.vue'
import { useAuthStore } from '../stores/auth'
import { resetWorkspaceSession } from '../services/workspaceSession'

const backend = vi.hoisted(() => ({ invoke: vi.fn(), channels: [] as Array<{ onmessage: (event: Record<string, unknown>) => unknown; close: ReturnType<typeof vi.fn> }> }))
vi.mock('../services/tauri', () => ({ invoke: backend.invoke }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => null }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))
vi.mock('../services/eventChannel', () => ({ EventChannel: class {
  onmessage: (event: Record<string, unknown>) => unknown = () => {}; close = vi.fn(); connect = vi.fn(async () => [])
  dispose() { this.close() }
  constructor() { backend.channels.push(this) }
} }))

const disposers: Array<() => void> = []
const Placeholder = defineComponent({ template: '<div data-page="other">其他工作区</div>' })
async function openWorkspace(path = '/chat?id=conversation-1') {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.$patch({ authenticated: true, initialized: true, user: { userId: 1 } as never })
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/chat', component: ChatView },
    ...['/', '/home', '/notes', '/library', '/tags', '/calendar', '/todos', '/settings'].map(path => ({ path, component: Placeholder }))
  ] })
  await router.push(path)
  const wrapper = mount(App, { attachTo: document.body, global: {
    plugins: [pinia, router, createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': { appName: 'Tiny Note', notes: '文章', library: '知识库', tags: '标签', settings: '设置' } } })],
    stubs: { MarkdownMessage: { props: ['content'], template: '<div class="markdown-test">{{ content }}</div>' }, AvatarDrawer: true, ChatHistoryDrawer: true, AppPromptDialog: true, AppFeedbackHost: true, AppUpdateDialog: true, AppExportLocationDialog: true, AppExportSuccessDialog: true }
  } })
  disposers.push(() => wrapper.unmount())
  await flushPromises()
  const homeTab = () => wrapper.get('.tab-strip .tab')
  const clickTab = async (label: string) => {
    await wrapper.findAll('.tab-strip .tab').find(tab => tab.text().includes(label))!.trigger('click')
    await flushPromises()
  }
  return { wrapper, router, pinia, auth, homeTab, clickTab }
}

beforeEach(() => {
  backend.channels = []
  backend.invoke.mockReset()
  localStorage.clear(); sessionStorage.clear(); window.__TAURI_INTERNALS__ = {} as never
  localStorage.setItem('tiny-note-context-consent:model-1', 'granted')
  backend.invoke.mockImplementation(async (command, args = {}) => {
    if (command === 'settings_get') return { theme: 'light', language: 'zh-CN' }
    if (command === 'model_list') return [{ id: 'model-1', provider: 'test', model: 'test-model', isDefault: true }]
    if (command === 'note_page') return { items: [], total: 0, hasMore: false, nextCursor: '' }
    if (['notebook_list', 'external_markdown_list', 'knowledge_base_list', 'background_task_list', 'agent_list_tools'].includes(command)) return []
    if (command === 'chat_get') return { conversation: { id: args.id, title: '项目周报整理', mode: 'agent', modelProfileId: 'model-1' }, messages: [{ id: 'greeting', role: 'assistant', content: '请查看项目周报。', references: [] }] }
    if (command === 'chat_create') return { id: 'created-chat', title: '新对话', mode: args.mode }
    if (command === 'chat_add_message') return { id: crypto.randomUUID(), role: args.role, content: args.content, references: args.references || [] }
    return null
  })
})
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); delete window.__TAURI_INTERNALS__; document.body.innerHTML = '' })

describe('chat navigation continuity', () => {
  it('preserves an idle conversation, draft and reading position across every top tab', async () => {
    const { wrapper, router, clickTab } = await openWorkspace()
    await wrapper.get('textarea').setValue('我再核对一下原文…')
    const messages = wrapper.get<HTMLElement>('.chat-page-messages').element
    Object.defineProperties(messages, { scrollHeight: { configurable: true, value: 1400 }, clientHeight: { configurable: true, value: 400 } })
    messages.scrollTop = 180
    await wrapper.get('.chat-page-messages').trigger('scroll')
    for (const label of ['文章', '知识库', '标签', '日历', '待办']) {
      await clickTab(label)
      expect(router.currentRoute.value.path).not.toBe('/chat')
      await clickTab('Tiny Note')
      expect(router.currentRoute.value.fullPath).toBe('/chat?id=conversation-1')
      expect(wrapper.get<HTMLTextAreaElement>('textarea').element.value).toBe('我再核对一下原文…')
      expect(wrapper.get('.chat-page-messages').element).toBe(messages)
      expect(messages.scrollTop).toBe(180)
    }
    expect(backend.invoke.mock.calls.filter(([command]) => command === 'chat_get')).toHaveLength(1)
  })

  it('keeps receiving the reply while another route has its own id query', async () => {
    const { wrapper, router, clickTab, homeTab } = await openWorkspace()
    await wrapper.get('textarea').setValue('整理一下周报')
    await wrapper.get('form').trigger('submit'); await flushPromises()
    const channel = backend.channels.at(-1)!
    await wrapper.get('textarea').setValue('未发送的补充')
    await router.push('/notes?id=article-9'); await flushPromises()
    expect(homeTab().text()).toContain('生成中')
    expect(channel.close).not.toHaveBeenCalled()
    await channel.onmessage({ type: 'textDelta', text: '后台生成的回复' })
    await channel.onmessage({ type: 'completed' }); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/notes')
    expect(homeTab().text()).not.toContain('生成中')
    await clickTab('Tiny Note')
    expect(wrapper.text()).toContain('后台生成的回复')
    expect(wrapper.get<HTMLTextAreaElement>('textarea').element.value).toBe('未发送的补充')
    expect(backend.invoke).not.toHaveBeenCalledWith('chat_get', { id: 'article-9' })
    expect(backend.invoke.mock.calls.filter(([command]) => command === 'agent_invoke')).toHaveLength(1)
  })

  it('keeps approval inline and pending across navigation until the user explicitly approves', async () => {
    const { wrapper, clickTab, homeTab } = await openWorkspace()
    await wrapper.get('textarea').setValue('补充周报')
    await wrapper.get('form').trigger('submit'); await flushPromises()
    const channel = backend.channels.at(-1)!
    await channel.onmessage({ type: 'started', runId: 'run-1' })
    await channel.onmessage({ type: 'toolCall', toolCallId: 'tool-1', toolName: 'update_note', arguments: { id: 'note-1' } })
    await channel.onmessage({ type: 'approvalRequired', runId: 'run-1', toolCallId: 'tool-1', toolName: 'update_note', arguments: { id: 'note-1' }, approvalHash: 'exact-parameters' })
    await flushPromises()
    expect(wrapper.find('.chat-page-messages .agent-approval-card').exists()).toBe(true)
    expect(document.querySelector('.agent-approval-overlay')).toBeNull()
    await clickTab('文章')
    expect(homeTab().text()).toContain('待确认')
    expect(document.querySelector('.agent-approval-card')).toBeNull()
    expect(backend.invoke.mock.calls.some(([command]) => command === 'agent_resume')).toBe(false)
    await clickTab('Tiny Note')
    await wrapper.get('.agent-approval-actions .is-approve').trigger('click'); await flushPromises()
    expect(backend.invoke).toHaveBeenCalledWith('agent_resume', expect.objectContaining({ request: expect.objectContaining({ runId: 'run-1', toolCallId: 'tool-1', approvalHash: 'exact-parameters', decision: 'approve' }) }))
    expect(wrapper.text()).toContain('已批准')
  })

  it('does not navigate back when creating a new conversation finishes after switching tabs', async () => {
    let finishCreate!: (value: unknown) => void
    const base = backend.invoke.getMockImplementation()!
    backend.invoke.mockImplementation((command, args) => command === 'chat_create' ? new Promise(resolve => { finishCreate = resolve }) : base(command, args))
    const { wrapper, router, clickTab } = await openWorkspace('/chat?from=home')
    await wrapper.get('textarea').setValue('新会话内容')
    await wrapper.get('form').trigger('submit'); await flushPromises()
    await clickTab('文章')
    finishCreate({ id: 'created-chat', title: '新对话', mode: 'chat' }); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/notes')
    await clickTab('Tiny Note')
    expect(router.currentRoute.value.query.id).toBe('created-chat')
    expect(wrapper.text()).toContain('新会话内容')
  })

  it('clears the retained conversation and stream on account reset, ignoring late events', async () => {
    const { wrapper, clickTab, pinia, homeTab } = await openWorkspace()
    await wrapper.get('textarea').setValue('私密内容')
    await wrapper.get('form').trigger('submit'); await flushPromises()
    const channel = backend.channels.at(-1)!
    await clickTab('文章')
    await resetWorkspaceSession(pinia); await flushPromises()
    expect(channel.close).toHaveBeenCalled()
    const writes = backend.invoke.mock.calls.length
    await channel.onmessage({ type: 'completed', content: '旧账号的晚到结果' }); await flushPromises()
    expect(backend.invoke.mock.calls).toHaveLength(writes)
    expect(homeTab().text()).not.toContain('生成中')
    await clickTab('Tiny Note')
    expect(wrapper.find('.chat-page').exists()).toBe(false)
  })

  it('does not erase a new draft or submit twice while the first message is being saved', async () => {
    let finishSave!: (value: unknown) => void
    const base = backend.invoke.getMockImplementation()!
    backend.invoke.mockImplementation((command, args) => command === 'chat_add_message' ? new Promise(resolve => { finishSave = resolve }) : base(command, args))
    const { wrapper, clickTab } = await openWorkspace()
    await wrapper.get('textarea').setValue('先发送这句')
    await wrapper.get('form').trigger('submit'); await flushPromises()
    await wrapper.get('textarea').setValue('刚输入的下一句')
    await wrapper.get('form').trigger('submit'); await flushPromises()
    await clickTab('文章')
    finishSave({ id: 'sent-1', role: 'user', content: '先发送这句', references: [] }); await flushPromises()
    await clickTab('Tiny Note')
    expect(wrapper.get<HTMLTextAreaElement>('textarea').element.value).toBe('刚输入的下一句')
    expect(backend.invoke.mock.calls.filter(([command]) => command === 'chat_add_message')).toHaveLength(1)
    expect(backend.invoke.mock.calls.filter(([command]) => command === 'agent_invoke')).toHaveLength(1)
  })

  it('keeps the reader at the same message while background deltas arrive', async () => {
    const { wrapper, clickTab } = await openWorkspace()
    await wrapper.get('textarea').setValue('整理一下周报')
    await wrapper.get('form').trigger('submit'); await flushPromises()
    const channel = backend.channels.at(-1)!
    const messages = wrapper.get<HTMLElement>('.chat-page-messages').element
    Object.defineProperties(messages, { scrollHeight: { configurable: true, value: 1400 }, clientHeight: { configurable: true, value: 400 } })
    messages.scrollTop = 180
    await wrapper.get('.chat-page-messages').trigger('scroll')
    await channel.onmessage({ type: 'textDelta', text: '新增内容' }); await flushPromises()
    expect(messages.scrollTop).toBe(180)
    await clickTab('文章')
    await channel.onmessage({ type: 'textDelta', text: '后台继续生成' }); await flushPromises()
    await clickTab('Tiny Note')
    expect(messages.scrollTop).toBe(180)
    expect(wrapper.text()).toContain('后台继续生成')
  })

  it('does not continue initialization or message submission after signing out', async () => {
    let finishSettings!: (value: unknown) => void
    const base = backend.invoke.getMockImplementation()!
    backend.invoke.mockImplementation((command, args) => command === 'settings_get' ? new Promise(resolve => { finishSettings = resolve }) : base(command, args))
    sessionStorage.setItem('tiny-note-chat-pending', JSON.stringify({ message: '尚未开始的请求', mode: 'agent' }))
    const { auth } = await openWorkspace('/chat?from=home')
    auth.authenticated = false
    await flushPromises()
    const before = backend.invoke.mock.calls.length
    finishSettings({ theme: 'light', language: 'zh-CN' }); await flushPromises()
    expect(backend.invoke.mock.calls).toHaveLength(before)
    expect(backend.invoke.mock.calls.some(([command]) => command === 'chat_create')).toBe(false)
  })

  it('retains unanswered input when visiting an article and shows the return status', async () => {
    const { wrapper, homeTab, clickTab } = await openWorkspace()
    await wrapper.get('textarea').setValue('整理一下周报')
    await wrapper.get('form').trigger('submit'); await flushPromises()
    const channel = backend.channels.at(-1)!
    await channel.onmessage({ type: 'inputRequired', runId: 'run-1', toolCallId: 'input-1', inputHash: 'input-hash', request: { title: '确认范围', question: '需要整理哪一部分？', options: [{ id: 'all', label: '全部内容' }], allowOther: true } })
    await flushPromises()
    const inputCard = wrapper.get('[data-agent-event="input"]').element
    await clickTab('文章')
    expect(homeTab().text()).toContain('待回答')
    await clickTab('Tiny Note')
    expect(wrapper.get('[data-agent-event="input"]').element).toBe(inputCard)
    expect(backend.invoke.mock.calls.some(([command]) => command === 'agent_respond_input')).toBe(false)
  })
})
