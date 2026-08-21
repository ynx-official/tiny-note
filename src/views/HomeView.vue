<script setup>
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, File, FileSearch2, FileText, Folder, Globe2, LibraryBig, MessageSquare, NotebookPen, Paperclip, PenLine, Send, Settings2, Sparkles, Wrench, X } from 'lucide-vue-next'
import { useNotesStore } from '../stores/notes'
import { useLibraryStore } from '../stores/library'
import { useAppStore } from '../stores/app'
import doubaoIcon from '../assets/providers/doubao.png'
import qwenIcon from '../assets/providers/qwen.png'
import zhipuIcon from '../assets/providers/zhipu.png'
import deepseekIcon from '../assets/providers/deepseek.png'
import kimiIcon from '../assets/providers/kimi.png'
import minimaxIcon from '../assets/providers/minimax.png'
import otherIcon from '../assets/providers/other.png'

const router = useRouter()
const { locale, t } = useI18n()
const notes = useNotesStore()
const library = useLibraryStore()
const appStore = useAppStore()
const { models } = storeToRefs(appStore)
const draft = ref('')
const referenceMenuOpen = ref(false)
const referencePicker = ref(null)
const referenceFileBaseId = ref(null)
const references = ref([])
const selectedModelId = ref('')
const thinkingMode = ref('fast')
const chatMode = ref('agent')
const modeMenuOpen = ref(false)
const modelMenuOpen = ref(false)
const personalBases = computed(() => library.bases.filter(item => item.category === 'personal'))
const localBases = computed(() => library.bases.filter(item => item.category === 'local'))
const noteCandidates = computed(() => notes.notes.filter(note => !note.deletedAt))
const selectedModel = computed(() => models.value.find(model => model.id === selectedModelId.value) || models.value.find(model => model.isDefault) || models.value[0] || null)
const providerIcons = { doubao: doubaoIcon, qwen: qwenIcon, zhipu: zhipuIcon, deepseek: deepseekIcon, kimi: kimiIcon, minimax: minimaxIcon, custom: otherIcon }
const providerAliases = { doubao: ['doubao', '豆包'], qwen: ['qwen', '千问', '通义'], zhipu: ['zhipu', '智谱'], deepseek: ['deepseek'], kimi: ['kimi', 'moonshot'], minimax: ['minimax'], custom: ['custom', '其他'] }
const modelButtonLabel = computed(() => {
  const mode = thinkingMode.value === 'deep' ? (locale.value === 'en' ? 'Deep' : '深度') : (locale.value === 'en' ? 'Quick' : '快速')
  return selectedModel.value ? `${selectedModel.value.name} · ${mode}` : (locale.value === 'en' ? `Local AI · ${mode}` : `本地 AI · ${mode}`)
})

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
  start: 'Start a chat'
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
  start: '开始对话'
})

function open(path) { router.push(path) }
function startNote() { router.push('/notes?new=1') }
function openChat(value = draft.value) {
  const message = (typeof value === 'string' ? value : draft.value).trim()
  sessionStorage.setItem('tiny-note-chat-pending', JSON.stringify({ message, references: references.value, modelProfileId: selectedModel.value?.id || null, thinkingMode: thinkingMode.value, mode: chatMode.value }))
  router.push({ path: '/chat', query: { from: 'home' } })
}
function closeReferenceMenu() {
  referenceMenuOpen.value = false
  referencePicker.value = null
  referenceFileBaseId.value = null
}
function closeMenus() {
  closeReferenceMenu()
  modeMenuOpen.value = false
  modelMenuOpen.value = false
}
function selectChatMode(mode) {
  chatMode.value = mode
  modeMenuOpen.value = false
}
function selectModel(model) {
  selectedModelId.value = model.id
  modelMenuOpen.value = false
}
function providerIcon(model) {
  const provider = String(model?.provider || '').toLowerCase()
  const key = Object.keys(providerAliases).find(item => providerAliases[item].some(alias => provider.includes(alias))) || 'custom'
  return providerIcons[key]
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
  await appStore.initialize()
  selectedModelId.value = models.value.find(model => model.isDefault)?.id || models.value[0]?.id || ''
  await Promise.allSettled([
    notes.notes.length ? Promise.resolve() : notes.load(),
    library.bases.length ? Promise.resolve() : library.load()
  ])
})
</script>

<template>
  <div class="home-page" @click="closeMenus">
    <div class="home-content">
      <section class="home-hero" aria-labelledby="home-title">
        <div class="home-wordmark" aria-label="Tiny Note">
          <div class="home-mark"><NotebookPen :size="66" :stroke-width="1.55" /></div>
          <h1 id="home-title">Tiny Note</h1>
        </div>
        <p class="home-subtitle">{{ copy.subtitle }}</p>
      </section>

      <section class="home-composer" aria-label="快速开始">
        <div v-if="references.length" class="home-reference-tags" aria-label="引用内容">
          <div v-for="reference in references" :key="reference.key" class="home-reference-tag" :class="`home-reference-tag-${reference.type}`">
            <FileText v-if="reference.type === 'note'" :size="14" />
            <File v-else :size="14" />
            <span class="home-reference-tag-name" :title="reference.name">{{ reference.name }}</span>
            <small v-if="reference.type === 'file' && reference.baseName">{{ reference.baseName }}</small>
            <button type="button" :title="t('removeReference')" @click.stop="removeReference(reference.key)"><X :size="13" /></button>
          </div>
        </div>
        <textarea v-model="draft" rows="1" :placeholder="copy.placeholder" @keydown.enter.exact.prevent="openChat" />
        <div class="home-composer-actions">
          <div class="home-composer-left">
            <div class="home-mode-anchor" @click.stop>
              <button class="home-select-button" type="button" :class="{ active: modeMenuOpen }" title="选择对话模式" @click="modeMenuOpen = !modeMenuOpen; modelMenuOpen = false; referenceMenuOpen = false"><Wrench v-if="chatMode === 'agent'" :size="16" /><MessageSquare v-else :size="16" /><span>{{ chatMode === 'agent' ? 'Agent 模式' : copy.noteMode }}</span><ChevronDown :size="13" :class="{ expanded: modeMenuOpen }" /></button>
              <div v-if="modeMenuOpen" class="home-mode-menu">
                <button type="button" class="home-mode-option" :class="{ active: chatMode === 'agent' }" @click="selectChatMode('agent')"><Wrench :size="15" /><span><b>Agent 模式</b><small>可自主调用工具完成任务</small></span><span v-if="chatMode === 'agent'" class="home-mode-check">✓</span></button>
                <button type="button" class="home-mode-option" :class="{ active: chatMode === 'chat' }" @click="selectChatMode('chat')"><MessageSquare :size="15" /><span><b>{{ copy.noteMode }}</b><small>进行普通对话</small></span><span v-if="chatMode === 'chat'" class="home-mode-check">✓</span></button>
              </div>
            </div>
            <div class="home-model-anchor" @click.stop>
              <button class="home-select-button" type="button" :class="{ active: modelMenuOpen }" @click="modelMenuOpen = !modelMenuOpen; modeMenuOpen = false; referenceMenuOpen = false"><Globe2 :size="16" /><span>{{ modelButtonLabel }}</span><ChevronDown :size="13" :class="{ expanded: modelMenuOpen }" /></button>
              <div v-if="modelMenuOpen" class="home-model-menu">
                <div class="home-thinking-row"><span><Sparkles :size="15" />思考模式</span><div class="home-thinking-tabs"><button type="button" :class="{ active: thinkingMode === 'fast' }" @click="thinkingMode = 'fast'"><span>快速</span></button><button type="button" :class="{ active: thinkingMode === 'deep' }" @click="thinkingMode = 'deep'"><span>深度</span></button></div></div>
                <div class="home-model-divider"></div>
                <button v-for="model in models" :key="model.id" type="button" class="home-model-option" :class="{ active: model.id === selectedModel?.id }" @click="selectModel(model)"><img :src="providerIcon(model)" :alt="model.provider" class="home-model-provider-icon" /><span><b>{{ model.name }}</b><small>{{ model.provider }} · {{ model.model }}</small></span><span v-if="model.id === selectedModel?.id" class="home-model-check">✓</span></button>
                <button v-if="!models.length" type="button" class="home-model-empty" @click="open('/settings'); modelMenuOpen = false">请先在设置中添加模型</button>
              </div>
            </div>
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
            <button class="home-send-button" type="button" :class="{ active: draft.trim() }" :title="copy.start" @click="openChat"><Send :size="18" /></button>
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
