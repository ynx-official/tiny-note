import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AgentToolsCatalog from './AgentToolsCatalog.vue'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('../services/tauri', () => ({ invoke }))

describe('AgentToolsCatalog', () => {
  beforeEach(() => invoke.mockReset())

  it('groups all restored tools and dynamic MCP tools by product domain', async () => {
    const readOnly = new Set(['get_current_time', 'request_user_input', 'list_mcp_tools', 'read_skill', 'list_agent_files', 'read_agent_file', 'list_knowledge_bases', 'list_notes', 'search_notes', 'get_note', 'list_notebooks'])
    const names = [
      'get_current_time', 'request_user_input', 'list_mcp_tools', 'call_mcp_tool', 'delegate_task', 'run_sandbox_script',
      'read_skill', 'write_skill', 'list_agent_files', 'read_agent_file', 'write_agent_file',
      'create_note', 'create_note_in_knowledge_base', 'move_note_to_knowledge_base', 'update_note', 'delete_note', 'update_memory',
      'create_knowledge_base', 'update_knowledge_base', 'delete_knowledge_base', 'list_knowledge_bases',
      'list_notes', 'search_notes', 'get_note', 'list_notebooks', 'create_notebook', 'update_notebook', 'move_notebook', 'delete_notebook',
      'create_todo', 'create_calendar_event'
    ]
    const catalog = names.map(name => ({ name, description: name, requireApproval: !readOnly.has(name), defaultRequireApproval: !readOnly.has(name) }))
    catalog.push({ name: 'mcp_10203040_send_message', description: '发送外部消息', requireApproval: true, defaultRequireApproval: true })
    invoke.mockResolvedValue(catalog)

    const wrapper = mount(AgentToolsCatalog)
    await flushPromises()

    expect(invoke).toHaveBeenCalledWith('agent_list_tools')
    expect(wrapper.get('[data-testid="tool-summary"]').text()).toContain('32 个工具可用')
    expect(wrapper.text()).toContain('读取知识库目录')
    expect(wrapper.text()).toContain('创建知识库')
    expect(wrapper.text()).toContain('更新知识库信息')
    expect(wrapper.text()).toContain('删除知识库')
    expect(wrapper.text()).toContain('将笔记移入最近删除')
    expect(wrapper.text()).toContain('在知识库中新建笔记')
    expect(wrapper.text()).toContain('移动笔记到其他知识库')
    expect(wrapper.text()).toContain('列出笔记')
    expect(wrapper.text()).toContain('移动笔记本')
    expect(wrapper.text()).toContain('请求用户输入')
    expect(wrapper.text()).toContain('创建待办')
    expect(wrapper.text()).toContain('创建日历事件')
    expect(wrapper.text()).toContain('发送外部消息')
    expect(wrapper.findAll('.agent-tool-group > header strong').map(node => node.text())).toEqual(['系统', '日程与待办', '笔记', '笔记本', '知识库', 'Agent 记忆', 'Agent 技能', 'Agent 工作区', 'MCP 服务', 'Agent 协作'])
    expect(wrapper.text()).not.toContain('本地只读')
    expect(wrapper.text()).not.toContain('本地写入')
    expect(wrapper.text()).toContain('每次审批')
    expect(wrapper.text()).toContain('无需审批')
    expect(wrapper.text()).toContain('list_knowledge_bases')
    expect(wrapper.text()).toContain('mcp_10203040_send_message')
  })

  it('shows a retryable error when the tool catalog cannot be loaded', async () => {
    invoke.mockRejectedValueOnce(new Error('读取失败')).mockResolvedValueOnce([])

    const wrapper = mount(AgentToolsCatalog)
    await flushPromises()
    expect(wrapper.text()).toContain('读取失败')

    await wrapper.get('[data-testid="retry-tools"]').trigger('click')
    await flushPromises()
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('当前没有可用工具')
  })

  it('updates one tool or one product category and can restore system defaults', async () => {
    const defaults = [
      { name: 'create_note', description: '创建笔记', requireApproval: true, defaultRequireApproval: true },
      { name: 'get_note', description: '读取笔记', requireApproval: false, defaultRequireApproval: false },
      { name: 'update_note', description: '生成修改提案', requireApproval: true, defaultRequireApproval: true }
    ]
    invoke
      .mockResolvedValueOnce(defaults)
      .mockResolvedValueOnce(defaults.map(tool => tool.name === 'create_note' ? { ...tool, requireApproval: false } : tool))
      .mockResolvedValueOnce(defaults.map(tool => ({ ...tool, requireApproval: false })))
      .mockResolvedValueOnce(defaults)

    const wrapper = mount(AgentToolsCatalog)
    await flushPromises()

    await wrapper.get('[data-testid="policy-create_note"]').trigger('click')
    await flushPromises()
    expect(invoke).toHaveBeenNthCalledWith(2, 'agent_tool_policy_update', { request: { toolNames: ['create_note'], requireApproval: false } })

    await wrapper.get('[data-testid="allow-group-notes"]').trigger('click')
    await flushPromises()
    expect(invoke).toHaveBeenNthCalledWith(3, 'agent_tool_policy_update', { request: { toolNames: ['create_note', 'get_note', 'update_note'], requireApproval: false } })

    await wrapper.get('[data-testid="reset-tool-policies"]').trigger('click')
    await flushPromises()
    expect(invoke).toHaveBeenNthCalledWith(4, 'agent_tool_policy_update', { request: { toolNames: ['create_note', 'get_note', 'update_note'], requireApproval: null } })
  })
})
