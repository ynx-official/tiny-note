<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Channel } from '@tauri-apps/api/core'
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, File, FileSearch2, FileText, Folder, Globe2, LibraryBig, MessageSquare, NotebookPen, Paperclip, PenLine, Send, Settings2, Sparkles, Square, X } from 'lucide-vue-next'
import { useNotesStore } from '../stores/notes'
import { useLibraryStore } from '../stores/library'
import { invoke } from '../services/tauri'

const router = useRouter()
const { locale, t } = useI18n()
const notes = useNotesStore()
const library = useLibraryStore()
const draft = ref('')
const messages = ref([])
const streamingText = ref('')
const busy = ref(false)
const requestId = ref('')
const chatError = ref('')
const referenceMenuOpen = ref(false)
const referencePicker = ref(null)
const referenceFileBaseId = ref(null)
const references = ref([])
const personalBases = computed(() => library.bases.filter(item => item.category === 'personal'))
const localBases = computed(() => library.bases.filter(item => item.category === 'local'))
const noteCandidates = computed(() => notes.notes.filter(note => !note.deletedAt))

const copy = computed(() => locale.value === 'en' ? {
  subtitle: 'What would you like Tiny Note to help with?',
  placeholder: 'Write an idea or start a note…',
  noteMode: 'Chat mode',
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
  noteMode: '对话模式',
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
function assistantContext() {
  const referenceText = references.value.map(item => `${item.type === 'note' ? '笔记' : '文件'}：${item.name}`).join('\n')
  const history = messages.value.slice(-8).map(item => `${item.role === 'user' ? '用户' : '助手'}：${item.content}`).join('\n')
  return [referenceText ? `用户选择的引用：\n${referenceText}` : '', history ? `此前对话：\n${history}` : ''].filter(Boolean).join('\n\n') || '无额外上下文'
}
function pushResponse(content) { if (content?.trim()) messages.value.push({ role: 'assistant', content: content.trim() }) }
async function submitDraft() {
  const message = draft.value.trim()
  if (!message || busy.value) return
  messages.value.push({ role: 'user', content: message, references: references.value.map(item => ({ ...item })) })
  draft.value = ''
  chatError.value = ''
  busy.value = true
  streamingText.value = '正在思考…'
  requestId.value = crypto.randomUUID()
  if (!window.__TAURI_INTERNALS__) {
    window.setTimeout(() => { pushResponse(`这是浏览器预览回复：${message}`); streamingText.value = ''; busy.value = false }, 500)
    return
  }
  const channel = new Channel()
  channel.onmessage = event => {
    if (event.type === 'delta') { if (streamingText.value === '正在思考…') streamingText.value = ''; streamingText.value += event.text }
    if (event.type === 'error') { chatError.value = event.message || '模型请求失败'; streamingText.value = ''; busy.value = false }
    if (event.type === 'cancelled') { streamingText.value = ''; busy.value = false }
    if (event.type === 'completed') { pushResponse(streamingText.value === '正在思考…' ? '模型没有返回内容，请换个问法再试。' : streamingText.value); streamingText.value = ''; busy.value = false }
  }
  try {
    await invoke('note_ai_stream', { request: { requestId: requestId.value, action: 'custom', text: assistantContext(), instruction: message, modelProfileId: null, source: 'chat' }, onEvent: channel })
  } catch (error) { chatError.value = error?.message || '模型请求失败'; streamingText.value = ''; busy.value = false }
}
async function stopChat() {
  if (!busy.value || !requestId.value || !window.__TAURI_INTERNALS__) return
  try { await invoke('note_ai_cancel', { requestId: requestId.value }) } catch {}
  busy.value = false
  streamingText.value = ''
}
function closeReferenceMenu() {
  referenceMenuOpen.value = false
  referencePicker.value = null
  referenceFileBaseId.value = null
}
async function openReferenceMenu() {
  referenceMenuOpen.value = !referenceMenuOpen.value
  referencePicker.value = null
  referenceFileBaseId.value = null
  if (!referenceMenuOpen.value) return
  if (!notes.notes.length) await notes.load()
  if (!library.bases.length) await library.load()
}
async function openReferencePicker(type) {
  referencePicker.value = type
  if (type === 'file' && !library.bases.length) await library.load()
}
function addReference(reference) {
  if (!references.value.some(item => item.key === reference.key)) references.value.push(reference)
  closeReferenceMenu()
}
function removeReference(key) {
  references.value = references.value.filter(item => item.key !== key)
}
function addNoteReference(note) {
  addReference({ key: `note:${note.id}`, type: 'note', name: note.title || t('untitled'), noteId: note.id })
}
function addFileReference(entry) {
  addReference({ key: `file:${library.activeId}:${entry.relativePath}`, type: 'file', name: entry.name, baseId: library.activeId, baseName: library.active?.name || '', relativePath: entry.relativePath })
}
async function selectReferenceFileBase(baseId) {
  referenceFileBaseId.value = baseId
  await library.selectBase(baseId)
  if (library.path) await library.navigate('')
}
async function openReferenceFolder(entry) {
  await library.navigate(entry.relativePath)
}
async function referenceBack() {
  await library.goBack()
}

function restoreAssistantDraft() {
  try {
    const text = sessionStorage.getItem('tiny-note-assistant-draft')
    if (!text) return
    sessionStorage.removeItem('tiny-note-assistant-draft')
    draft.value = text
  } catch {}
}

onMounted(async () => {
  restoreAssistantDraft()
  if (!notes.notes.length) await notes.load()
  if (!library.bases.length) await library.load()
})
</script>

<template>
  <div class="home-page" @click="closeReferenceMenu">
    <div class="home-content">
      <section class="home-hero" aria-labelledby="home-title">
        <div class="home-wordmark" aria-label="Tiny Note">
          <div class="home-mark"><NotebookPen :size="66" :stroke-width="1.55" /></div>
          <h1 id="home-title">Tiny Note</h1>
        </div>
        <p class="home-subtitle">{{ copy.subtitle }}</p>
      </section>

      <section class="home-composer" aria-label="快速开始">
        <div v-if="messages.length || busy || chatError" class="home-chat-history" aria-live="polite">
          <div v-for="(message, index) in messages" :key="`${index}-${message.role}`" class="home-chat-message" :class="`is-${message.role}`"><span>{{ message.content }}</span></div>
          <div v-if="busy" class="home-chat-message is-assistant"><span>{{ streamingText || '正在思考…' }}</span></div>
          <div v-if="chatError" class="home-chat-error">{{ chatError }} <button type="button" @click="open('/settings')">打开模型设置</button></div>
        </div>
        <div v-if="references.length" class="home-reference-tags" aria-label="引用内容">
          <div v-for="reference in references" :key="reference.key" class="home-reference-tag" :class="`home-reference-tag-${reference.type}`">
            <FileText v-if="reference.type === 'note'" :size="14" />
            <File v-else :size="14" />
            <span class="home-reference-tag-name" :title="reference.name">{{ reference.name }}</span>
            <small v-if="reference.type === 'file' && reference.baseName">{{ reference.baseName }}</small>
            <button type="button" :title="t('removeReference')" @click.stop="removeReference(reference.key)"><X :size="13" /></button>
          </div>
        </div>
        <textarea v-model="draft" rows="1" :placeholder="copy.placeholder" @keydown.enter.exact.prevent="submitDraft" />
        <div class="home-composer-actions">
          <div class="home-composer-left">
            <button class="home-select-button" type="button" @click="startNote"><MessageSquare :size="16" /><span>{{ copy.noteMode }}</span><ChevronDown :size="13" /></button>
            <button class="home-select-button" type="button" @click="open('/settings')"><Globe2 :size="16" /><span>{{ copy.localAi }}</span><ChevronDown :size="13" /></button>
          </div>
          <div class="home-composer-right">
            <div class="home-reference-anchor" @click.stop>
              <button class="home-icon-button" type="button" :class="{ active: referenceMenuOpen }" :title="t('referenceFile')" @click="openReferenceMenu"><Paperclip :size="18" /></button>
              <div v-if="referenceMenuOpen" class="home-reference-menu">
                <template v-if="!referencePicker">
                  <div class="home-reference-menu-title">{{ t('referenceContent') }}</div>
                  <button class="home-reference-option" @click="openReferencePicker('note')"><FileText :size="16" /><span>{{ t('referenceNote') }}</span><ChevronRight :size="14" /></button>
                  <button class="home-reference-option" @click="openReferencePicker('file')"><File :size="16" /><span>{{ t('referenceFile') }}</span><ChevronRight :size="14" /></button>
                </template>

                <template v-else-if="referencePicker === 'note'">
                  <div class="home-reference-menu-header"><button type="button" @click="referencePicker = null"><ChevronLeft :size="15" /></button><strong>{{ t('referenceNote') }}</strong></div>
                  <div v-if="!noteCandidates.length" class="home-reference-empty">{{ t('referenceNoNotes') }}</div>
                  <button v-for="note in noteCandidates" :key="note.id" class="home-reference-option" @click="addNoteReference(note)"><FileText :size="15" /><span>{{ note.title || t('untitled') }}</span></button>
                </template>

                <template v-else>
                  <div class="home-reference-menu-header">
                    <button type="button" @click="referenceFileBaseId ? (library.path ? referenceBack() : (referenceFileBaseId = null)) : (referencePicker = null)"><ChevronLeft :size="15" /></button>
                    <strong>{{ referenceFileBaseId ? (library.active?.name || t('referenceFile')) : t('referenceFile') }}</strong>
                  </div>
                  <template v-if="!referenceFileBaseId">
                    <template v-if="personalBases.length">
                      <div class="home-reference-group-label">{{ t('personal') }}</div>
                      <button v-for="base in personalBases" :key="base.id" class="home-reference-option" @click="selectReferenceFileBase(base.id)"><BookOpen :size="14" /><span>{{ base.name }}</span><ChevronRight :size="13" /></button>
                    </template>
                    <template v-if="localBases.length">
                      <div class="home-reference-group-label">{{ t('local') }}</div>
                      <button v-for="base in localBases" :key="base.id" class="home-reference-option" @click="selectReferenceFileBase(base.id)"><BookOpen :size="14" /><span>{{ base.name }}</span><ChevronRight :size="13" /></button>
                    </template>
                    <div v-if="!library.bases.length" class="home-reference-empty">{{ t('noKnowledgeBases') }}</div>
                  </template>
                  <template v-else>
                    <div v-if="library.path" class="home-reference-path" :title="library.path">{{ library.path }}</div>
                    <div v-if="library.loading && !library.entries.length" class="home-reference-empty">{{ t('loading') }}</div>
                    <div v-else-if="!library.entries.length" class="home-reference-empty">{{ t('referenceNoFiles') }}</div>
                    <button v-for="entry in library.entries" :key="entry.relativePath" class="home-reference-option" @click="entry.kind === 'folder' ? openReferenceFolder(entry) : addFileReference(entry)"><Folder v-if="entry.kind === 'folder'" :size="15" /><File v-else :size="15" /><span>{{ entry.name }}</span><ChevronRight v-if="entry.kind === 'folder'" :size="13" /></button>
                  </template>
                </template>
              </div>
            </div>
            <button v-if="busy" class="home-send-button active" type="button" title="停止生成" @click="stopChat"><Square :size="16" /></button>
            <button v-else class="home-send-button" type="button" :class="{ active: draft.trim() }" :title="copy.start" @click="submitDraft"><Send :size="18" /></button>
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
