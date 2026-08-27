<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Brain, Cable, CheckCircle2, FolderTree, LibraryBig, LoaderCircle, NotebookPen, RefreshCw, ShieldCheck, Sparkles, TerminalSquare, UsersRound, Wrench } from 'lucide-vue-next'
import { invoke } from '../services/tauri'
import { errorMessage, type AgentTool } from '../types/domain'

const tools = ref<AgentTool[]>([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')

const toolMeta: Record<string, { label: string; group: string; permission: string }> = {
  get_current_time: { label: '获取当前时间', group: 'system', permission: '只读' },
  run_sandbox_script: { label: '运行隔离计算脚本', group: 'system', permission: '计算' },
  list_notes: { label: '列出笔记', group: 'notes', permission: '只读' },
  search_notes: { label: '搜索笔记', group: 'notes', permission: '只读' },
  get_note: { label: '读取笔记', group: 'notes', permission: '只读' },
  create_note: { label: '创建笔记', group: 'notes', permission: '写入' },
  create_note_in_knowledge_base: { label: '在知识库中新建笔记', group: 'knowledge', permission: '写入' },
  move_note_to_knowledge_base: { label: '移动笔记到其他知识库', group: 'knowledge', permission: '写入' },
  update_note: { label: '生成笔记修改提案', group: 'notes', permission: '写入' },
  delete_note: { label: '将笔记移入最近删除', group: 'notes', permission: '写入' },
  list_notebooks: { label: '列出笔记本', group: 'notebooks', permission: '只读' },
  create_notebook: { label: '创建笔记本', group: 'notebooks', permission: '写入' },
  update_notebook: { label: '更新笔记本', group: 'notebooks', permission: '写入' },
  move_notebook: { label: '移动笔记本', group: 'notebooks', permission: '写入' },
  delete_notebook: { label: '删除笔记本', group: 'notebooks', permission: '写入' },
  create_knowledge_base: { label: '创建知识库', group: 'knowledge', permission: '写入' },
  update_knowledge_base: { label: '更新知识库信息', group: 'knowledge', permission: '写入' },
  delete_knowledge_base: { label: '删除知识库', group: 'knowledge', permission: '写入' },
  list_knowledge_bases: { label: '读取知识库目录', group: 'knowledge', permission: '只读' },
  update_memory: { label: '更新 Agent 记忆', group: 'agent-memory', permission: '写入' },
  read_skill: { label: '读取 Agent 技能', group: 'agent-skills', permission: '只读' },
  write_skill: { label: '更新 Agent 技能', group: 'agent-skills', permission: '写入' },
  list_agent_files: { label: '浏览 Agent 工作区', group: 'agent-workspace', permission: '只读' },
  read_agent_file: { label: '读取 Agent 工作区文件', group: 'agent-workspace', permission: '只读' },
  write_agent_file: { label: '写入 Agent 工作区文件', group: 'agent-workspace', permission: '写入' },
  list_mcp_tools: { label: '查找 MCP 工具', group: 'mcp', permission: '外部' },
  call_mcp_tool: { label: '调用 MCP 工具', group: 'mcp', permission: '外部' },
  delegate_task: { label: '委派子 Agent', group: 'agent-collaboration', permission: '外部' }
}

const groupDefinitions = [
  { id: 'system', label: '系统', description: '时间、隔离计算等系统基础能力', icon: Wrench },
  { id: 'notes', label: '笔记', description: '创建、搜索、读取、修改或删除笔记', icon: NotebookPen },
  { id: 'notebooks', label: '笔记本', description: '管理笔记本信息与层级，不递归删除内容', icon: FolderTree },
  { id: 'knowledge', label: '知识库', description: '管理知识库元数据与笔记引用', icon: LibraryBig },
  { id: 'agent-memory', label: 'Agent 记忆', description: '维护 Agent 跨会话使用的长期记忆', icon: Brain },
  { id: 'agent-skills', label: 'Agent 技能', description: '读取、创建或更新本地 SKILL.md', icon: Sparkles },
  { id: 'agent-workspace', label: 'Agent 工作区', description: '在隔离工作区浏览、读取或写入文件', icon: TerminalSquare },
  { id: 'mcp', label: 'MCP 服务', description: '发现并调用已连接的外部 MCP 工具', icon: Cable },
  { id: 'agent-collaboration', label: 'Agent 协作', description: '把边界清晰的任务委派给独立子 Agent', icon: UsersRound },
  { id: 'other', label: '其他工具', description: '当前版本尚未分类的能力', icon: Wrench }
]

const approvalCount = computed(() => tools.value.filter(tool => tool.requireApproval).length)
const customizedCount = computed(() => tools.value.filter(tool => tool.requireApproval !== tool.defaultRequireApproval).length)
const groups = computed(() => groupDefinitions.map(group => ({
  ...group,
  tools: tools.value
    .filter(tool => (toolMeta[tool.name]?.group || 'other') === group.id)
    .map(tool => ({ ...tool, label: toolMeta[tool.name]?.label || tool.name, permission: toolMeta[tool.name]?.permission || '其他' }))
})).filter(group => group.tools.length))

async function loadTools() {
  loading.value = true
  error.value = ''
  try { tools.value = await invoke('agent_list_tools') || [] }
  catch (cause) { tools.value = []; error.value = errorMessage(cause, '工具目录读取失败') }
  finally { loading.value = false }
}

async function updatePolicy(toolNames: string[], requireApproval: boolean | null) {
  if (!toolNames.length || saving.value) return
  saving.value = true
  error.value = ''
  try {
    tools.value = await invoke('agent_tool_policy_update', { request: { toolNames, requireApproval } }) || []
  } catch (cause) {
    error.value = errorMessage(cause, '审批策略保存失败')
  } finally {
    saving.value = false
  }
}

function togglePolicy(tool: AgentTool) {
  updatePolicy([tool.name], !tool.requireApproval)
}

onMounted(loadTools)
</script>

<template>
  <div class="agent-tools-catalog">
    <div class="agent-tools-overview">
      <div>
        <span class="agent-tools-overview-icon"><ShieldCheck :size="18" /></span>
        <div><strong data-testid="tool-summary">{{ tools.length }} 个工具可用</strong><small>{{ approvalCount }} 个操作需要逐次审批</small></div>
      </div>
      <div class="agent-tools-actions">
        <button data-testid="reset-tool-policies" type="button" :disabled="saving || !customizedCount" @click="updatePolicy(tools.map(tool => tool.name), null)">恢复系统默认</button>
      </div>
    </div>

    <div v-if="loading" class="agent-tools-state"><LoaderCircle :size="17" class="spinning" />正在读取工具目录…</div>
    <div v-else-if="error" class="agent-tools-state is-error"><span>{{ error }}</span><button data-testid="retry-tools" type="button" @click="loadTools"><RefreshCw :size="13" />重试</button></div>
    <div v-else-if="!tools.length" class="agent-tools-state">当前没有可用工具</div>
    <div v-else class="agent-tool-groups">
      <section v-for="group in groups" :key="group.id" class="agent-tool-group">
        <header><component :is="group.icon" :size="16" /><div class="agent-tool-group-heading"><strong>{{ group.label }}</strong><small>{{ group.description }}</small></div><div class="agent-tool-group-actions"><span>{{ group.tools.length }}</span><button :data-testid="`allow-group-${group.id}`" type="button" :disabled="saving || group.tools.every(tool => !tool.requireApproval)" :title="`${group.label}分类全部设为无需审批`" @click="updatePolicy(group.tools.map(tool => tool.name), false)">全部无需审批</button></div></header>
        <div class="agent-tool-list">
          <article v-for="tool in group.tools" :key="tool.name" class="agent-tool-row">
            <span class="agent-tool-available"><CheckCircle2 :size="15" /></span>
            <div class="agent-tool-copy"><strong>{{ tool.label }}</strong><span>{{ tool.description }}</span><code>{{ tool.name }}</code></div>
            <div class="agent-tool-badges"><span>{{ tool.permission }}</span><button :data-testid="`policy-${tool.name}`" type="button" role="switch" :aria-checked="!tool.requireApproval" :disabled="saving" :class="{ 'is-approval': tool.requireApproval }" :title="tool.requireApproval ? '点击设为无需审批' : '点击改为每次审批'" @click="togglePolicy(tool)">{{ tool.requireApproval ? '每次审批' : '无需审批' }}</button></div>
          </article>
        </div>
      </section>
    </div>
    <p class="agent-tools-footnote">系统提供默认审批值；你在这里设置的单个或批量策略会由 Rust 执行层强制应用。当前有 {{ customizedCount }} 项不同于系统默认。</p>
  </div>
</template>
