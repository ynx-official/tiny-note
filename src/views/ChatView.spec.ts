import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatView from './ChatView.vue'

const testState = vi.hoisted(() => ({ invoke: vi.fn(), route: { query: {} }, router: { push: vi.fn(), replace: vi.fn() }, tasks: [], channels: [] }))
vi.mock('@tauri-apps/api/core', () => ({ Channel: class { onmessage = () => {} } }))
vi.mock('../services/eventChannel', () => ({ EventChannel: class { onmessage = () => {}; connect = vi.fn(() => new Promise(() => {})); close = vi.fn(); constructor() { testState.channels.push(this) } } }))
vi.mock('../services/tauri', () => ({ invoke: testState.invoke }))
vi.mock('vue-router', () => ({ useRoute: () => testState.route, useRouter: () => testState.router }))

function mountView() {
  return mount(ChatView, { attachTo: window.document.body, global: { plugins: [createPinia()], stubs: { MarkdownMessage: true } } })
}

describe('ChatView background tasks', () => {
  beforeEach(() => {
    testState.tasks = []
    testState.channels = []
    testState.route.query = {}
    testState.invoke.mockReset()
    localStorage.clear(); window.sessionStorage.clear(); window.__TAURI_INTERNALS__ = {}
    localStorage.setItem('tiny-note-context-consent:model-1', 'granted')
    testState.invoke.mockImplementation(async (command, args = {}) => {
      if (command === 'settings_get') return { theme: 'light', language: 'zh-CN', fimEnabled: false }
      if (command === 'model_list') return [{ id: 'model-1', provider: 'test', model: 'test-model', isDefault: true }]
      if (command === 'note_list' || command === 'notebook_list' || command === 'knowledge_base_list') return []
      if (command === 'agent_list_tools') return [{ name: 'search_notes', requireApproval: false }, { name: 'create_note', requireApproval: true }]
      if (command === 'background_task_list') return testState.tasks
      if (command === 'conversation_summary_task_create') {
        const task = { id: `task-${testState.tasks.length + 1}`, kind: 'conversation_summary', title: '总结为笔记', status: 'queued', payload: {}, output: '', result: null, conversationId: args.conversationId, resourceKey: `conversation:${args.conversationId}`, createdAt: new Date().toISOString() }
        testState.tasks.unshift(task); return task
      }
      if (command === 'background_task_enqueue') {
        const input = args.input; const id = `task-${testState.tasks.length + 1}`
        const task = { ...input, id, status: 'queued', output: '', result: null, resourceKey: input.conversationId ? `conversation:${input.conversationId}` : `note:${input.targetNoteId}`, createdAt: new Date().toISOString() }
        testState.tasks.unshift(task); return task
      }
      if (command === 'background_task_transition') {
        const task = testState.tasks.find(item => item.id === args.input.id); Object.assign(task, { status: args.input.status, output: task.output + (args.input.outputDelta || '') }); return { ...task }
      }
      if (command === 'chat_create') return { id: 'conversation-1', title: '新对话', mode: args.mode }
      if (command === 'chat_add_message') return { id: args.role === 'user' ? 'message-user-1' : crypto.randomUUID(), role: args.role, content: args.content, references: args.references || [] }
      if (command === 'agent_invoke' || command === 'note_ai_stream') return null
      if (command === 'chat_generate_title') return '测试对话'
      return null
    })
  })
  afterEach(() => { delete window.__TAURI_INTERNALS__; window.document.body.innerHTML = '' })

  it('shows Agent capabilities and only enables send for non-empty input', async () => {
    const wrapper = mountView(); await flushPromises()
    const send = wrapper.get('.chat-page-send[type="submit"]')
    expect(send.element.disabled).toBe(true)
    await wrapper.findAll('.chat-mode-switch button')[1].trigger('click')
    await wrapper.get('textarea').setValue('查询笔记')
    expect(send.element.disabled).toBe(false)
    expect(wrapper.get('[data-testid="agent-tool-summary"]').text()).toContain('2 个工具可用')
    wrapper.unmount()
  })

  it('runs normal Agent chat in the conversation without creating a task-center record', async () => {
    const wrapper = mountView(); await flushPromises()
    await wrapper.findAll('.chat-mode-switch button')[1].trigger('click')
    await wrapper.get('textarea').setValue('创建一篇笔记')
    await wrapper.find('form').trigger('submit'); await flushPromises()
    expect(testState.invoke).toHaveBeenCalledWith('agent_invoke', expect.objectContaining({ request: expect.objectContaining({ conversationId: 'conversation-1', messageId: 'message-user-1', message: '创建一篇笔记' }), onEvent: expect.anything() }))
    expect(testState.invoke.mock.calls.some(([command]) => command === 'background_task_enqueue')).toBe(false)
    wrapper.unmount(); await flushPromises()
    expect(testState.invoke.mock.calls.some(([command]) => command === 'agent_cancel')).toBe(false)
  })

  it('reuses the active Agent event stream across consecutive approvals', async () => {
    const wrapper = mountView(); await flushPromises()
    await wrapper.findAll('.chat-mode-switch button')[1].trigger('click')
    await wrapper.get('textarea').setValue('连续执行两个操作')
    await wrapper.find('form').trigger('submit'); await flushPromises()
    const channel = testState.channels.at(-1)

    await channel.onmessage({ type: 'toolCall', runId: 'run-1', toolCallId: 'tool-1', toolName: 'create_note', arguments: { title: '第一篇' } })
    await channel.onmessage({ type: 'approvalRequired', runId: 'run-1', toolCallId: 'tool-1', toolName: 'create_note', arguments: { title: '第一篇' }, approvalHash: 'hash-1' })
    await flushPromises()
    expect(window.document.querySelector('.agent-approval-dialog')?.textContent).toContain('第一篇')

    ;(window.document.querySelector('.agent-approval-actions .is-approve') as HTMLButtonElement).click(); await flushPromises()
    expect(window.document.querySelector('.agent-approval-dialog')).toBeNull()
    expect(testState.invoke).toHaveBeenCalledWith('agent_resume', expect.objectContaining({ onEvent: channel }))

    await channel.onmessage({ type: 'toolCall', runId: 'run-1', toolCallId: 'tool-2', toolName: 'delete_note', arguments: { id: 'note-2' } })
    await channel.onmessage({ type: 'approvalRequired', runId: 'run-1', toolCallId: 'tool-2', toolName: 'delete_note', arguments: { id: 'note-2' }, approvalHash: 'hash-2' })
    await flushPromises()
    expect((window.document.querySelector('.agent-approval-actions .is-approve') as HTMLButtonElement).disabled).toBe(false)
    wrapper.unmount()
  })

  it('reuses the server-persisted Agent failure without saving a duplicate', async () => {
    const base = testState.invoke.getMockImplementation()
    testState.invoke.mockImplementation(async (command, args = {}) => {
      if (command === 'chat_get') return {
        conversation: { id: 'conversation-1', title: '失败会话', mode: 'agent', modelProfileId: 'model-1' },
        messages: [
          { id: 'message-user-1', conversationId: 'conversation-1', role: 'user', content: '继续之前的任务', references: [], sources: [] },
          { id: 'message-failure-1', conversationId: 'conversation-1', role: 'assistant', content: 'Tiny Agent 执行失败：系统提示失败', references: [], sources: [{ type: 'run_failure', runId: 'run-failed' }], agentRunId: 'run-failed' }
        ]
      }
      return base(command, args)
    })
    const wrapper = mountView(); await flushPromises()
    await wrapper.findAll('.chat-mode-switch button')[1].trigger('click')
    await wrapper.get('textarea').setValue('继续之前的任务')
    await wrapper.find('form').trigger('submit'); await flushPromises()
    const channel = testState.channels.at(-1)

    await channel.onmessage({ type: 'started', runId: 'run-failed' })
    await channel.onmessage({ type: 'error', runId: 'run-failed', message: '系统提示失败' })
    await flushPromises()

    const assistantWrites = testState.invoke.mock.calls.filter(([command, args]) => command === 'chat_add_message' && args.role === 'assistant')
    expect(assistantWrites).toHaveLength(0)
    expect(wrapper.findAll('markdown-message-stub').at(-1)?.attributes('content')).toBe('Tiny Agent 执行失败：系统提示失败')
    wrapper.unmount()
  })

  it('dismisses an approval that the server reports was already processed', async () => {
    const base = testState.invoke.getMockImplementation()
    testState.invoke.mockImplementation(async (command, args = {}) => {
      if (command === 'agent_resume') throw new Error('待处理 Agent 步骤不存在')
      if (command === 'agent_get_run') return {
        id: 'run-1', status: 'running', steps: [
          { id: 'step-1', kind: 'tool', toolCallId: 'tool-1', toolName: 'delete_note', arguments: { id: 'note-1' }, output: '已移入最近删除', status: 'completed', approvalHash: 'hash-1' }
        ]
      }
      return base(command, args)
    })
    const wrapper = mountView(); await flushPromises()
    await wrapper.findAll('.chat-mode-switch button')[1].trigger('click')
    await wrapper.get('textarea').setValue('删除笔记')
    await wrapper.find('form').trigger('submit'); await flushPromises()
    const channel = testState.channels.at(-1)
    await channel.onmessage({ type: 'toolCall', runId: 'run-1', toolCallId: 'tool-1', toolName: 'delete_note', arguments: { id: 'note-1' } })
    await channel.onmessage({ type: 'approvalRequired', runId: 'run-1', toolCallId: 'tool-1', toolName: 'delete_note', arguments: { id: 'note-1' }, approvalHash: 'hash-1' })
    await flushPromises()

    ;(window.document.querySelector('.agent-approval-actions .is-approve') as HTMLButtonElement).click(); await flushPromises()

    expect(window.document.querySelector('.agent-approval-dialog')).toBeNull()
    expect(wrapper.find('.chat-page-error').exists()).toBe(false)
    expect(wrapper.get('[data-agent-event="tool"]').classes()).toContain('status-completed')
    wrapper.unmount()
  })

  it('keeps ordinary chat in the foreground instead of creating a task', async () => {
    const wrapper = mountView(); await flushPromises()
    await wrapper.get('textarea').setValue('解释一下这段内容')
    await wrapper.find('form').trigger('submit'); await flushPromises()
    expect(testState.invoke).toHaveBeenCalledWith('note_ai_stream', expect.objectContaining({ request: expect.objectContaining({ conversationId: 'conversation-1', messageId: 'message-user-1' }), onEvent: expect.anything() }))
    expect(testState.invoke.mock.calls.some(([command]) => command === 'background_task_enqueue')).toBe(false)
    wrapper.unmount()
  })

  it('summarizes a conversation snapshot without adding a synthetic chat message', async () => {
    testState.route.query = { id: 'conversation-1' }
    const base = testState.invoke.getMockImplementation()
    testState.invoke.mockImplementation(async (command, args = {}) => command === 'chat_get' ? { conversation: { id: 'conversation-1', title: '项目讨论', mode: 'chat', modelProfileId: 'model-1' }, messages: [{ role: 'user', content: '目标是什么？', references: [] }, { role: 'assistant', content: '交付后台任务中心。', references: [] }] } : base(command, args))
    const wrapper = mountView(); await flushPromises()
    const before = testState.invoke.mock.calls.filter(([command]) => command === 'chat_add_message').length
    await wrapper.get('.chat-page-summary').trigger('click'); await flushPromises()
    const enqueue = testState.invoke.mock.calls.find(([command]) => command === 'conversation_summary_task_create')
    expect(enqueue?.[1]).toEqual(expect.objectContaining({ conversationId: 'conversation-1', requestKey: expect.any(String) }))
    expect(enqueue?.[1]).not.toHaveProperty('snapshot')
    expect(testState.invoke.mock.calls.filter(([command]) => command === 'chat_add_message')).toHaveLength(before)
    wrapper.unmount()
  })

  it('restores persisted Agent steps when reopening a conversation', async () => {
    testState.route.query = { id: 'conversation-1' }
    const base = testState.invoke.getMockImplementation()
    testState.invoke.mockImplementation(async (command, args = {}) => {
      if (command === 'chat_get') return { conversation: { id: 'conversation-1', title: '历史任务', mode: 'agent', modelProfileId: 'model-1' }, messages: [{ role: 'assistant', content: '完成', references: [], agentRunId: 'run-1' }] }
      if (command === 'agent_get_run') return { steps: [{ id: 'step-1', kind: 'text', output: '已读取笔记', status: 'completed' }] }
      if (command === 'agent_get_pending_run') return null
      return base(command, args)
    })
    const wrapper = mountView(); await flushPromises()
    expect(wrapper.get('[data-agent-event="text"] markdown-message-stub').attributes('content')).toBe('已读取笔记')
    wrapper.unmount()
  })
})
