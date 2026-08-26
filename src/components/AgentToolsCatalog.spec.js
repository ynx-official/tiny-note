import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AgentToolsCatalog from './AgentToolsCatalog.vue'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('../services/tauri', () => ({ invoke }))

describe('AgentToolsCatalog', () => {
  beforeEach(() => invoke.mockReset())

  it('groups tools by product domain and exposes their safety policy', async () => {
    invoke.mockResolvedValue([
      { name: 'get_current_time', description: '获取当前时间', requireApproval: false },
      { name: 'list_knowledge_bases', description: '列出现有知识库及索引概况', requireApproval: false },
      { name: 'create_knowledge_base', description: '创建知识库', requireApproval: true },
      { name: 'update_knowledge_base', description: '更新知识库', requireApproval: true },
      { name: 'delete_knowledge_base', description: '删除知识库', requireApproval: true },
      { name: 'list_notes', description: '列出普通笔记', requireApproval: false },
      { name: 'create_note', description: '创建笔记', requireApproval: true },
      { name: 'create_note_in_knowledge_base', description: '在知识库中新建笔记引用', requireApproval: true },
      { name: 'move_note_to_knowledge_base', description: '移动笔记到其他知识库', requireApproval: true },
      { name: 'delete_note', description: '删除笔记', requireApproval: true },
      { name: 'list_notebooks', description: '列出笔记本', requireApproval: false },
      { name: 'create_notebook', description: '创建笔记本', requireApproval: true },
      { name: 'update_notebook', description: '更新笔记本', requireApproval: true },
      { name: 'move_notebook', description: '移动笔记本', requireApproval: true },
      { name: 'delete_notebook', description: '删除笔记本', requireApproval: true },
      { name: 'read_skill', description: '读取 Agent 技能', requireApproval: false },
      { name: 'call_mcp_tool', description: '调用外部 MCP 工具', requireApproval: true }
    ])

    const wrapper = mount(AgentToolsCatalog)
    await flushPromises()

    expect(invoke).toHaveBeenCalledWith('agent_list_tools')
    expect(wrapper.get('[data-testid="tool-summary"]').text()).toContain('17 个工具可用')
    expect(wrapper.text()).toContain('读取知识库目录')
    expect(wrapper.text()).toContain('创建知识库')
    expect(wrapper.text()).toContain('更新知识库信息')
    expect(wrapper.text()).toContain('删除知识库')
    expect(wrapper.text()).toContain('将笔记移入最近删除')
    expect(wrapper.text()).toContain('在知识库中新建笔记')
    expect(wrapper.text()).toContain('移动笔记到其他知识库')
    expect(wrapper.text()).toContain('列出笔记')
    expect(wrapper.text()).toContain('移动笔记本')
    expect(wrapper.findAll('.agent-tool-group > header strong').map(node => node.text())).toEqual(['系统', '笔记', '笔记本', '知识库', 'Agent 技能', 'MCP 服务'])
    expect(wrapper.text()).not.toContain('本地只读')
    expect(wrapper.text()).not.toContain('本地写入')
    expect(wrapper.text()).toContain('每次审批')
    expect(wrapper.text()).toContain('无需审批')
    expect(wrapper.text()).toContain('list_knowledge_bases')
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
