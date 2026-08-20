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
    <header class="assistant-panel-header"><div><h2>Agent 技能</h2><small>按需加载的本地 SKILL.md 指令</small></div><div class="skills-header-actions"><button type="button" class="assistant-secondary-button" @click="newSkill"><Plus :size="14" />新建</button><button type="button" class="assistant-close" aria-label="关闭" @click="emit('close')"><X :size="18" /></button></div></header>
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
  </section>
</template>
