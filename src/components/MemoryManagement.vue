<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { BookOpen, Eye, FileText, Pencil, Sparkles, User, Wrench, X } from 'lucide-vue-next'
import { invoke } from '../services/tauri'

const { t } = useI18n()
const emit = defineEmits(['close'])
const files = ref([])
const loading = ref(false)
const error = ref('')
const editor = ref(null)

const iconMap = { SOUL: Sparkles, USER: User, MEMORY: BookOpen, Agent: Wrench }
const activeIcon = computed(() => iconMap[editor.value?.nameKey] || FileText)
const previewHtml = computed(() => DOMPurify.sanitize(marked.parse(editor.value?.content || '', { breaks: true, gfm: true })))

async function loadFiles() {
  loading.value = true
  error.value = ''
  try {
    files.value = await invoke('memory_list')
  } catch (cause) {
    error.value = cause?.message || '记忆文件读取失败'
  } finally {
    loading.value = false
  }
}

function openEditor(file) {
  editor.value = { ...file, mode: 'edit', saving: false }
}

function closeEditor() {
  if (!editor.value?.saving) editor.value = null
}

async function saveEditor() {
  if (!editor.value || editor.value.saving) return
  editor.value.saving = true
  try {
    await invoke('memory_update', { fileName: editor.value.fileName, content: editor.value.content })
    editor.value = null
    await loadFiles()
  } catch (cause) {
    error.value = cause?.message || '记忆保存失败'
  } finally {
    if (editor.value) editor.value.saving = false
  }
}

function formatTime(value) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  } catch {
    return ''
  }
}

onMounted(loadFiles)
</script>

<template>
  <section class="assistant-panel memory-panel">
    <header class="assistant-panel-header">
      <h2>{{ t('memoryManagement') }}</h2>
      <button type="button" class="assistant-close" :aria-label="t('close')" @click="emit('close')"><X :size="18" /></button>
    </header>
    <div class="assistant-panel-body">
      <section class="memory-section">
        <h3>{{ t('assistantName') }}</h3>
        <div class="memory-assistant-card">
          <div class="memory-assistant-avatar" aria-hidden="true">🐶</div>
          <div class="memory-assistant-info"><div><span>{{ t('name') }}</span><strong>Tiny Note</strong></div><div><span>{{ t('birthDate') }}</span><strong>2026.8.20</strong></div></div>
        </div>
      </section>
      <section class="memory-section">
        <h3>{{ t('memoryFiles') }}</h3>
        <p class="memory-hint">{{ t('memoryHint') }}</p>
        <div v-if="loading" class="assistant-state">正在读取…</div>
        <div v-else-if="error" class="assistant-state assistant-error">{{ error }}<button type="button" class="assistant-link-button" @click="loadFiles">{{ t('refresh') }}</button></div>
        <div v-else class="memory-file-grid">
          <button v-for="file in files" :key="file.fileName" type="button" class="memory-file-card" @click="openEditor(file)">
            <div class="memory-file-head"><component :is="iconMap[file.nameKey] || FileText" :size="16" /><code>{{ file.fileName }}</code><Pencil :size="13" class="memory-file-edit" /></div>
            <strong>{{ file.description }}</strong>
            <p>{{ file.content.replace(/^# .*/m, '').trim().slice(0, 75) || '暂无内容' }}</p>
            <small>{{ file.size || file.content.length }} {{ t('words') }}<span v-if="file.updatedAt"> · {{ formatTime(file.updatedAt) }}</span></small>
          </button>
        </div>
      </section>
    </div>

    <div v-if="editor" class="memory-editor-backdrop" @click.self="closeEditor">
      <section class="memory-editor-modal" role="dialog" aria-modal="true" :aria-label="t('editMemory')">
        <header><div class="memory-editor-title"><component :is="activeIcon" :size="16" /><strong>{{ t('editMemory') }} · {{ editor.fileName }}</strong></div><button type="button" class="assistant-close" @click="closeEditor"><X :size="18" /></button></header>
        <div class="memory-mode-tabs"><button type="button" :class="{ active: editor.mode === 'edit' }" @click="editor.mode = 'edit'"><Pencil :size="13" />{{ t('editMemory') }}</button><button type="button" :class="{ active: editor.mode === 'preview' }" @click="editor.mode = 'preview'"><Eye :size="13" />{{ t('previewMemory') }}</button></div>
        <textarea v-if="editor.mode === 'edit'" v-model="editor.content" class="memory-editor-textarea" spellcheck="false"></textarea>
        <div v-else class="memory-editor-preview" v-html="previewHtml"></div>
        <footer><span>{{ editor.content.length }} {{ t('words') }}</span><div><button type="button" class="assistant-secondary-button" @click="closeEditor">{{ t('cancel') }}</button><button type="button" class="assistant-primary-button" :disabled="editor.saving" @click="saveEditor">{{ editor.saving ? t('saving') : t('saveMemory') }}</button></div></footer>
      </section>
    </div>
  </section>
</template>
