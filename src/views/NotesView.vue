<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ArrowDownAZ, BookOpen, ChevronRight, Copy, Download, FolderInput, FolderPlus, Pin, PinOff, Plus, RotateCcw, Search, Tags, Trash2 } from 'lucide-vue-next'
import { useNotesStore } from '../stores/notes'
import { useLibraryStore } from '../stores/library'
import { useTagsStore } from '../stores/tags'
import NoteEditor from '../components/NoteEditor.vue'
import NotebookTreeItem from '../components/NotebookTreeItem.vue'
import { requestPrompt } from '../services/promptDialog'
import { requestConfirmation, showToast } from '../services/appFeedback'

const store = useNotesStore()
const library = useLibraryStore()
const tagsStore = useTagsStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const showDeleted = ref(false)
const searchMode = ref(false)
const query = ref('')
const sidebarCollapsed = ref(false)
const sidebarWidth = ref(260)
const isResizing = ref(false)
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
const contextTagsOpen = ref(false)
const contextTagIds = ref(new Set())
const contextKnowledgeAnchorRef = ref(null)
const contextKnowledgeSubmenuRef = ref(null)
const contextKnowledgeStyle = ref({ left: '0px', top: '0px' })
let contextMoveTimer = null
let contextKnowledgeTimer = null
const expandedNotebookIds = ref(new Set())

const list = computed(() => showDeleted.value ? store.deleted : store.listed)
const contextNote = computed(() => contextMenu.value ? list.value.find(note => note.id === contextMenu.value.noteId) || store.notes.find(note => note.id === contextMenu.value.noteId) || store.deleted.find(note => note.id === contextMenu.value.noteId) : null)
const notebookTree = computed(() => {
  const notebookByParent = new Map()
  for (const notebook of store.notebooks) {
    const parentId = notebook.parentId || null
    if (!notebookByParent.has(parentId)) notebookByParent.set(parentId, [])
    notebookByParent.get(parentId).push(notebook)
  }
  for (const books of notebookByParent.values()) books.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
  const queryText = query.value.trim().toLocaleLowerCase()
  const noteMatches = note => (!store.pinnedOnly || note.pinned) && (!queryText || `${note.title} ${note.contentText}`.toLocaleLowerCase().includes(queryText))
  const build = (notebook, ancestors = new Set()) => {
    if (ancestors.has(notebook.id)) return null
    const nextAncestors = new Set(ancestors).add(notebook.id)
    const children = (notebookByParent.get(notebook.id) || []).map(child => build(child, nextAncestors)).filter(Boolean)
    const notes = store.listed.filter(note => note.notebookId === notebook.id && noteMatches(note)).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || String(b.updatedAt).localeCompare(String(a.updatedAt)))
    if (queryText && !notes.length && !children.length) return null
    return { ...notebook, children, notes, totalNoteCount: notes.length + children.reduce((sum, child) => sum + child.totalNoteCount, 0) }
  }
  return (notebookByParent.get(null) || []).map(book => build(book)).filter(Boolean)
})
const knowledgeGroups = computed(() => [
  { id: 'personal', label: t('personal'), items: library.bases.filter(base => base.category === 'personal') },
  { id: 'local', label: t('local'), items: library.bases.filter(base => base.category === 'local') }
].filter(group => group.items.length))

watch(query, value => {
  if (!value.trim()) return
  const expanded = new Set()
  const visit = nodes => nodes.forEach(node => { expanded.add(node.id); visit(node.children) })
  visit(notebookTree.value)
  expandedNotebookIds.value = expanded
})
watch(() => store.activeId, () => { tocVisible.value = false })
let creatingFromQuery = false
async function createFromQuery() {
  if (!route.query.new || creatingFromQuery) return
  creatingFromQuery = true
  try { await create(); await router.replace({ path: '/notes' }) } finally { creatingFromQuery = false }
}
onMounted(() => { createFromQuery(); store.loadTemplates(); tagsStore.load() })
watch(() => route.query.new, createFromQuery)
function openRoutedNote() {
  const id = String(route.query.note || '')
  const note = store.notes.find(item => item.id === id)
  if (!note) return
  showDeleted.value = false
  store.activeId = id
  store.selectedTreeNode = { type: 'note', id }
  const expanded = new Set(expandedNotebookIds.value)
  const visited = new Set()
  let notebook = store.notebooks.find(book => book.id === note.notebookId)
  while (notebook && !visited.has(notebook.id)) {
    visited.add(notebook.id)
    expanded.add(notebook.id)
    notebook = store.notebooks.find(book => book.id === notebook.parentId)
  }
  expandedNotebookIds.value = expanded
}
watch(() => [route.query.note, store.notes.length], openRoutedNote, { immediate: true })
function clearReviewedProposal() {
  if (!route.query.proposal) return
  const query = { ...route.query }
  delete query.proposal
  router.replace({ path: '/notes', query })
}

async function create() { showDeleted.value = false; await store.create() }
async function createFromTemplate(templateId) { showDeleted.value = false; newNoteMenu.value = false; await store.createFromTemplate(templateId) }
async function togglePinned(note) {
  if (!note) return
  await store.setPinned(note.id, !note.pinned)
  await store.load()
}
async function remove(id) { if (await requestConfirmation({ title: '移入最近删除', message: t('confirmDelete'), tone: 'danger', confirmLabel: '删除' })) await store.remove(id) }
async function importExternalNote(note) {
  try {
    const imported = await store.importExternal(note)
    showToast(`已将“${imported.title}”导入笔记`, { tone: 'success' })
  } catch (error) {
    showToast(error?.message || '导入笔记失败，请重试', { tone: 'error' })
  }
}
async function importFiles(event) {
  for (const file of event.target.files || []) await store.importText(file)
  event.target.value = ''
}
function toggleNewNoteMenu() { newNoteMenu.value = !newNoteMenu.value }
function closeMenus() {
  newNoteMenu.value = false
  folderItemMenu.value = null
  closeContextMenu()
}
function selectFolder(folder) {
  showDeleted.value = false
  store.selectedNotebook = folder.id
  store.selectedTreeNode = { type: 'notebook', id: folder.id }
  toggleNotebook(folder.id)
}
function selectAllNotes() {
  showDeleted.value = false
  store.selectedNotebook = 'all'
  store.selectedTreeNode = { type: 'all', id: 'all' }
}
function selectNote(note) {
  showDeleted.value = false
  store.activeId = note.id
  store.selectedTreeNode = { type: 'note', id: note.id }
}
function toggleNotebook(id) {
  const next = new Set(expandedNotebookIds.value)
  if (next.has(id)) next.delete(id); else next.add(id)
  expandedNotebookIds.value = next
}
async function createRootNotebook() {
  const name = await requestPrompt(t('newNotebook'))
  if (name?.trim()) await store.createNotebook(name.trim(), null)
}
function openFolderItemMenu(event, folder) {
  const rect = event.currentTarget.getBoundingClientRect()
  folderItemMenu.value = folder
  folderItemMenuStyle.value = { left: Math.min(rect.right + 4, window.innerWidth - 140) + 'px', top: rect.top + 'px' }
}
async function renameNotebook() {
  const folder = folderItemMenu.value
  if (!folder) return
  const name = await requestPrompt(t('rename'), folder.name)
  if (name?.trim() && name.trim() !== folder.name) await store.updateNotebook(folder.id, name.trim(), folder.parentId || null)
  folderItemMenu.value = null
}
async function deleteNotebook() {
  const folder = folderItemMenu.value
  const directNotes = store.listed.filter(note => note.notebookId === folder?.id).length
  const childNotebooks = store.notebooks.filter(book => book.parentId === folder?.id).length
  if (!folder || !(await requestConfirmation({ title: '删除笔记本', message: `“${folder.name}”包含 ${directNotes} 篇直属笔记和 ${childNotebooks} 个子笔记本。子笔记本将提升一级，直属笔记将移入“未分类”。`, tone: 'danger', confirmLabel: '删除' }))) return
  await store.deleteNotebook(folder.id)
  if (store.selectedNotebook === folder.id) store.selectedNotebook = 'all'
  folderItemMenu.value = null
}
async function createChildNotebook() {
  const folder = folderItemMenu.value
  const name = folder && await requestPrompt('新建子笔记本')
  if (name?.trim()) { await store.createNotebook(name.trim(), folder.id); expandedNotebookIds.value = new Set(expandedNotebookIds.value).add(folder.id) }
  folderItemMenu.value = null
}
async function moveNotebookByPrompt() {
  const folder = folderItemMenu.value
  if (!folder) return
  const targetName = await requestPrompt('移动到笔记本（留空移到根级）', '')
  if (targetName === null) return
  const target = targetName.trim() ? store.notebooks.find(book => book.id !== folder.id && book.name === targetName.trim()) : null
  if (targetName.trim() && !target) { showToast('没有找到该笔记本', { tone: 'error' }); return }
  await store.moveNotebook(folder.id, target?.id || null)
  folderItemMenu.value = null
}
async function dropTreeNode(payload, notebookId) {
  if (payload.kind === 'note') await store.move(payload.id, notebookId)
  if (payload.kind === 'notebook' && payload.id !== notebookId) await store.moveNotebook(payload.id, notebookId)
  expandedNotebookIds.value = new Set(expandedNotebookIds.value).add(notebookId)
}
function closeContextMenu() {
  contextMenu.value = null
  contextMoveOpen.value = false
  contextKnowledgeOpen.value = false
  contextTagsOpen.value = false
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
  contextTagsOpen.value = false
  contextTagIds.value = new Set((await tagsStore.noteTags(note.id).catch(() => []))?.map(tag => tag.id) || [])
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
async function toggleContextTag(tag) {
  const note = contextNote.value
  if (!note) return
  const selected = !contextTagIds.value.has(tag.id)
  await tagsStore.toggleForNote(note.id, tag.id, selected)
  const next = new Set(contextTagIds.value)
  if (selected) next.add(tag.id); else next.delete(tag.id)
  contextTagIds.value = next
}
async function createContextTag() {
  const name = await requestPrompt('新建标签')
  if (!name?.trim() || !contextNote.value) return
  const tag = await tagsStore.create(name.trim())
  await tagsStore.toggleForNote(contextNote.value.id, tag.id, true)
  contextTagIds.value = new Set(contextTagIds.value).add(tag.id)
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
    showToast(error?.message || '添加到知识库失败，请重试', { tone: 'error' })
  }
}
async function createKnowledgeBaseForContext() {
  const name = await requestPrompt(t('newKnowledge'))
  if (!name?.trim()) return
  try {
    await library.create(name.trim(), 'personal')
    if (library.activeId) await addContextNoteToKnowledge(library.activeId)
  } catch (error) {
    showToast(error?.message || '创建知识库失败，请重试', { tone: 'error' })
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
  const name = await requestPrompt(t('newNotebook'))
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
    if (await requestConfirmation({ title: '永久删除笔记', message: '删除后无法恢复，确定继续吗？', tone: 'danger', confirmLabel: '永久删除' })) await store.purge(note.id)
  } else if (await requestConfirmation({ title: '移入最近删除', message: t('confirmDelete'), tone: 'danger', confirmLabel: '删除' })) {
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
  const titleBlock = container.firstElementChild
  return Array.from(container.querySelectorAll('h1, h2, h3'))
    .filter(element => element !== titleBlock)
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
  const prose = editorContent.querySelector('.note-prose')
  const titleBlock = prose?.firstElementChild
  const headings = Array.from(prose?.querySelectorAll('h1, h2, h3') || []).filter(element => element !== titleBlock)
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
        <div class="sidebar-topbar notebook-tree-toolbar">
          <button class="topbar-btn" :title="t('noteSidebarCollapse')" @click="sidebarCollapsed = true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          </button>
          <div class="topbar-actions">
            <div class="new-note-btn-group">
              <button class="new-note-main-btn" :title="t('newNote')" @click="create"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></button>
              <button class="new-note-dropdown-btn" :title="t('noteSidebarMoreOptions')" @click.stop="toggleNewNoteMenu"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>
              <div v-if="newNoteMenu" class="new-note-dropdown-menu">
                <button class="dropdown-item" @click="create(); newNoteMenu = false"><Plus :size="14" />{{ t('newNote') }}</button>
                <button v-for="template in store.templates" :key="template.id" class="dropdown-item" @click="createFromTemplate(template.id)"><Plus :size="14" />{{ template.name }}</button>
                <button class="dropdown-item" @click="importInput?.click(); newNoteMenu = false"><Download :size="14" />{{ t('importFiles') }}</button>
              </div>
              <input ref="importInput" type="file" multiple hidden accept=".md,.markdown,.txt" @change="importFiles" />
            </div>
            <button class="topbar-btn" title="新建根笔记本" @click="createRootNotebook"><FolderPlus :size="17" /></button>
            <button class="topbar-btn" title="按名称排序"><ArrowDownAZ :size="17" /></button>
            <button class="topbar-btn" :class="{ active: store.pinnedOnly }" title="只看置顶笔记" @click="store.pinnedOnly = !store.pinnedOnly"><Pin :size="16" /></button>
            <button class="topbar-btn" :title="t('search')" @click="searchMode = !searchMode"><Search :size="17" /></button>
          </div>
        </div>
        <div v-if="searchMode" class="sidebar-search notebook-tree-search">
          <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input v-model="query" class="search-input" autofocus placeholder="搜索笔记" @keydown.escape="searchMode = false; query = ''" />
        </div>
        <div class="notebook-tree" role="tree" aria-label="笔记本和笔记">
          <button class="tree-row tree-all-row" :class="{ active: store.selectedTreeNode.type === 'all' && !showDeleted }" @click="selectAllNotes">
            <BookOpen :size="16" :stroke-width="1.9" /><span class="tree-label">{{ t('allNotes') }}</span><small>{{ store.listed.length }}</small>
          </button>
          <NotebookTreeItem
            v-for="node in notebookTree"
            :key="node.id"
            :node="node"
            :expanded="expandedNotebookIds"
            :selected="store.selectedTreeNode"
            @toggle="toggleNotebook"
            @select-notebook="selectFolder"
            @select-note="selectNote"
            @notebook-menu="openFolderItemMenu"
            @note-menu="openContextMenu"
            @drop-node="dropTreeNode"
          />
          <div v-if="!notebookTree.length" class="note-list-empty">{{ query ? '没有匹配的笔记' : t('emptyNotes') }}</div>
        </div>
        <div v-if="folderItemMenu" class="folder-item-menu notebook-context-menu" :style="folderItemMenuStyle" @click.stop>
          <button class="folder-item-menu-option" @click="createChildNotebook"><FolderPlus :size="13" />新建子笔记本</button>
          <button v-if="folderItemMenu.name !== '未分类'" class="folder-item-menu-option" @click="renameNotebook">重命名</button>
          <button v-if="folderItemMenu.name !== '未分类'" class="folder-item-menu-option" @click="moveNotebookByPrompt"><FolderInput :size="13" />移动</button>
          <button v-if="folderItemMenu.name !== '未分类'" class="folder-item-menu-option danger" @click="deleteNotebook"><Trash2 :size="12" />{{ t('delete') }}</button>
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
        <button class="has-submenu" @click="contextTagsOpen = !contextTagsOpen"><Tags :size="15" /><span>标签</span><ChevronRight class="context-arrow" :class="{ expanded: contextTagsOpen }" :size="14" /></button>
        <div v-if="contextTagsOpen" class="note-context-tag-list">
          <button class="note-context-create-item" @click="createContextTag"><Plus :size="13" />新建标签</button>
          <button v-for="tag in tagsStore.tags" :key="tag.id" @click="toggleContextTag(tag)"><span class="context-tag-check">{{ contextTagIds.has(tag.id) ? '✓' : '' }}</span>{{ tag.name }}</button>
          <span v-if="!tagsStore.tags.length" class="note-context-empty">暂无标签</span>
        </div>
        <button @click="duplicateContextNote"><Copy :size="15" /><span>复制</span></button>
        <button @click="togglePinned(contextNote); closeContextMenu()"><PinOff v-if="contextNote?.pinned" :size="15" /><Pin v-else :size="15" /><span>{{ contextNote?.pinned ? '取消置顶' : '置顶笔记' }}</span></button>
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
      <NoteEditor v-if="!showDeleted" :note="store.active" :toc-visible="tocVisible" :proposal-id="String(route.query.proposal || '')" @proposal-reviewed="clearReviewedProposal" @toggle-toc="toggleToc" @deleted="remove" @import-external="importExternalNote" />
      <div v-else-if="store.active" class="deleted-card"><h2>{{ store.active.title }}</h2><p>{{ store.active.contentText.slice(0, 300) }}</p><button class="secondary-button" @click="store.restore(store.active.id)">{{ t('restore') }}</button><button class="danger-button" @click="store.remove(store.active.id)">{{ t('delete') }}</button></div>
      <div v-else class="empty-state"><div class="empty-icon">⌁</div><h2>{{ t('recentlyDeleted') }}</h2></div>
    </section>
  </div>
</template>
