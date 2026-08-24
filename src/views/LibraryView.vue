<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  Folder, File, FileText, Plus, Search, Grid2X2, List, Upload, Trash2, Eye, ChevronLeft,
  ChevronRight, SlidersHorizontal, PanelLeftClose, PanelLeftOpen, Pencil,
  FolderOpen, X, ArrowDownAZ, HardDrive, Clock3, Link2
} from 'lucide-vue-next'
import { useLibraryStore } from '../stores/library'
import { useNotesStore } from '../stores/notes'
import { requestPrompt } from '../services/promptDialog'

const store = useLibraryStore()
const notesStore = useNotesStore()
const router = useRouter()
const { t } = useI18n()
const creating = ref(false)
const name = ref('')
const category = ref('personal')
const view = ref('grid')
const query = ref('')
const sidebarCollapsed = ref(false)
const searchVisible = ref(false)
const sorting = ref(false)
const importing = ref(false)
const dropActive = ref(false)
const importInput = ref(null)
const entries = computed(() => store.entries)
const knowledgeNotes = computed(() => notesStore.notes.filter(note => note.knowledgeBaseId === store.activeId))
const personalBases = computed(() => store.bases.filter(base => base.category === 'personal'))
const localBases = computed(() => store.bases.filter(base => base.category === 'local'))

watch(query, async value => {
  store.search = value
  await store.loadEntries()
})
onMounted(() => Promise.all([store.load(), notesStore.load()]))

async function create() {
  if (name.value.trim()) {
    await store.create(name.value.trim(), category.value)
    name.value = ''
    creating.value = false
  }
}
async function folder() {
  const value = await requestPrompt(t('createFolder'))
  if (value?.trim()) await store.createFolder(value.trim())
}
async function importFiles(event) {
  await importList(Array.from(event.target.files || []))
  event.target.value = ''
}
async function importList(files) {
  if (!files.length || !store.activeId) return
  importing.value = true
  try {
    await store.importFiles(files)
  } catch (error) {
    window.alert(error?.message || '文件导入失败，请重试')
  } finally {
    importing.value = false
    dropActive.value = false
  }
}
async function importUrl() {
  if (!store.activeId) return
  const url = await requestPrompt('输入网页或文件 URL', '', { inputType: 'url', placeholder: 'https://example.com' })
  if (!url?.trim()) return
  try {
    await store.importUrl(url.trim())
  } catch (error) {
    window.alert(error?.message || '网页导入失败，请重试')
  }
}
async function handleDrop(event) {
  dropActive.value = false
  await importList(Array.from(event.dataTransfer?.files || []))
}
async function remove(entry) {
  if (window.confirm(t('confirmDelete'))) await store.remove(entry.relativePath)
}
async function rename(entry) {
  const next = await requestPrompt(t('rename'), entry.name)
  if (next?.trim() && next.trim() !== entry.name) await store.rename(entry.relativePath, next.trim())
}
async function renameBase(base) {
  const next = await requestPrompt(t('rename'), base.name)
  if (next?.trim() && next.trim() !== base.name) await store.updateBase(base, next.trim())
}
async function deleteBase(base) {
  if (window.confirm(`${t('confirmDelete')} ${base.name}`)) await store.deleteBase(base.id)
}
function openEntry(entry) {
  if (entry.kind === 'folder') store.navigate(entry.relativePath)
  else store.openPreview(entry.relativePath)
}
function selectBase(id) { store.selectBase(id) }
function openNote(note) { router.push({ path: '/notes', query: { note: note.id } }) }
</script>

<template>
  <div class="library-layout knowledge-page">
    <aside class="library-sidebar kb-sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div class="kb-sidebar-inner">
        <div class="kb-sidebar-topbar">
          <button class="topbar-btn" :title="t('noteSidebarCollapse')" @click="sidebarCollapsed = true"><PanelLeftClose :size="18" /></button>
          <button class="topbar-btn" :title="t('search')" @click="searchVisible = true"><Search :size="18" /></button>
        </div>
        <div v-if="creating" class="create-kb">
          <input v-model="name" autofocus :placeholder="t('newKnowledge')" @keyup.enter="create" />
          <select v-model="category"><option value="personal">{{ t('personal') }}</option><option value="local">{{ t('local') }}</option></select>
          <div><button class="secondary-button" @click="creating = false">{{ t('cancel') }}</button><button class="primary-button" @click="create">{{ t('confirm') }}</button></div>
        </div>
        <div class="kb-section">
          <div class="section-label"><span>{{ t('personal') }}</span><button class="kb-add-button" title="新建知识库" @click.stop="category = 'personal'; creating = true"><Plus :size="14" /></button></div>
          <div v-for="kb in personalBases" :key="kb.id" class="kb-item">
            <button :class="['kb-row', { active: kb.id === store.activeId }]" @click="selectBase(kb.id)"><svg class="kb-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg><span class="kb-row-name">{{ kb.name }}</span></button>
            <span class="kb-row-actions"><button title="重命名" @click.stop="renameBase(kb)"><Pencil :size="13" /></button><button title="移入回收站" @click.stop="deleteBase(kb)"><Trash2 :size="13" /></button></span>
          </div>
          <div class="section-label local-label"><span>{{ t('local') }}</span><button class="kb-add-button" title="新建知识库" @click.stop="category = 'local'; creating = true"><Plus :size="14" /></button></div>
          <div v-for="kb in localBases" :key="kb.id" class="kb-item">
            <button :class="['kb-row', { active: kb.id === store.activeId }]" @click="selectBase(kb.id)"><svg class="kb-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg><span class="kb-row-name">{{ kb.name }}</span></button>
            <span class="kb-row-actions"><button title="重命名" @click.stop="renameBase(kb)"><Pencil :size="13" /></button><button title="移入回收站" @click.stop="deleteBase(kb)"><Trash2 :size="13" /></button></span>
          </div>
        </div>
      </div>
    </aside>
    <button v-if="sidebarCollapsed" class="sidebar-expand-btn kb-expand" :title="t('noteSidebarExpand')" @click="sidebarCollapsed = false"><PanelLeftOpen :size="18" /></button>

    <section class="library-main kb-main" :class="{ 'is-drop-target': dropActive }" @dragover.prevent="dropActive = true" @dragleave.prevent="dropActive = false" @drop.prevent="handleDrop">
      <div class="library-toolbar main-header">
        <div class="header-left">
          <button class="nav-btn" title="后退" :disabled="!(store.pathHistory?.length)" @click="store.goBack"><ChevronLeft :size="19" /></button>
          <button class="nav-btn" title="前进" :disabled="!(store.forwardHistory?.length)" @click="store.goForward"><ChevronRight :size="19" /></button>
          <div class="breadcrumbs">
            <button @click="store.navigate('')">{{ store.active?.name || t('chooseKb') }}</button>
            <template v-for="crumb in store.breadcrumbs" :key="crumb.path"><ChevronRight :size="14" class="crumb-separator" /><button @click="store.navigate(crumb.path)">{{ crumb.name }}</button></template>
          </div>
        </div>
        <div class="toolbar-actions header-right">
          <label v-if="searchVisible" class="search-box compact"><Search :size="15" /><input v-model="query" autofocus :placeholder="t('search')" @keydown.esc="searchVisible = false" /></label>
          <button v-else class="icon-button" :title="t('search')" @click="searchVisible = true"><Search :size="18" /></button>
          <button class="icon-button" :title="view === 'grid' ? '列表' : '宫格'" @click="view = view === 'grid' ? 'list' : 'grid'"><Grid2X2 v-if="view === 'list'" :size="18" /><List v-else :size="18" /></button>
          <div class="sort-menu-anchor">
            <button class="icon-button" title="排序" :class="{ pressed: sorting }" @click="sorting = !sorting"><SlidersHorizontal :size="18" /></button>
            <div v-if="sorting" class="sort-menu">
              <button :class="{ selected: store.sortBy === 'name' }" @click="store.setSort('name'); sorting = false"><ArrowDownAZ :size="14" />名称 <small v-if="store.sortBy === 'name'">{{ store.sortDirection === 'asc' ? '升序' : '降序' }}</small></button>
              <button :class="{ selected: store.sortBy === 'size' }" @click="store.setSort('size'); sorting = false"><HardDrive :size="14" />大小 <small v-if="store.sortBy === 'size'">{{ store.sortDirection === 'asc' ? '升序' : '降序' }}</small></button>
              <button :class="{ selected: store.sortBy === 'modified' }" @click="store.setSort('modified'); sorting = false"><Clock3 :size="14" />修改时间 <small v-if="store.sortBy === 'modified'">{{ store.sortDirection === 'asc' ? '升序' : '降序' }}</small></button>
            </div>
          </div>
          <button class="icon-button" title="新建文件夹" @click="folder"><Plus :size="18" /></button>
          <button class="icon-button" :class="{ pressed: importing }" :disabled="importing" :title="t('importFiles')" @click="importInput?.click()"><Upload :size="18" /></button>
          <button class="icon-button" title="导入网页或 URL" @click="importUrl"><Link2 :size="17" /></button>
          <input ref="importInput" type="file" multiple hidden accept=".pdf,.epub,.md,.markdown,.html,.htm,.txt,.json,.xml,.note" @change="importFiles" />
        </div>
      </div>

      <div v-if="dropActive" class="drop-hint"><Upload :size="20" /><strong>松开以导入文件</strong><span>文件将保存到当前文件夹</span></div>
      <div v-if="!store.active" class="empty-state"><div class="empty-icon">⌂</div><h2>{{ t('chooseKb') }}</h2></div>
      <div v-else-if="store.loading && !entries.length" class="empty-state"><div class="empty-icon loading-dot">···</div><h2>正在读取文件</h2></div>
      <div v-else-if="!entries.length && !knowledgeNotes.length" class="empty-state"><div class="empty-icon">⌁</div><h2>{{ t('noFiles') }}</h2><p>点击右上角导入，或将文件拖到此处</p></div>
      <div v-else :class="['file-grid', view]">
        <article v-for="note in knowledgeNotes" :key="`note:${note.id}`" class="file-card note-file-card" tabindex="0" @dblclick="openNote(note)" @keydown.enter="openNote(note)">
          <div class="file-icon file"><FileText :size="23" /></div>
          <div class="file-info"><strong>{{ note.title || t('untitled') }}</strong><small>笔记 · {{ new Date(note.updatedAt).toLocaleDateString() }}</small></div>
          <div class="file-card-actions"><button class="file-action" title="打开笔记" @click.stop="openNote(note)"><Eye :size="14" /></button></div>
        </article>
        <article v-for="entry in entries" :key="entry.relativePath" class="file-card" tabindex="0" @dblclick="openEntry(entry)" @keydown.enter="openEntry(entry)">
          <div class="file-icon" :class="entry.kind"><FolderOpen v-if="entry.kind === 'folder'" :size="23" /><File v-else :size="23" /></div>
          <div class="file-info"><strong>{{ entry.name }}</strong><small>{{ entry.kind === 'folder' ? '文件夹' : `${Math.max(1, Math.round(entry.size / 1024))} KB` }}<span v-if="entry.kind === 'file'" class="file-index-status" :class="`is-${entry.indexStatus || 'pending'}`"> · {{ ({ indexed: '已索引', failed: '索引失败', unsupported: '不支持', pending: '待索引' })[entry.indexStatus || 'pending'] }}</span></small><em v-if="query && entry.relativePath !== entry.name">{{ entry.relativePath }}</em></div>
          <div class="file-card-actions"><button v-if="entry.kind === 'file'" class="file-menu" title="预览" @click.stop="store.openPreview(entry.relativePath)"><Eye :size="15" /></button><button class="file-action" title="重命名" @click.stop="rename(entry)"><Pencil :size="14" /></button><button class="file-trash" :title="t('trash')" @click.stop="remove(entry)"><Trash2 :size="14" /></button></div>
        </article>
      </div>
    </section>

    <div v-if="store.preview" class="preview-drawer">
      <div class="preview-head"><div><strong>{{ store.preview.title }}</strong><small>{{ store.preview.kind }}</small></div><button class="icon-button" title="关闭" @click="store.preview = null"><X :size="17" /></button></div>
      <img v-if="store.preview.kind === 'image'" :src="store.preview.content" :alt="store.preview.title" class="library-image-preview" />
      <div v-else-if="store.preview.kind === 'unsupported'" class="library-preview-unsupported">{{ store.preview.content }}</div>
      <pre v-else-if="store.preview.kind !== 'html'">{{ store.preview.content }}</pre>
      <iframe v-else sandbox="" :title="store.preview.title" :srcdoc="store.preview.content"></iframe>
    </div>
  </div>
</template>
