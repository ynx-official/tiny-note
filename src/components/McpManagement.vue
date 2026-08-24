<script setup>
import { onMounted, ref } from 'vue'
import { Cable, Plus, RefreshCw, Save, Trash2, X } from 'lucide-vue-next'
import { invoke } from '../services/tauri'
import { requestConfirmation } from '../services/appFeedback'

const emit = defineEmits(['close'])
const servers = ref([])
const editor = ref(null)
const loading = ref(false)
const busyId = ref('')
const error = ref('')

async function loadServers() {
  loading.value = true
  error.value = ''
  try { servers.value = await invoke('agent_mcp_list') }
  catch (cause) { error.value = cause?.message || 'MCP 配置读取失败' }
  finally { loading.value = false }
}

function openEditor(server = null) {
  editor.value = server
    ? { ...server, argsText: (server.args || []).join('\n'), isNew: false, saving: false }
    : { id: '', name: '', command: '', argsText: '', enabled: true, isNew: true, saving: false }
}

async function saveServer() {
  if (!editor.value || editor.value.saving) return
  if (!/^[A-Za-z0-9_-]{1,48}$/.test(editor.value.id.trim())) { error.value = '服务 ID 只能包含字母、数字、- 和 _'; return }
  if (!editor.value.name.trim() || !editor.value.command.trim()) { error.value = '名称和启动命令不能为空'; return }
  editor.value.saving = true
  error.value = ''
  try {
    await invoke('agent_mcp_upsert', { request: { id: editor.value.id.trim(), name: editor.value.name.trim(), command: editor.value.command.trim(), args: editor.value.argsText.split('\n').map(item => item.trim()).filter(Boolean), enabled: editor.value.enabled } })
    editor.value = null
    await loadServers()
  } catch (cause) { error.value = cause?.message || 'MCP 配置保存失败' }
  finally { if (editor.value) editor.value.saving = false }
}

async function refreshServer(server) {
  busyId.value = server.id
  error.value = ''
  try { await invoke('agent_mcp_refresh', { id: server.id }); await loadServers() }
  catch (cause) { error.value = cause?.message || 'MCP 服务连接失败'; await loadServers() }
  finally { busyId.value = '' }
}

async function removeServer(server) {
  if (!(await requestConfirmation({ title: '删除 MCP 服务', message: `确定删除「${server.name}」吗？`, tone: 'danger', confirmLabel: '删除' }))) return
  try { await invoke('agent_mcp_delete', { id: server.id }); await loadServers() }
  catch (cause) { error.value = cause?.message || 'MCP 服务删除失败' }
}

onMounted(loadServers)
</script>

<template>
  <section class="assistant-panel mcp-panel">
    <header class="assistant-panel-header"><div><h2>MCP 服务</h2><small>连接本机 stdio 工具服务</small></div><div class="skills-header-actions"><button type="button" class="assistant-secondary-button" @click="openEditor()"><Plus :size="14" />添加</button><button type="button" class="assistant-close" aria-label="关闭" @click="emit('close')"><X :size="18" /></button></div></header>
    <div class="assistant-panel-body">
      <p class="memory-hint">Tiny Note 不通过 Shell 解析命令。连接测试会启动一次服务并缓存工具清单；每次实际 MCP 调用仍会请求你的批准。</p>
      <div v-if="loading" class="assistant-state">正在读取…</div>
      <div v-else-if="!servers.length" class="assistant-state"><Cable :size="24" /><strong>还没有 MCP 服务</strong><span>添加一个 stdio MCP 服务，让 Agent 使用外部能力。</span></div>
      <div v-else class="mcp-server-list">
        <article v-for="server in servers" :key="server.id" class="mcp-server-card">
          <div class="mcp-server-main"><span class="mcp-status-dot" :class="{ enabled: server.enabled && !server.lastError, error: server.lastError }"></span><div><strong>{{ server.name }}</strong><code>{{ server.command }} {{ (server.args || []).join(' ') }}</code></div><small>{{ server.enabled ? '已启用' : '已停用' }}</small></div>
          <p v-if="server.lastError" class="mcp-server-error">{{ server.lastError }}</p>
          <div v-if="server.cachedTools?.length" class="mcp-tools"><span v-for="tool in server.cachedTools" :key="tool.name">{{ tool.name }}</span></div>
          <footer><span>{{ server.cachedTools?.length || 0 }} 个工具</span><div><button type="button" title="连接并刷新" :disabled="busyId === server.id" @click="refreshServer(server)"><RefreshCw :size="14" :class="{ spinning: busyId === server.id }" /></button><button type="button" title="编辑" @click="openEditor(server)"><Cable :size="14" /></button><button type="button" title="删除" @click="removeServer(server)"><Trash2 :size="14" /></button></div></footer>
        </article>
      </div>
      <p v-if="error" class="assistant-state assistant-error">{{ error }}</p>
    </div>

    <div v-if="editor" class="memory-editor-backdrop" @click.self="!editor.saving && (editor = null)">
      <section class="memory-editor-modal mcp-editor-modal" role="dialog" aria-modal="true" aria-label="配置 MCP 服务">
        <header><div class="memory-editor-title"><Cable :size="16" /><strong>{{ editor.isNew ? '添加 MCP 服务' : `编辑 · ${editor.name}` }}</strong></div><button type="button" class="assistant-close" @click="editor = null"><X :size="18" /></button></header>
        <div class="mcp-form">
          <label><span>服务 ID</span><input v-model="editor.id" :disabled="!editor.isNew" placeholder="filesystem" maxlength="48" /></label>
          <label><span>显示名称</span><input v-model="editor.name" placeholder="本地文件服务" maxlength="80" /></label>
          <label><span>启动命令</span><input v-model="editor.command" placeholder="npx" /></label>
          <label><span>参数（每行一个）</span><textarea v-model="editor.argsText" placeholder="-y&#10;@modelcontextprotocol/server-filesystem&#10;/允许访问的目录"></textarea></label>
          <label class="mcp-enabled"><input v-model="editor.enabled" type="checkbox" /><span>启用此服务</span></label>
        </div>
        <footer><span>保存后点击刷新以发现工具</span><div><button type="button" class="assistant-secondary-button" @click="editor = null">取消</button><button type="button" class="assistant-primary-button" :disabled="editor.saving" @click="saveServer"><Save :size="13" />保存</button></div></footer>
      </section>
    </div>
  </section>
</template>
