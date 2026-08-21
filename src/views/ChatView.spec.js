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
})
