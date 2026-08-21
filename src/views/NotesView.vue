<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { BookOpen, ChevronRight, CirclePlus, Copy, Download, FolderInput, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-vue-next'
import { useNotesStore } from '../stores/notes'
import { useLibraryStore } from '../stores/library'
import NoteEditor from '../components/NoteEditor.vue'

const store = useNotesStore()
const library = useLibraryStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const showDeleted = ref(false)
const searchMode = ref(false)
const query = ref('')
const sidebarCollapsed = ref(false)
const sidebarWidth = ref(260)
const isResizing = ref(false)
const notebookMenu = ref(false)
const newNoteMenu = ref(false)
const folderItemMenu = ref(null)
const folderItemMenuStyle = ref({})
const importInput = ref(null)
const tocVisible = ref(false)
const contextMenu = ref(null)
const contextMoveOpen = ref(false)
const contextMenuRef = ref(null)
const contextMoveAnchorRef = ref(null)
const contextMoveSubmenuRef = ref(null)
const contextMoveStyle = ref({ left: '0px', top: '0px' })
const contextKnowledgeOpen = ref(false)
const contextKnowledgeAnchorRef = ref(null)
const contextKnowledgeSubmenuRef = ref(null)
const contextKnowledgeStyle = ref({ left: '0px', top: '0px' })
let contextMoveTimer = null
let contextKnowledgeTimer = null

const list = computed(() => showDeleted.value ? store.deleted : store.visible)
const contextNote = computed(() => contextMenu.value ? list.value.find(note => note.id === contextMenu.value.noteId) || store.notes.find(note => note.id === contextMenu.value.noteId) || store.deleted.find(note => note.id === contextMenu.value.noteId) : null)
const currentFolderName = computed(() => {
  if (showDeleted.value) return t('recentlyDeleted')
  if (store.selectedNotebook === 'all') return t('allNotes')
  return store.notebooks.find(book => book.id === store.selectedNotebook)?.name || t('allNotes')
})
const folders = computed(() => [
  { id: 'all', name: t('allNotes'), count: store.notes.length },
  ...store.notebooks.map(book => ({ id: book.id, name: book.name, count: store.notes.filter(note => note.notebookId === book.id).length }))
])
const knowledgeGroups = computed(() => [
  { id: 'personal', label: t('personal'), items: library.bases.filter(base => base.category === 'personal') },
  { id: 'local', label: t('local'), items: library.bases.filter(base => base.category === 'local') }
].filter(group => group.items.length))

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
function openRoutedNote() {
  const id = String(route.query.note || '')
  if (id && store.notes.some(note => note.id === id)) { showDeleted.value = false; store.activeId = id }
}
watch(() => [route.query.note, store.notes.length], openRoutedNote, { immediate: true })
function clearReviewedProposal() {
  if (!route.query.proposal) return
  const query = { ...route.query }
  delete query.proposal
  router.replace({ path: '/notes', query })
}

async function create() { showDeleted.value = false; await store.create() }
async function remove(id) { if (confirm(t('confirmDelete'))) await store.remove(id) }
async function importFiles(event) {
  for (const file of event.target.files || []) await store.importText(file)
  event.target.value = ''
}
function toggleNewNoteMenu() { newNoteMenu.value = !newNoteMenu.value }
function closeMenus() {
  notebookMenu.value = false
  newNoteMenu.value = false
  folderItemMenu.value = null
  closeContextMenu()
}
function selectFolder(id) {
  showDeleted.value = false
  store.selectedNotebook = id
}
function selectNote(id) {
  showDeleted.value = false
  store.activeId = id
}
function openFolderItemMenu(event, folder) {
  const rect = event.currentTarget.getBoundingClientRect()
  folderItemMenu.value = folder
  folderItemMenuStyle.value = { left: Math.min(rect.right + 4, window.innerWidth - 140) + 'px', top: rect.top + 'px' }
}
async function renameNotebook() {
  const folder = folderItemMenu.value
  if (!folder) return
  const name = window.prompt(t('rename'), folder.name)
  if (name?.trim() && name.trim() !== folder.name) await store.updateNotebook(folder.id, name.trim())
  folderItemMenu.value = null
}
async function deleteNotebook() {
  const folder = folderItemMenu.value
  if (!folder || !window.confirm(t('confirmDelete') + ' ' + folder.name)) return
  await store.deleteNotebook(folder.id)
  if (store.selectedNotebook === folder.id) store.selectedNotebook = 'all'
  folderItemMenu.value = null
}
function closeContextMenu() {
  contextMenu.value = null
  contextMoveOpen.value = false
  contextKnowledgeOpen.value = false
  if (contextMoveTimer) window.clearTimeout(contextMoveTimer)
  if (contextKnowledgeTimer) window.clearTimeout(contextKnowledgeTimer)
  contextMoveTimer = null
  contextKnowledgeTimer = null
}
async function openContextMenu(event, note) {
  const menuWidth = 180
  const menuHeight = showDeleted.value ? 108 : 180
  contextMoveOpen.value = false
  contextKnowledgeOpen.value = false
  contextMenu.value = {
    noteId: note.id,
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))
  }
  await nextTick()
  const menu = contextMenuRef.value
  if (!menu) return
  const rect = menu.getBoundingClientRect()
  const x = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8))
  const y = Math.max(8, Math.min(rect.top, window.innerHeight - rect.height - 8))
  contextMenu.value = { ...contextMenu.value, x, y }
}
async function duplicateContextNote() {
  if (contextNote.value) await store.duplicate(contextNote.value.id)
  closeContextMenu()
}
async function showMoveSubmenu() {
  if (contextMoveTimer) window.clearTimeout(contextMoveTimer)
  contextMoveOpen.value = true
  await nextTick()
  positionMoveSubmenu()
}
function hideMoveSubmenu() {
  contextMoveTimer = window.setTimeout(() => { contextMoveOpen.value = false }, 180)
}
function cancelHideMoveSubmenu() {
  if (contextMoveTimer) window.clearTimeout(contextMoveTimer)
  contextMoveTimer = null
}
async function showKnowledgeSubmenu() {
  if (contextKnowledgeTimer) window.clearTimeout(contextKnowledgeTimer)
  contextKnowledgeOpen.value = true
  await nextTick()
  positionKnowledgeSubmenu()
}
function hideKnowledgeSubmenu() {
  contextKnowledgeTimer = window.setTimeout(() => { contextKnowledgeOpen.value = false }, 180)
}
function cancelHideKnowledgeSubmenu() {
  if (contextKnowledgeTimer) window.clearTimeout(contextKnowledgeTimer)
  contextKnowledgeTimer = null
}
function positionKnowledgeSubmenu() {
  const anchor = contextKnowledgeAnchorRef.value
  const submenu = contextKnowledgeSubmenuRef.value
  if (!anchor || !submenu) return
  const itemRect = anchor.getBoundingClientRect()
  const submenuRect = submenu.getBoundingClientRect()
  const gap = 6
  const opensRight = itemRect.right + gap + submenuRect.width <= window.innerWidth - 8
  const left = opensRight ? itemRect.right + gap : Math.max(8, itemRect.left - submenuRect.width - gap)
  const top = itemRect.top + submenuRect.height <= window.innerHeight - 8 ? itemRect.top : Math.max(8, itemRect.bottom - submenuRect.height)
  contextKnowledgeStyle.value = { left: left + 'px', top: top + 'px' }
}
async function addContextNoteToKnowledge(knowledgeBaseId) {
  const note = contextNote.value
  if (!note || !knowledgeBaseId) return
  try {
    await library.addNoteReference(knowledgeBaseId, note)
    closeContextMenu()
  } catch (error) {
    window.alert(error?.message || '添加到知识库失败，请重试')
  }
}
async function createKnowledgeBaseForContext() {
  const name = window.prompt(t('newKnowledge'))
  if (!name?.trim()) return
  try {
    await library.create(name.trim(), 'personal')
    if (library.activeId) await addContextNoteToKnowledge(library.activeId)
  } catch (error) {
    window.alert(error?.message || '创建知识库失败，请重试')
  }
}
function positionMoveSubmenu() {
  const anchor = contextMoveAnchorRef.value
  const submenu = contextMoveSubmenuRef.value
  if (!anchor || !submenu) return
  const itemRect = anchor.getBoundingClientRect()
  const submenuRect = submenu.getBoundingClientRect()
  const gap = 6
  const opensRight = itemRect.right + gap + submenuRect.width <= window.innerWidth - 8
  const left = opensRight
    ? itemRect.right + gap
    : Math.max(8, itemRect.left - submenuRect.width - gap)
  const top = itemRect.top + submenuRect.height <= window.innerHeight - 8
    ? itemRect.top
    : Math.max(8, itemRect.bottom - submenuRect.height)
  contextMoveStyle.value = { left: left + 'px', top: top + 'px' }
}
async function createNotebookForContext() {
  const name = window.prompt(t('newNotebook'))
  if (name?.trim()) {
    await store.createNotebook(name.trim())
    contextMoveOpen.value = false
    closeContextMenu()
  }
}
async function moveContextNote(notebookId) {
  if (contextNote.value) await store.move(contextNote.value.id, notebookId)
  closeContextMenu()
}
async function deleteContextNote() {
  const note = contextNote.value
  if (!note) return
  if (showDeleted.value) {
    if (window.confirm(t('confirmDelete'))) await store.purge(note.id)
  } else if (window.confirm(t('confirmDelete'))) {
    await store.remove(note.id)
  }
  closeContextMenu()
}
async function restoreContextNote() {
  if (contextNote.value) await store.restore(contextNote.value.id)
  closeContextMenu()
}
const tocHeadings = computed(() => {
  const html = store.active?.contentHtml || ''
  if (!html || typeof document === 'undefined') return []
  const container = document.createElement('div')
  container.innerHTML = html
  return Array.from(container.querySelectorAll('h1:not([data-note-title]), h2, h3'))
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
  const editorPanel = document.querySelector('.note-editor-area .note-editor-shell > .editor-panel')
  const previewPane = editorPanel?.querySelector('.split-preview-pane')
  const renderPane = editorPanel?.querySelector('.editor-render-pane')
  const activeScroller = previewPane || renderPane || editorPanel
  const editorContent = activeScroller?.querySelector('.editor-content')
  if (!activeScroller || !editorContent) return
  const headings = editorContent.querySelectorAll('h1:not([data-note-title]), h2, h3')
  const target = headings[index]
  if (!target) return
  const containerRect = activeScroller.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const nextTop = targetRect.top - containerRect.top + activeScroller.scrollTop - activeScroller.clientHeight / 3
  activeScroller.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })
}
function onResizeStart(event) {
  event.preventDefault()
  isResizing.value = true
  const startX = event.clientX
  const startWidth = sidebarWidth.value
  const onMove = moveEvent => { sidebarWidth.value = Math.min(280, Math.max(200, startWidth + moveEvent.clientX - startX)) }
  const onEnd = () => {
    isResizing.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onEnd)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onEnd)
}
onBeforeUnmount(() => {
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
})
</script>

<template>
  <div class="notes-layout note-page" @click="closeMenus" @contextmenu.prevent="closeMenus" @keydown.esc="closeMenus">
    <aside class="list-pane note-sidebar" :class="{ collapsed: sidebarCollapsed, 'is-resizing': isResizing }" :style="{ width: sidebarCollapsed ? '0px' : sidebarWidth + 'px' }" @selectstart.prevent>
      <div class="sidebar-inner">
        <div v-if="!searchMode" class="sidebar-topbar">
          <button class="topbar-btn" :title="t('noteSidebarCollapse')" @click="sidebarCollapsed = true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          </button>
          <div class="topbar-actions">
            <div class="new-note-btn-group">
              <button class="new-note-main-btn" :title="t('newNote')" @click="create"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></button>
              <button class="new-note-dropdown-btn" :title="t('noteSidebarMoreOptions')" @click.stop="toggleNewNoteMenu"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>
              <div v-if="newNoteMenu" class="new-note-dropdown-menu">
                <button class="dropdown-item" @click="create(); newNoteMenu = false"><Plus :size="14" />{{ t('newNote') }}</button>
                <button class="dropdown-item" @click="importInput?.click(); newNoteMenu = false"><Download :size="14" />{{ t('importFiles') }}</button>
              </div>
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
          <button class="folder-trigger" @click.stop="notebookMenu = !notebookMenu">
            <span class="folder-name">{{ currentFolderName }}</span><svg class="folder-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div v-if="notebookMenu" class="folder-dropdown" @click.stop>
            <button v-for="folder in folders" :key="folder.id" class="folder-item" :class="{ active: folder.id === store.selectedNotebook }" @click="selectFolder(folder.id); notebookMenu = false">
              <span class="folder-info"><span class="folder-item-name">{{ folder.name }}</span><small>{{ folder.count }}</small></span>
              <span v-if="folder.id !== 'all'" class="folder-more-btn" @click.stop="openFolderItemMenu($event, folder)">⋮</span>
            </button>
            <button class="folder-item" :class="{ active: showDeleted }" @click="showDeleted = true; notebookMenu = false">{{ t('recentlyDeleted') }}<small>{{ store.deleted.length }}</small></button>
          </div>
          <div v-if="folderItemMenu" class="folder-item-menu" :style="folderItemMenuStyle" @click.stop>
            <button class="folder-item-menu-option" @click="renameNotebook"><Pencil :size="12" />{{ t('rename') }}</button>
            <button class="folder-item-menu-option danger" @click="deleteNotebook"><Trash2 :size="12" />{{ t('delete') }}</button>
          </div>
        </div>

        <div class="note-items">
          <button v-for="note in list" :key="note.id" class="note-item" :class="{ active: note.id === store.activeId }" @click="selectNote(note.id)" @contextmenu.prevent.stop="openContextMenu($event, note)">
            <span class="note-title">{{ note.title || t('untitled') }}</span>
            <span class="note-meta"><span>{{ new Date(note.updatedAt).toLocaleDateString() }}</span><span>{{ store.notebooks.find(book => book.id === note.notebookId)?.name || t('uncategorized') }}</span></span>
          </button>
          <div v-if="!list.length" class="note-list-empty">{{ t('emptyNotes') }}</div>
        </div>
      </div>
    </aside>
    <div v-if="!sidebarCollapsed" class="sidebar-resize-handle" @mousedown="onResizeStart"></div>

    <div v-if="contextMenu && contextNote" ref="contextMenuRef" class="note-context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }" @click.stop @contextmenu.prevent.stop>
      <template v-if="!showDeleted">
        <div ref="contextKnowledgeAnchorRef" class="note-context-submenu-anchor" @mouseenter="showKnowledgeSubmenu" @mouseleave="hideKnowledgeSubmenu">
          <button class="has-submenu"><BookOpen :size="15" /><span>{{ t('addToKnowledge') }}</span><ChevronRight class="context-arrow" :size="14" /></button>
        </div>
        <div ref="contextMoveAnchorRef" class="note-context-submenu-anchor" @mouseenter="showMoveSubmenu" @mouseleave="hideMoveSubmenu">
          <button class="has-submenu"><FolderInput :size="15" /><span>移动到笔记本</span><ChevronRight class="context-arrow" :size="14" /></button>
        </div>
        <button @click="duplicateContextNote"><Copy :size="15" /><span>复制</span></button>
        <div class="note-context-divider"></div>
        <button class="danger" @click="deleteContextNote"><Trash2 :size="15" /><span>删除</span></button>
      </template>
      <template v-else>
        <button @click="restoreContextNote"><RotateCcw :size="15" /><span>{{ t('restore') }}</span></button>
        <button class="danger" @click="deleteContextNote"><Trash2 :size="15" /><span>{{ t('permanentlyDelete') }}</span></button>
      </template>
    </div>

    <Teleport to="body">
      <div v-if="contextKnowledgeOpen && contextMenu && contextNote" ref="contextKnowledgeSubmenuRef" class="note-context-submenu note-knowledge-submenu" :style="contextKnowledgeStyle" @mouseenter="cancelHideKnowledgeSubmenu" @mouseleave="hideKnowledgeSubmenu" @click.stop @contextmenu.prevent.stop>
        <button class="note-context-create-item" @click="createKnowledgeBaseForContext"><Plus :size="14" />{{ t('newKnowledge') }}</button>
        <div class="note-context-divider"></div>
        <template v-if="knowledgeGroups.length">
          <template v-for="group in knowledgeGroups" :key="group.id">
            <div class="note-context-group-label">{{ group.label }}</div>
            <button v-for="base in group.items" :key="base.id" @click="addContextNoteToKnowledge(base.id)"><BookOpen :size="14" />{{ base.name }}</button>
          </template>
        </template>
        <span v-else class="note-context-empty">{{ t('noKnowledgeBases') }}</span>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="contextMoveOpen && contextMenu && contextNote" ref="contextMoveSubmenuRef" class="note-context-submenu" :style="contextMoveStyle" @mouseenter="cancelHideMoveSubmenu" @mouseleave="hideMoveSubmenu" @click.stop @contextmenu.prevent.stop>
        <button @click="createNotebookForContext"><Plus :size="14" />{{ t('newNotebook') }}</button>
        <div class="note-context-divider"></div>
        <button v-for="notebook in store.notebooks" :key="notebook.id" :class="{ selected: contextNote.notebookId === notebook.id }" @click="moveContextNote(notebook.id)"><FolderInput :size="14" />{{ notebook.name }}</button>
        <span v-if="!store.notebooks.length" class="note-context-empty">没有笔记本</span>
      </div>
    </Teleport>

    <aside v-if="tocVisible && !showDeleted" class="toc-overlay" :style="{ width: sidebarWidth + 'px' }" aria-label="目录">
      <div class="toc-header"><strong>目录</strong><button class="toc-close" title="关闭目录" aria-label="关闭目录" @click="closeToc">×</button></div>
      <div class="toc-list">
        <button v-for="heading in tocHeadings" :key="`${heading.index}-${heading.text}`" class="toc-item" :class="`toc-level-${heading.level}`" @click="scrollToHeading(heading.index)">
          <span class="toc-item-prefix">H{{ heading.level }}</span><span class="toc-item-text">{{ heading.text }}</span>
        </button>
        <div v-if="!tocHeadings.length" class="toc-empty"><div class="toc-empty-icon">☷</div><p>暂无标题</p><small>使用标题样式后会显示在这里</small></div>
      </div>
    </aside>

    <button v-if="sidebarCollapsed" class="sidebar-expand-btn" :title="t('noteSidebarExpand')" @click="sidebarCollapsed = false"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg></button>

    <section class="note-main note-editor-area" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
      <NoteEditor v-if="!showDeleted" :note="store.active" :toc-visible="tocVisible" :proposal-id="String(route.query.proposal || '')" @proposal-reviewed="clearReviewedProposal" @toggle-toc="toggleToc" @deleted="remove" />
      <div v-else-if="store.active" class="deleted-card"><h2>{{ store.active.title }}</h2><p>{{ store.active.contentText.slice(0, 300) }}</p><button class="secondary-button" @click="store.restore(store.active.id)">{{ t('restore') }}</button><button class="danger-button" @click="store.remove(store.active.id)">{{ t('delete') }}</button></div>
      <div v-else class="empty-state"><div class="empty-icon">⌁</div><h2>{{ t('recentlyDeleted') }}</h2></div>
    </section>
  </div>
</template>
