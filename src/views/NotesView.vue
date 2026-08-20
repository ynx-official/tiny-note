<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useNotesStore } from '../stores/notes'
import NoteEditor from '../components/NoteEditor.vue'

const store = useNotesStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const showDeleted = ref(false)
const searchMode = ref(false)
const query = ref('')
const sidebarCollapsed = ref(false)
const notebookMenu = ref(false)
const importInput = ref(null)
const tocVisible = ref(false)

const list = computed(() => showDeleted.value ? store.deleted : store.visible)
const currentFolderName = computed(() => {
  if (showDeleted.value) return t('recentlyDeleted')
  if (store.selectedNotebook === 'all') return t('allNotes')
  return store.notebooks.find(book => book.id === store.selectedNotebook)?.name || t('allNotes')
})
const folders = computed(() => [
  { id: 'all', name: t('allNotes'), count: store.notes.length },
  ...store.notebooks.map(book => ({ id: book.id, name: book.name, count: store.notes.filter(note => note.notebookId === book.id).length }))
])

watch(query, async value => { store.search = value; await store.load() })
watch(() => store.activeId, () => { tocVisible.value = false })
let creatingFromQuery = false
async function createFromQuery() {
  if (!route.query.new || creatingFromQuery) return
  creatingFromQuery = true
  try { await create(); await router.replace({ path: '/notes' }) } finally { creatingFromQuery = false }
}
onMounted(createFromQuery)
watch(() => route.query.new, createFromQuery)

async function create() { showDeleted.value = false; await store.create() }
async function remove(id) { if (confirm(t('confirmDelete'))) await store.remove(id) }
async function importFiles(event) {
  for (const file of event.target.files || []) await store.importText(file)
  event.target.value = ''
}
function selectFolder(id) {
  showDeleted.value = false
  store.selectedNotebook = id
}
function selectNote(id) {
  showDeleted.value = false
  store.activeId = id
}
const tocHeadings = computed(() => {
  const html = store.active?.contentHtml || ''
  if (!html || typeof document === 'undefined') return []
  const container = document.createElement('div')
  container.innerHTML = html
  return Array.from(container.querySelectorAll('h1, h2, h3'))
    .map((element, index) => ({ level: Number(element.tagName.slice(1)), text: element.textContent?.trim() || '', index }))
    .filter(heading => heading.text)
})
function toggleToc() {
  if (sidebarCollapsed.value) {
    sidebarCollapsed.value = false
    window.setTimeout(() => { tocVisible.value = true }, 280)
    return
  }
  tocVisible.value = !tocVisible.value
}
function closeToc() { tocVisible.value = false }
function scrollToHeading(index) {
  const scrollContainer = document.querySelector('.note-editor-area')
  const editorContent = scrollContainer?.querySelector('.editor-content')
  if (!scrollContainer || !editorContent) return
  const headings = editorContent.querySelectorAll('h1, h2, h3')
  const target = headings[index]
  if (!target) return
  const containerRect = scrollContainer.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  scrollContainer.scrollTo({ top: targetRect.top - containerRect.top + scrollContainer.scrollTop - containerRect.height / 3, behavior: 'smooth' })
  closeToc()
}
</script>

<template>
  <div class="notes-layout note-page">
    <aside class="list-pane note-sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div class="sidebar-inner">
        <div v-if="!searchMode" class="sidebar-topbar">
          <button class="topbar-btn" :title="t('noteSidebarCollapse')" @click="sidebarCollapsed = true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          </button>
          <div class="topbar-actions">
            <div class="new-note-btn-group">
              <button class="new-note-main-btn" :title="t('newNote')" @click="create"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></button>
              <button class="new-note-dropdown-btn" :title="t('importFiles')" @click="importInput?.click()"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>
              <input ref="importInput" type="file" multiple hidden accept=".md,.markdown,.txt" @change="importFiles" />
            </div>
            <button class="topbar-btn" :title="t('search')" @click="searchMode = true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>
          </div>
        </div>
        <div v-else class="sidebar-search">
          <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input v-model="query" class="search-input" autofocus :placeholder="t('search')" @keydown.escape="searchMode = false" />
        </div>

        <div v-if="!searchMode" class="sidebar-header">
          <button class="folder-trigger" @click="notebookMenu = !notebookMenu">
            <span class="folder-name">{{ currentFolderName }}</span><svg class="folder-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div v-if="notebookMenu" class="folder-dropdown">
            <button v-for="folder in folders" :key="folder.id" class="folder-item" :class="{ active: folder.id === store.selectedNotebook }" @click="selectFolder(folder.id); notebookMenu = false">
              <span>{{ folder.name }}</span><small>{{ folder.count }}</small>
            </button>
            <button class="folder-item" :class="{ active: showDeleted }" @click="showDeleted = true; notebookMenu = false">{{ t('recentlyDeleted') }}<small>{{ store.deleted.length }}</small></button>
          </div>
        </div>

        <div class="note-items" @contextmenu.prevent>
          <button v-for="note in list" :key="note.id" class="note-item" :class="{ active: note.id === store.activeId }" @click="selectNote(note.id)">
            <span class="note-title">{{ note.title || t('untitled') }}</span>
            <span class="note-meta"><span>{{ new Date(note.updatedAt).toLocaleDateString() }}</span><span>{{ store.notebooks.find(book => book.id === note.notebookId)?.name || t('uncategorized') }}</span></span>
          </button>
          <div v-if="!list.length" class="note-list-empty">{{ t('emptyNotes') }}</div>
        </div>
      </div>
    </aside>

    <aside v-if="tocVisible && !showDeleted" class="toc-overlay" aria-label="目录">
      <div class="toc-header"><strong>目录</strong><button class="toc-close" title="关闭目录" aria-label="关闭目录" @click="closeToc">×</button></div>
      <div class="toc-list">
        <button v-for="heading in tocHeadings" :key="`${heading.index}-${heading.text}`" class="toc-item" :class="`toc-level-${heading.level}`" @click="scrollToHeading(heading.index)">
          <span class="toc-item-prefix">H{{ heading.level }}</span><span class="toc-item-text">{{ heading.text }}</span>
        </button>
        <div v-if="!tocHeadings.length" class="toc-empty"><div class="toc-empty-icon">☷</div><p>暂无标题</p><small>使用标题样式后会显示在这里</small></div>
      </div>
    </aside>

    <button v-if="sidebarCollapsed" class="sidebar-expand-btn" :title="t('noteSidebarExpand')" @click="sidebarCollapsed = false"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg></button>

    <section class="note-main note-editor-area">
      <NoteEditor v-if="!showDeleted" :note="store.active" :toc-visible="tocVisible" @toggle-toc="toggleToc" @deleted="remove" />
      <div v-else-if="store.active" class="deleted-card"><h2>{{ store.active.title }}</h2><p>{{ store.active.contentText.slice(0, 300) }}</p><button class="secondary-button" @click="store.restore(store.active.id)">{{ t('restore') }}</button><button class="danger-button" @click="store.remove(store.active.id)">{{ t('delete') }}</button></div>
      <div v-else class="empty-state"><div class="empty-icon">⌁</div><h2>{{ t('recentlyDeleted') }}</h2></div>
    </section>
  </div>
</template>
