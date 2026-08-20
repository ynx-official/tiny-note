<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { FileSearch2, LibraryBig, NotebookPen, PenLine, Settings2, Sparkles, Paperclip, Send, MessageSquare, Globe2, ChevronDown } from 'lucide-vue-next'
import { useNotesStore } from '../stores/notes'

const router = useRouter()
const { locale } = useI18n()
const notes = useNotesStore()
const draft = ref('')
const homeFileInput = ref(null)
const importing = ref(false)

const copy = computed(() => locale.value === 'en' ? {
  subtitle: 'What would you like Tiny Note to help with?',
  placeholder: 'Write an idea or start a note…',
  noteMode: 'Note mode',
  localAi: 'Local AI · Quick',
  features: [
    ['Notes workspace', 'Capture and organize ideas', NotebookPen, '/notes'],
    ['Document import', 'Bring Markdown and text into notes', FileSearch2, '/notes'],
    ['Smart writing', 'Polish, expand, and summarize', PenLine, '/notes?new=1'],
    ['Knowledge base', 'Browse your local library', LibraryBig, '/library'],
    ['Model settings', 'Connect a private AI provider', Settings2, '/settings']
  ],
  start: 'Start a note'
} : {
  subtitle: '需要 Tiny Note 帮您做些什么？',
  placeholder: '写下一个想法，开始一篇笔记…',
  noteMode: '笔记模式',
  localAi: '本地 AI · 快速',
  features: [
    ['笔记工作区', '记录并整理每个想法', NotebookPen, '/notes'],
    ['文档导入', '将 Markdown 和文本带入笔记', FileSearch2, '/notes'],
    ['智能写作', '润色、扩写和总结内容', PenLine, '/notes?new=1'],
    ['知识库', '浏览你的本地资料库', LibraryBig, '/library'],
    ['模型设置', '连接私有 AI 提供商', Settings2, '/settings']
  ],
  start: '开始写笔记'
})

function open(path) { router.push(path) }
function startNote() { router.push('/notes?new=1') }
function submitDraft() { startNote() }
function openImport() { homeFileInput.value?.click() }
async function importFiles(event) {
  const files = Array.from(event.target.files || [])
  if (!files.length) return
  importing.value = true
  try {
    for (const file of files) await notes.importText(file)
    await router.push('/notes')
  } catch (error) {
    window.alert(error?.message || '文件导入失败，请重试')
  } finally {
    importing.value = false
    event.target.value = ''
  }
}
</script>

<template>
  <div class="home-page">
    <div class="home-content">
      <section class="home-hero" aria-labelledby="home-title">
        <div class="home-wordmark" aria-label="Tiny Note">
          <div class="home-mark"><NotebookPen :size="66" :stroke-width="1.55" /></div>
          <h1 id="home-title">Tiny Note</h1>
        </div>
        <p class="home-subtitle">{{ copy.subtitle }}</p>
      </section>

      <section class="home-composer" aria-label="快速开始">
        <textarea v-model="draft" rows="1" :placeholder="copy.placeholder" @keydown.enter.exact.prevent="submitDraft" />
        <div class="home-composer-actions">
          <div class="home-composer-left">
            <button class="home-select-button" type="button" @click="startNote"><MessageSquare :size="16" /><span>{{ copy.noteMode }}</span><ChevronDown :size="13" /></button>
            <button class="home-select-button" type="button" @click="open('/settings')"><Globe2 :size="16" /><span>{{ copy.localAi }}</span><ChevronDown :size="13" /></button>
          </div>
          <div class="home-composer-right">
            <button class="home-icon-button" type="button" title="导入文件" :disabled="importing" @click="openImport"><Paperclip :size="18" /></button>
            <input ref="homeFileInput" type="file" multiple hidden accept=".md,.markdown,.txt,.note" @change="importFiles" />
            <button class="home-send-button" type="button" :class="{ active: draft.trim() }" :title="copy.start" @click="submitDraft"><Send :size="18" /></button>
          </div>
        </div>
      </section>

      <section class="home-features" aria-label="快捷入口">
        <button v-for="([label, description, icon, path], index) in copy.features" :key="label" class="home-feature" type="button" @click="open(path)">
          <span class="home-feature-icon" :class="`home-feature-color-${index + 1}`"><component :is="icon" :size="24" :stroke-width="1.7" /></span>
          <strong>{{ label }}</strong>
          <small>{{ description }}</small>
        </button>
      </section>

      <p class="home-disclaimer"><Sparkles :size="13" /> Tiny Note 以本地笔记和知识库为中心，内容保存在你的设备上</p>
    </div>
  </div>
</template>
