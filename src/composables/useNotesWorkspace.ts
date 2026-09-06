import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useNotesStore } from '../stores/notes'
import { useLibraryStore } from '../stores/library'
import { useTagsStore } from '../stores/tags'
import { requestPrompt } from '../services/promptDialog'
import { requestConfirmation, showToast } from '../services/appFeedback'
import { useWorkspaceSidebar } from '../utils/workspaceSidebar'
import { errorMessage, type ExternalMarkdownSource, type Note, type NoteSummary, type Notebook, type Tag } from '../types/domain'
import { noteSummary } from '../services/noteCache'
import { registerNoteEditorFlush } from '../services/noteEditorFlush'
import type { NotePageState } from '../services/notePage'
import { compareNotebooks } from '../utils/notebooks'

export function useNotesWorkspace() {
  interface NotebookTreeNode extends Notebook { children: NotebookTreeNode[]; notes: NoteSummary[]; page?: NotePageState; totalNoteCount: number }
  
  interface NoteContextMenu { noteId: string; x: number; y: number }
  
  interface TreeDropPayload { kind: 'note' | 'notebook'; id: string }
  
  interface NoteEditorExpose { saveLatestContent(): Promise<boolean> }
  
  const store = useNotesStore()
  
  const library = useLibraryStore()
  
  const tagsStore = useTagsStore()
  
  const route = useRoute()
  
  const router = useRouter()
  
  const { t } = useI18n()
  
  const showDeleted = ref(false)
  
  const searchMode = ref(false)
  
  const query = ref(store.search)
  const bodyLoading = ref(false)
  const bodyError = ref('')
  let selectionSequence = 0
  let retryNoteId = ''
  let mounted = false
  let disposed = false
  let unregisterEditorFlush = () => {}
  
  const sidebarCollapsed = ref(false)
  
  const { sidebarWidth, isResizing, onResizeStart } = useWorkspaceSidebar()
  
  const newNoteMenu = ref(false)
  
  const folderItemMenu = ref<Notebook | null>(null)
  
  const folderItemMenuStyle = ref({})
  
  const importInput = ref<HTMLInputElement | null>(null)
  
  const noteEditorRef = ref<NoteEditorExpose | null>(null)
  
  const tocVisible = ref(false)
  
  const contextMenu = ref<NoteContextMenu | null>(null)
  
  const contextMoveOpen = ref(false)
  
  const contextMenuRef = ref<HTMLElement | null>(null)
  
  const contextMoveAnchorRef = ref<HTMLElement | null>(null)
  
  const contextMoveSubmenuRef = ref<HTMLElement | null>(null)
  
  const contextMoveStyle = ref({ left: '0px', top: '0px' })
  
  const contextKnowledgeOpen = ref(false)
  
  const contextTagsOpen = ref(false)
  
  const contextTagIds = ref(new Set<string>())
  
  const contextKnowledgeAnchorRef = ref<HTMLElement | null>(null)
  
  const contextKnowledgeSubmenuRef = ref<HTMLElement | null>(null)
  
  const contextKnowledgeStyle = ref({ left: '0px', top: '0px' })
  
  let contextMoveTimer: number | null = null
  
  let contextKnowledgeTimer: number | null = null
  
  const expandedNotebookIds = ref(new Set<string>())
  
  const externalSourcesOpen = ref(false)
  
  const list = computed(() => showDeleted.value ? store.trashPage.items : store.listed)
  
  const contextNote = computed(() => {
    const menu = contextMenu.value
    return menu ? store.findMetadata(menu.noteId) || null : null
  })
  
  const notebookTree = computed(() => {
    const notebookByParent = new Map<string | null, Notebook[]>()
    for (const notebook of store.notebooks) {
      const parentId = notebook.parentId || null
      if (!notebookByParent.has(parentId)) notebookByParent.set(parentId, [])
      notebookByParent.get(parentId)!.push(notebook)
    }
    for (const books of notebookByParent.values()) books.sort(compareNotebooks)
    const queryText = query.value.trim().toLocaleLowerCase()
    const build = (notebook: Notebook, ancestors = new Set<string>()): NotebookTreeNode | null => {
      if (ancestors.has(notebook.id)) return null
      const nextAncestors = new Set(ancestors).add(notebook.id)
      const children = (notebookByParent.get(notebook.id) || []).map(child => build(child, nextAncestors)).filter((child): child is NotebookTreeNode => Boolean(child))
      const page = store.notebookPages[notebook.id]
      const notes = page?.items || []
      const totalNoteCount = (store.catalog.notebookCounts[notebook.id] || 0) + children.reduce((sum, child) => sum + child.totalNoteCount, 0)
      if ((queryText || store.pinnedOnly) && !totalNoteCount) return null
      return { ...notebook, children, notes, page, totalNoteCount }
    }
    return (notebookByParent.get(null) || []).map(book => build(book)).filter((book): book is NotebookTreeNode => Boolean(book))
  })
  
  const knowledgeGroups = computed(() => [
    { id: 'personal', label: t('personal'), items: library.bases.filter(base => base.category === 'personal') },
    { id: 'local', label: t('local'), items: library.bases.filter(base => base.category === 'local') }
  ].filter(group => group.items.length))
  
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  watch([query, () => store.pinnedOnly], () => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(async () => {
      store.search = query.value.trim()
      await store.loadCatalog()
      if (!mounted || !store.search) return
      const expanded = new Set<string>()
      const visit = (nodes: NotebookTreeNode[]) => nodes.forEach(node => { expanded.add(node.id); visit(node.children) })
      visit(notebookTree.value)
      expandedNotebookIds.value = expanded
      await Promise.all([...expanded].filter(id => !store.notebookPages[id]).map(id => store.loadNotebook(id)))
    }, 250)
  })

  watch(() => store.activeId, () => { tocVisible.value = false })
  
  let creatingFromQuery = false
  
  async function createFromQuery() {
    if (!route.query.new || creatingFromQuery) return
    creatingFromQuery = true
    try { await create(); await router.replace({ path: '/notes' }) } finally { creatingFromQuery = false }
  }
  
  onMounted(async () => {
    unregisterEditorFlush = registerNoteEditorFlush(flushCurrent)
    // The notes page can be the first route mounted. Load its own data instead
    // of relying on another tab (for example LibraryView) to hydrate the store.
    await store.load()
    if (disposed) return
    await Promise.all([store.loadTemplates(), tagsStore.load()])
    if (disposed) return
    mounted = true
    if (route.query.new) await createFromQuery()
    else if (route.query.note) await openRoutedNote()
    else if (store.active) await selectNote({ id: store.active.id })
    else if (store.listed[0]) await selectNote(store.listed[0])
  })
  
  watch(() => route.query.new, createFromQuery)
  
  async function openRoutedNote() {
    const id = String(route.query.note || '')
    if (id) await selectNote({ id })
  }

  async function revealNote(note: Note) {
    if (note.external) { externalSourcesOpen.value = true; return }
    const expanded = new Set(expandedNotebookIds.value)
    const visited = new Set<string>()
    let notebook = store.notebooks.find(book => book.id === note.notebookId)
    const loads: Promise<unknown>[] = []
    while (notebook && !visited.has(notebook.id)) {
      visited.add(notebook.id)
      expanded.add(notebook.id)
      if (!store.notebookPages[notebook.id]) loads.push(store.loadNotebook(notebook.id))
      const parentId = notebook.parentId
      notebook = store.notebooks.find(book => book.id === parentId)
    }
    expandedNotebookIds.value = expanded
    await Promise.all(loads)
    // A deep link can target a note beyond the first page. Keep it visible without
    // pretending it increased the server's count; later pages deduplicate by ID.
    const page = note.notebookId ? store.notebookPages[note.notebookId] : undefined
    if (page && !page.items.some(item => item.id === note.id) && !store.search && !store.pinnedOnly) page.items.unshift(noteSummary(note))
  }

  watch(() => route.query.note, () => { if (mounted) void openRoutedNote() })

  async function flushCurrent() {
    try { return !noteEditorRef.value || await noteEditorRef.value.saveLatestContent() }
    catch (error) { showToast(errorMessage(error, '当前笔记尚未保存'), { tone: 'error' }); return false }
  }

  function clearReviewedProposal() {
    if (!route.query.proposal) return
    const query = { ...route.query }
    delete query.proposal
    router.replace({ path: '/notes', query })
  }
  
  async function create() { if (!await flushCurrent()) return; selectionSequence++; bodyLoading.value = false; showDeleted.value = false; await revealNote(await store.create()) }
  
  async function createFromTemplate(templateId: string) { if (!await flushCurrent()) return; selectionSequence++; bodyLoading.value = false; showDeleted.value = false; newNoteMenu.value = false; await revealNote(await store.createFromTemplate(templateId)) }
  
  async function togglePinned(note: Note | NoteSummary | null) {
    if (!note) return
    if (!await flushCurrent()) return
    await store.setPinned(note.id, !note.pinned)
  }
  
  async function remove(id: string) {
    if (!await flushCurrent()) return
    if (showDeleted.value) {
      if (await requestConfirmation({ title: '永久删除笔记', message: '删除后无法恢复，确定继续吗？', tone: 'danger', confirmLabel: '永久删除' })) await store.purge(id)
    } else if (await requestConfirmation({ title: '移入最近删除', message: t('confirmDelete'), tone: 'danger', confirmLabel: '删除' })) await store.remove(id)
  }
  
  async function importExternalNote(note: Note) {
    try {
      if (!await flushCurrent()) return
      const imported = await store.importExternal(note)
      showDeleted.value = false
      store.selectedNotebook = imported.notebookId || 'all'
      store.selectedTreeNode = { type: 'note', id: imported.id }
      await router.replace({ path: '/notes', query: { note: imported.id } })
      store.activeId = imported.id
      showToast(`已将“${imported.title}”导入笔记`, { tone: 'success' })
    } catch (error) {
      showToast(errorMessage(error, '导入笔记失败，请重试'), { tone: 'error' })
    }
  }
  
  function toggleExternalSources() {
    showDeleted.value = false
    externalSourcesOpen.value = !externalSourcesOpen.value
    store.selectedTreeNode = { type: 'external', id: 'external' }
  }
  
  async function openExternalSource(source: ExternalMarkdownSource) {
    try {
      if (source.id !== store.activeId && !await flushCurrent()) return
      selectionSequence++
      bodyLoading.value = false
      const note = await store.openExternalSource(source)
      showDeleted.value = false
      externalSourcesOpen.value = true
      store.selectedTreeNode = { type: 'external-note', id: note.id }
      await router.replace({ path: '/notes', query: { note: note.id } })
      store.activeId = note.id
    } catch (error) {
      showToast(errorMessage(error, '外部文件无法打开'), { tone: 'error' })
    }
  }
  
  async function clearExternalSources() {
    if (!store.externalSources.length) return
    const confirmed = await requestConfirmation({
      title: '清空外部来源记录',
      message: '只会清除 Tiny Note 中的打开历史，不会删除磁盘上的源文件。',
      tone: 'danger',
      confirmLabel: '清空记录'
    })
    if (!confirmed) return
    if (store.active?.external) {
      try {
        if (!await noteEditorRef.value?.saveLatestContent()) return
      } catch (error) {
        showToast(errorMessage(error, '外部文件尚未保存，暂时不能清空记录'), { tone: 'error' })
        return
      }
    }
    await store.clearExternalSources()
    externalSourcesOpen.value = false
    store.selectedNotebook = 'all'
    store.selectedTreeNode = { type: 'all', id: 'all' }
    await router.replace({ path: '/notes' })
    showToast('已清空外部来源记录', { tone: 'success' })
  }
  
  async function importFiles(event: Event) {
    const input = event.target as HTMLInputElement
    if (!await flushCurrent()) return
    selectionSequence++
    for (const file of input.files || []) await store.importText(file)
    input.value = ''
  }
  
  function toggleNewNoteMenu() { newNoteMenu.value = !newNoteMenu.value }
  
  function closeMenus() {
    newNoteMenu.value = false
    folderItemMenu.value = null
    closeContextMenu()
  }
  
  function selectFolder(folder: Notebook) {
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
  
  async function selectNote(summary: Pick<NoteSummary, 'id'> & { version?: number }) {
    const sequence = ++selectionSequence
    bodyError.value = ''
    retryNoteId = summary.id
    if (!await flushCurrent() || sequence !== selectionSequence) { if (sequence === selectionSequence) bodyLoading.value = false; return }
    bodyLoading.value = true
    try {
      const note = await store.getNote(summary.id, summary.version)
      if (sequence !== selectionSequence) return
      store.activeId = note.id
      showDeleted.value = Boolean(note.deletedAt)
      store.selectedTreeNode = { type: note.external ? 'external-note' : 'note', id: note.id }
      if (!note.deletedAt) await revealNote(note)
    } catch (error) {
      if (sequence === selectionSequence) bodyError.value = errorMessage(error, '笔记读取失败，请重试')
    } finally { if (sequence === selectionSequence) bodyLoading.value = false }
  }

  function retryNote() { if (retryNoteId) void selectNote({ id: retryNoteId }) }

  async function toggleNotebook(id: string) {
    const next = new Set(expandedNotebookIds.value)
    if (next.has(id)) next.delete(id)
    else { next.add(id); if (!store.notebookPages[id]) void store.loadNotebook(id) }
    expandedNotebookIds.value = next
  }

  async function openTrash() {
    if (!await flushCurrent()) return
    selectionSequence++
    bodyLoading.value = false
    bodyError.value = ''
    store.activeId = null
    showDeleted.value = true
    await store.loadTrash()
  }

  async function createRootNotebook() {
    const name = await requestPrompt(t('newNotebook'))
    if (name?.trim()) await store.createNotebook(name.trim(), null)
  }
  
  function openFolderItemMenu(event: MouseEvent, folder: Notebook) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
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
    const directNotes = (folder ? store.catalog.notebookCounts[folder.id] || 0 : 0)
    const childNotebooks = store.notebooks.filter(book => book.parentId === folder?.id).length
    if (!folder || !(await requestConfirmation({ title: '删除笔记本', message: `“${folder.name}”包含 ${directNotes} 篇直属笔记和 ${childNotebooks} 个子笔记本。子笔记本将提升一级，直属笔记将移入“未分类”。`, tone: 'danger', confirmLabel: '删除' }))) return
    await store.deleteNotebook(folder.id)
    if (store.selectedNotebook === folder.id) store.selectedNotebook = 'all'
    folderItemMenu.value = null
  }
  
  async function createChildNotebook() {
    const folder = folderItemMenu.value
    if (!folder) return
    const name = await requestPrompt('新建子笔记本')
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
  
  async function dropTreeNode(payload: TreeDropPayload, notebookId: string) {
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
  
  async function openContextMenu(event: MouseEvent, note: Note | NoteSummary) {
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
  
  async function toggleContextTag(tag: Tag) {
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
    if (!await flushCurrent()) return
    if (contextNote.value) await revealNote(await store.duplicate(contextNote.value.id))
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
  
  async function addContextNoteToKnowledge(knowledgeBaseId: string) {
    const note = contextNote.value
    if (!note || !knowledgeBaseId) return
    try {
      if (!await flushCurrent()) return
      await store.moveToKnowledge(note.id, knowledgeBaseId)
      closeContextMenu()
    } catch (error) {
      showToast(errorMessage(error, '添加到知识库失败，请重试'), { tone: 'error' })
    }
  }
  
  async function createKnowledgeBaseForContext() {
    const name = await requestPrompt(t('newKnowledge'))
    if (!name?.trim()) return
    try {
      await library.create(name.trim(), 'personal')
      if (library.activeId) await addContextNoteToKnowledge(library.activeId)
    } catch (error) {
      showToast(errorMessage(error, '创建知识库失败，请重试'), { tone: 'error' })
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
  
  async function moveContextNote(notebookId: string | null) {
    if (!await flushCurrent()) return
    if (contextNote.value) await store.move(contextNote.value.id, notebookId)
    closeContextMenu()
  }
  
  async function deleteContextNote() {
    const note = contextNote.value
    if (!note || !await flushCurrent()) return
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
    tocVisible.value = !tocVisible.value
  }
  
  function closeToc() { tocVisible.value = false }
  
  function scrollToHeading(index: number) {
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
  
  onBeforeUnmount(() => {
    unregisterEditorFlush()
    mounted = false
    disposed = true
    selectionSequence++
    clearTimeout(searchTimer)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })

  return {
    bodyLoading, bodyError, retryNote, openTrash, store, library, tagsStore, route, router, t, showDeleted, searchMode,
    query, sidebarCollapsed, sidebarWidth, isResizing, onResizeStart, newNoteMenu, folderItemMenu, folderItemMenuStyle,
    importInput, noteEditorRef, tocVisible, contextMenu, contextMoveOpen, contextMenuRef, contextMoveAnchorRef, contextMoveSubmenuRef,
    contextMoveStyle, contextKnowledgeOpen, contextTagsOpen, contextTagIds, contextKnowledgeAnchorRef, contextKnowledgeSubmenuRef, contextKnowledgeStyle, contextMoveTimer,
    contextKnowledgeTimer, expandedNotebookIds, externalSourcesOpen, list, contextNote, notebookTree, knowledgeGroups, creatingFromQuery,
    createFromQuery, openRoutedNote, clearReviewedProposal, create, createFromTemplate, togglePinned, remove, importExternalNote,
    toggleExternalSources, openExternalSource, clearExternalSources, importFiles, toggleNewNoteMenu, closeMenus, selectFolder, selectAllNotes,
    selectNote, toggleNotebook, createRootNotebook, openFolderItemMenu, renameNotebook, deleteNotebook, createChildNotebook, moveNotebookByPrompt,
    dropTreeNode, closeContextMenu, openContextMenu, toggleContextTag, createContextTag, duplicateContextNote, showMoveSubmenu, hideMoveSubmenu,
    cancelHideMoveSubmenu, showKnowledgeSubmenu, hideKnowledgeSubmenu, cancelHideKnowledgeSubmenu, positionKnowledgeSubmenu, addContextNoteToKnowledge, createKnowledgeBaseForContext, positionMoveSubmenu,
    createNotebookForContext, moveContextNote, deleteContextNote, restoreContextNote, tocHeadings, toggleToc, closeToc, scrollToHeading
  }
}

export type NotesWorkspace = ReturnType<typeof useNotesWorkspace>
