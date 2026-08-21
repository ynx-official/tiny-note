<script setup>
import { computed, onMounted, ref } from 'vue'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { Eye, Pencil, Plus, Save, Sparkles, Trash2, X } from 'lucide-vue-next'
import { invoke } from '../services/tauri'

const emit = defineEmits(['close'])
const skills = ref([])
const loading = ref(false)
const error = ref('')
const editor = ref(null)
const helpOpen = ref(false)
const previewHtml = computed(() => DOMPurify.sanitize(marked.parse(editor.value?.content || '', { breaks: true, gfm: true })))

async function loadSkills() {
  loading.value = true
  error.value = ''
  try { skills.value = await invoke('agent_skill_list') }
  catch (cause) { error.value = cause?.message || '技能读取失败' }
  finally { loading.value = false }
}

async function editSkill(skill) {
  error.value = ''
  try {
    const full = await invoke('agent_skill_read', { name: skill.fileName.split('/')[0] })
    editor.value = { ...full, directoryName: skill.fileName.split('/')[0], mode: 'edit', saving: false }
  } catch (cause) { error.value = cause?.message || '技能读取失败' }
}

function newSkill() {
  editor.value = { name: '', directoryName: '', description: '', content: '---\nname: my-skill\ndescription: 描述这个技能适合什么任务。\n---\n\n# 技能名称\n\n在这里写清楚执行步骤、边界和输出要求。\n', builtin: false, mode: 'edit', saving: false, isNew: true }
}

async function saveSkill() {
  if (!editor.value || editor.value.saving) return
  const name = (editor.value.directoryName || editor.value.name).trim()
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) { error.value = '技能目录名只能包含字母、数字、- 和 _'; return }
  editor.value.saving = true
  error.value = ''
  try {
    await invoke('agent_skill_upsert', { request: { name, content: editor.value.content } })
    editor.value = null
    await loadSkills()
  } catch (cause) { error.value = cause?.message || '技能保存失败' }
  finally { if (editor.value) editor.value.saving = false }
}

async function deleteSkill(skill) {
  if (skill.builtin || !window.confirm(`确定删除技能「${skill.name}」吗？`)) return
  error.value = ''
  try { await invoke('agent_skill_delete', { name: skill.fileName.split('/')[0] }); await loadSkills() }
  catch (cause) { error.value = cause?.message || '技能删除失败' }
}

onMounted(loadSkills)
</script>

<template>
  <section class="assistant-panel skills-panel">
    <header class="assistant-panel-header"><div><div class="assistant-panel-heading"><h2>Agent 技能</h2><button type="button" class="skills-help-button" data-testid="skills-help" aria-label="了解 Agent 技能与工具的区别" :aria-expanded="helpOpen" aria-controls="agent-skills-help" @click="helpOpen = true">?</button></div><small>按需加载的本地 SKILL.md 指令</small></div><div class="skills-header-actions"><button type="button" class="assistant-secondary-button" @click="newSkill"><Plus :size="14" />新建</button><button type="button" class="assistant-close" aria-label="关闭" @click="emit('close')"><X :size="18" /></button></div></header>
    <div class="assistant-panel-body">
      <p class="memory-hint">技能保存在本机。Agent 只会在任务相关时读取完整内容；通过 Agent 修改技能仍需你的批准。</p>
      <div v-if="loading" class="assistant-state">正在读取…</div>
      <div v-else-if="error && !skills.length" class="assistant-state assistant-error">{{ error }}<button type="button" class="assistant-link-button" @click="loadSkills">刷新</button></div>
      <div v-else class="skills-grid">
        <article v-for="skill in skills" :key="skill.fileName" class="skill-card">
          <div class="skill-card-icon"><Sparkles :size="17" /></div>
          <div class="skill-card-content"><div><strong>{{ skill.name }}</strong><small v-if="skill.builtin">内置</small></div><p>{{ skill.description }}</p><code>{{ skill.fileName }}</code></div>
          <div class="skill-card-actions"><button type="button" title="编辑" @click="editSkill(skill)"><Pencil :size="14" /></button><button v-if="!skill.builtin" type="button" title="删除" @click="deleteSkill(skill)"><Trash2 :size="14" /></button></div>
        </article>
      </div>
      <p v-if="error && skills.length" class="assistant-state assistant-error">{{ error }}</p>
    </div>

    <div v-if="editor" class="memory-editor-backdrop" @click.self="!editor.saving && (editor = null)">
      <section class="memory-editor-modal skill-editor-modal" role="dialog" aria-modal="true" aria-label="编辑技能">
        <header><div class="memory-editor-title"><Sparkles :size="16" /><strong>{{ editor.isNew ? '新建技能' : `编辑技能 · ${editor.name}` }}</strong></div><button type="button" class="assistant-close" @click="editor = null"><X :size="18" /></button></header>
        <label v-if="editor.isNew" class="skill-name-field"><span>技能目录名</span><input v-model="editor.directoryName" placeholder="my-skill" maxlength="64" /></label>
        <div class="memory-mode-tabs"><button type="button" :class="{ active: editor.mode === 'edit' }" @click="editor.mode = 'edit'"><Pencil :size="13" />编辑</button><button type="button" :class="{ active: editor.mode === 'preview' }" @click="editor.mode = 'preview'"><Eye :size="13" />预览</button></div>
        <textarea v-if="editor.mode === 'edit'" v-model="editor.content" class="memory-editor-textarea" spellcheck="false"></textarea>
        <div v-else class="memory-editor-preview" v-html="previewHtml"></div>
        <footer><span>{{ editor.content.length }} 字</span><div><button type="button" class="assistant-secondary-button" @click="editor = null">取消</button><button type="button" class="assistant-primary-button" :disabled="editor.saving" @click="saveSkill"><Save :size="13" />{{ editor.saving ? '保存中…' : '保存技能' }}</button></div></footer>
      </section>
    </div>

    <div v-if="helpOpen" class="memory-editor-backdrop" @click.self="helpOpen = false">
      <section id="agent-skills-help" class="memory-editor-modal skill-help-modal" role="dialog" aria-modal="true" aria-label="Agent 技能与工具说明">
        <header><div class="memory-editor-title"><Sparkles :size="16" /><strong>Agent 技能与工具有什么不同？</strong></div><button type="button" class="assistant-close" aria-label="关闭说明" @click="helpOpen = false"><X :size="18" /></button></header>
        <div class="skill-help-content">
          <p class="skill-help-lead"><strong>技能决定怎么做，工具决定能做什么。</strong> 技能可以指导 Agent 组合工具，但不能凭空增加系统能力。</p>
          <div class="skill-help-comparison">
            <section><span>Agent 技能</span><strong>可编辑的操作手册</strong><p>以本地 SKILL.md 保存任务步骤、判断规则和输出要求。任务相关时才会加载，本身不直接执行系统操作。</p></section>
            <section><span>Agent 工具</span><strong>受控的执行能力</strong><p>由系统提供明确参数和执行逻辑，负责读取、写入、计算或调用外部服务，并受审批策略和审计约束。</p></section>
          </div>
          <aside class="skill-help-rule"><strong>作用边界</strong><span>技能可以编排多个工具；工具不理解完整工作流。MCP 属于工具来源，不属于技能。</span></aside>
          <section class="skill-help-example">
            <div><small>组合示例</small><h3>“知识库研究技能”如何工作</h3></div>
            <ol>
              <li><span>1</span><p>Agent 加载技能，理解“先盘点、再检索、最后引用总结”的步骤。</p></li>
              <li><span>2</span><p>调用 <code>list_knowledge_bases</code>，确认当前有哪些知识库及索引状态。</p></li>
              <li><span>3</span><p>按技能规则选择范围，再调用 <code>retrieve_knowledge</code> 检索相关内容。</p></li>
              <li><span>4</span><p>技能约束最终答案的结构和引用方式；真正读取数据的能力始终来自工具。</p></li>
            </ol>
          </section>
        </div>
        <footer class="skill-help-footer"><span>一句话总结：技能是操作手册，工具是执行按钮。</span><button type="button" class="assistant-primary-button" @click="helpOpen = false">知道了</button></footer>
      </section>
    </div>
  </section>
</template>
