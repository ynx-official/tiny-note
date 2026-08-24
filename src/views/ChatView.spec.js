import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatView from './ChatView.vue'

const testState = vi.hoisted(() => ({
  channels: [],
  invoke: vi.fn(),
  resumeFailure: null,
  route: { query: {} },
  router: { push: vi.fn(), replace: vi.fn() }
}))

vi.mock('@tauri-apps/api/core', () => ({
  Channel: class {
    constructor() {
      this.onmessage = () => {}
      testState.channels.push(this)
    }
  }
}))

vi.mock('../services/tauri', () => ({ invoke: testState.invoke }))
vi.mock('vue-router', () => ({
  useRoute: () => testState.route,
  useRouter: () => testState.router
}))

function click(selector) {
  const element = window.document.querySelector(selector)
  expect(element).not.toBeNull()
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
}

async function mountPendingApproval() {
  const wrapper = mount(ChatView, {
    attachTo: window.document.body,
    global: {
      plugins: [createPinia()],
      stubs: { MarkdownMessage: true }
    }
  })
  await flushPromises()

  await wrapper.findAll('.chat-mode-switch button')[1].trigger('click')
  await wrapper.find('textarea').setValue('创建两篇笔记')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  return wrapper
}

describe('ChatView Agent approval', () => {
  beforeEach(() => {
    testState.channels.length = 0
    testState.invoke.mockReset()
    testState.resumeFailure = null
    testState.router.push.mockReset()
    testState.router.replace.mockReset()
    testState.route.query = {}
    localStorage.clear()
    window.sessionStorage.clear()
    window.__TAURI_INTERNALS__ = {}
    localStorage.setItem('tiny-note-context-consent:model-1', 'granted')

    let resumeCount = 0
    testState.invoke.mockImplementation(async (command, args = {}) => {
      if (command === 'settings_get') return { theme: 'light', language: 'zh-CN', fimEnabled: false }
      if (command === 'model_list') return [{ id: 'model-1', provider: 'test', model: 'test-model', isDefault: true }]
      if (command === 'note_list' || command === 'notebook_list' || command === 'knowledge_base_list') return []
      if (command === 'agent_list_tools') return [
        { name: 'list_knowledge_bases', requireApproval: false },
        { name: 'create_note', requireApproval: true },
        { name: 'retrieve_knowledge', requireApproval: false }
      ]
      if (command === 'chat_create') return { id: 'conversation-1', title: '新对话', mode: args.mode }
      if (command === 'chat_add_message') return { id: crypto.randomUUID(), role: args.role, content: args.content, references: args.references || [] }
      if (command === 'agent_invoke') {
        await args.onEvent.onmessage({ type: 'started', runId: 'run-1' })
        await args.onEvent.onmessage({ type: 'toolCall', toolCallId: 'call-1', toolName: 'create_note', arguments: { title: '第一篇' } })
        await args.onEvent.onmessage({ type: 'approvalRequired', runId: 'run-1', toolCallId: 'call-1', toolName: 'create_note', arguments: { title: '第一篇' }, approvalHash: 'hash-1' })
        return null
      }
      if (command === 'agent_resume') {
        if (testState.resumeFailure !== null) {
          const failure = testState.resumeFailure
          testState.resumeFailure = null
          throw failure
        }
        resumeCount += 1
        if (resumeCount === 1) {
          await args.onEvent.onmessage({ type: 'toolResult', toolCallId: 'call-1', toolName: 'create_note', status: 'completed', output: '{}' })
          await args.onEvent.onmessage({ type: 'toolCall', toolCallId: 'call-2', toolName: 'update_note', arguments: { noteId: 'note-1' } })
          await args.onEvent.onmessage({ type: 'approvalRequired', runId: 'run-1', toolCallId: 'call-2', toolName: 'update_note', arguments: { noteId: 'note-1' }, approvalHash: 'hash-2' })
        }
        return null
      }
      return null
    })
  })

  afterEach(() => {
    delete window.__TAURI_INTERNALS__
    window.document.body.innerHTML = ''
  })

  it('uses a fresh event channel for every approval resume', async () => {
    const wrapper = await mountPendingApproval()

    click('.agent-approval-actions .is-approve')
    await flushPromises()
    click('.agent-approval-actions .is-approve')
    await flushPromises()

    const invokeCall = testState.invoke.mock.calls.find(([command]) => command === 'agent_invoke')
    const resumeCalls = testState.invoke.mock.calls.filter(([command]) => command === 'agent_resume')
    expect(resumeCalls).toHaveLength(2)
    expect(resumeCalls[0][1].onEvent).not.toBe(invokeCall[1].onEvent)
    expect(resumeCalls[1][1].onEvent).not.toBe(resumeCalls[0][1].onEvent)

    wrapper.unmount()
  })

  it('shows a string resume error and retries the pending approval with a new channel', async () => {
    testState.resumeFailure = 'Request is already active'
    const wrapper = await mountPendingApproval()

    click('.agent-approval-actions .is-approve')
    await flushPromises()
    expect(window.document.querySelector('.agent-approval-error')?.textContent).toBe('Request is already active')

    click('.agent-approval-actions .is-approve')
    await flushPromises()
    const resumeCalls = testState.invoke.mock.calls.filter(([command]) => command === 'agent_resume')
    expect(resumeCalls).toHaveLength(2)
    expect(resumeCalls[1][1].onEvent).not.toBe(resumeCalls[0][1].onEvent)

    wrapper.unmount()
  })

  it('shows the available tool and approval counts in agent mode', async () => {
    const wrapper = mount(ChatView, {
      attachTo: window.document.body,
      global: { plugins: [createPinia()], stubs: { MarkdownMessage: true } }
    })
    await flushPromises()

    await wrapper.findAll('.chat-mode-switch button')[1].trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="agent-tool-summary"]').text()).toContain('3 个工具可用')
    expect(wrapper.get('[data-testid="agent-tool-summary"]').text()).toContain('1 个操作需审批')
    expect(wrapper.text()).toContain('Tiny Agent')
    expect(wrapper.find('.tiny-agent-avatar-image').exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps the tool timeline after the user stops an agent run', async () => {
    const wrapper = await mountPendingApproval()

    await wrapper.get('.chat-page-send.is-stop').trigger('click')
    await flushPromises()

    const assistantSave = testState.invoke.mock.calls.find(([command, args]) =>
      command === 'chat_add_message' && args.role === 'assistant'
    )
    expect(assistantSave?.[1]).toMatchObject({
      content: '已停止 Tiny Agent 执行。',
      agentRunId: 'run-1'
    })
    expect(wrapper.text()).toContain('创建笔记')
    wrapper.unmount()
  })

  it('keeps the tool timeline when an agent run fails', async () => {
    const wrapper = await mountPendingApproval()

    await testState.channels[0].onmessage({ type: 'error', message: '工具连接中断' })
    await flushPromises()

    const assistantSave = testState.invoke.mock.calls.find(([command, args]) =>
      command === 'chat_add_message' && args.role === 'assistant'
    )
    expect(assistantSave?.[1]).toMatchObject({
      content: 'Tiny Agent 执行失败：工具连接中断',
      agentRunId: 'run-1'
    })
    expect(wrapper.text()).toContain('创建笔记')
    wrapper.unmount()
  })

  it('restores the saved tool timeline when reopening a conversation', async () => {
    const fallbackInvoke = testState.invoke.getMockImplementation()
    testState.route.query = { id: 'conversation-1' }
    testState.invoke.mockImplementation(async (command, args = {}) => {
      if (command === 'chat_get') return {
        conversation: { id: 'conversation-1', title: '历史任务', mode: 'agent', modelProfileId: 'model-1' },
        messages: [
          { id: 'message-1', role: 'user', content: '读取项目笔记', references: [] },
          { id: 'message-2', role: 'assistant', content: '已读取。', references: [], agentRunId: 'run-history' }
        ]
      }
      if (command === 'agent_get_run') return {
        id: args.runId,
        steps: [
          { id: 'step-1', kind: 'text', arguments: {}, output: '我先读取项目笔记。', status: 'completed' },
          { id: 'step-2', kind: 'tool', toolCallId: 'call-history', toolName: 'call_mcp_tool', arguments: { serverId: 'notes-mcp', toolName: 'read_note', arguments: { noteId: 'note-1' } }, output: '{"title":"项目"}', status: 'completed' },
          { id: 'step-3', kind: 'text', arguments: {}, output: '读取完成，这是结果。', status: 'completed' }
        ]
      }
      if (command === 'agent_get_pending_run') return null
      return fallbackInvoke(command, args)
    })

    const wrapper = mount(ChatView, {
      attachTo: window.document.body,
      global: { plugins: [createPinia()], stubs: { MarkdownMessage: true } }
    })
    await flushPromises()

    const events = wrapper.findAll('[data-agent-event]')
    expect(events).toHaveLength(3)
    expect(events.map(event => event.attributes('data-agent-event'))).toEqual(['text', 'tool', 'text'])
    expect(events[0].get('markdown-message-stub').attributes('content')).toBe('我先读取项目笔记。')
    expect(events[1].text()).toContain('已调用 MCP · notes-mcp / read_note')
    expect(events[2].get('markdown-message-stub').attributes('content')).toBe('读取完成，这是结果。')
    expect(wrapper.text()).toContain('已调用 MCP')
    expect(wrapper.text()).toContain('note-1')
    wrapper.unmount()
  })

  it('interleaves live model text with real tool call events', async () => {
    const fallbackInvoke = testState.invoke.getMockImplementation()
    testState.invoke.mockImplementation(async (command, args = {}) => {
      if (command !== 'agent_invoke') return fallbackInvoke(command, args)
      await args.onEvent.onmessage({ type: 'started', runId: 'run-live' })
      await args.onEvent.onmessage({ type: 'textDelta', text: '我先查询外部服务。' })
      await args.onEvent.onmessage({ type: 'toolCall', toolCallId: 'call-live', toolName: 'call_mcp_tool', arguments: { serverId: 'calendar', toolName: 'list_events', arguments: {} } })
      await args.onEvent.onmessage({ type: 'toolResult', toolCallId: 'call-live', toolName: 'call_mcp_tool', status: 'completed', output: '{"events":[]}' })
      await args.onEvent.onmessage({ type: 'textDelta', text: '查询完成，目前没有日程。' })
      await args.onEvent.onmessage({ type: 'completed', runId: 'run-live', content: '我先查询外部服务。查询完成，目前没有日程。' })
      return null
    })
    const wrapper = mount(ChatView, {
      attachTo: window.document.body,
      global: { plugins: [createPinia()], stubs: { MarkdownMessage: true } }
    })
    await flushPromises()

    await wrapper.findAll('.chat-mode-switch button')[1].trigger('click')
    await wrapper.find('textarea').setValue('查询我的日程')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const events = wrapper.findAll('[data-agent-event]')
    expect(events.map(event => event.attributes('data-agent-event'))).toEqual(['text', 'tool', 'text'])
    expect(events[1].text()).toContain('MCP · calendar / list_events')
    expect(events[1].text()).toContain('真实返回')
    wrapper.unmount()
  })

  it('renders a structured input card and resumes with a semantic option id', async () => {
    const fallbackInvoke = testState.invoke.getMockImplementation()
    testState.invoke.mockImplementation(async (command, args = {}) => {
      if (command === 'agent_invoke') {
        await args.onEvent.onmessage({ type: 'started', runId: 'run-input' })
        await args.onEvent.onmessage({
          type: 'inputRequired',
          runId: 'run-input',
          toolCallId: 'call-input',
          inputHash: 'input-hash',
          request: {
            title: '选择保存方式',
            question: '这篇文章应该保存到哪里？',
            options: [
              { id: 'uncategorized', label: '保存到未分类', recommended: true },
              { id: 'knowledge_base', label: '选择知识库' }
            ],
            allowOther: true
          }
        })
        return null
      }
      if (command === 'agent_respond_input') {
        await args.onEvent.onmessage({ type: 'toolResult', toolCallId: 'call-input', toolName: 'request_user_input', status: 'answered', output: '{"outcome":"answered","selectedOptionId":"knowledge_base","selectedLabel":"选择知识库"}' })
        await args.onEvent.onmessage({ type: 'completed', runId: 'run-input', content: '好的，继续选择知识库。' })
        return null
      }
      return fallbackInvoke(command, args)
    })
    const wrapper = mount(ChatView, {
      attachTo: window.document.body,
      global: { plugins: [createPinia()], stubs: { MarkdownMessage: true } }
    })
    await flushPromises()

    await wrapper.findAll('.chat-mode-switch button')[1].trigger('click')
    await wrapper.find('textarea').setValue('帮我保存文章')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('这篇文章应该保存到哪里？')

    await wrapper.get('[data-option-id="knowledge_base"]').trigger('click')
    await flushPromises()
    const responseCall = testState.invoke.mock.calls.find(([command]) => command === 'agent_respond_input')
    expect(responseCall?.[1].request).toMatchObject({
      runId: 'run-input',
      toolCallId: 'call-input',
      inputHash: 'input-hash',
      outcome: 'answered',
      selectedOptionId: 'knowledge_base',
      otherText: null
    })
    expect(wrapper.findAll('markdown-message-stub').some(node => node.attributes('content') === '好的，继续选择知识库。')).toBe(true)
    wrapper.unmount()
  })
})
