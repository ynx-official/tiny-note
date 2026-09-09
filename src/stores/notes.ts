import { assertNoteBody, cacheNoteBody, cachedNote, noteHasUnsavedChanges, noteSummary, readNoteBody, trackPersistedNote, trimNoteCache } from '../services/noteCache'
import { createNotePageState, loadNotePage, type NotePageState } from '../services/notePage'
import { toRaw } from 'vue'
import { defineStore } from 'pinia'
import { invoke } from '../services/tauri'
import { saveExternalDocument } from '../services/externalDocument'
import { markdownToEditorHtml, sanitizeEditorHtml, textFromEditorHtml } from '../utils/noteMarkdown'
import { requestConfirmation, showToast } from '../services/appFeedback'
import { requireResourceVersion } from '../services/resourceVersion'
import { errorMessage, type ExternalMarkdownSource, type JsonValue, type Note, type NoteSummary, type Notebook, type NoteTemplate } from '../types/domain'

interface CreateNoteContent { title?: string; contentHtml?: string; contentText?: string; contentMarkdown?: string; notebookId?: string | null; knowledgeBaseId?: string | null; pinned?: boolean }
interface ExternalMarkdownInput { path: string; title: string; contentHtml: string; contentText: string; contentMarkdown: string }

interface NoteSaveContent {
  title: string
  notebookId: string | null
  knowledgeBaseId: string | null
  contentHtml: string
  contentText: string
  contentMarkdown: string
  pinned: boolean
}

const noteSaveQueues = new WeakMap<Note, Promise<Note>>()

function noteSaveContent(note: Note): NoteSaveContent {
  return {
    title: note.title,
    notebookId: note.notebookId,
    knowledgeBaseId: note.knowledgeBaseId || null,
    contentHtml: note.contentHtml,
    contentText: note.contentText,
    contentMarkdown: note.contentMarkdown || '',
    pinned: Boolean(note.pinned)
  }
}

function sameNoteSaveContent(left: NoteSaveContent, right: NoteSaveContent) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function mergeSavedNote(note: Note, updated: Note, sentContent: NoteSaveContent) {
  const latestContent = noteSaveContent(note)
  Object.assign(note, updated)
  if (!sameNoteSaveContent(latestContent, sentContent)) Object.assign(note, latestContent)
}

export const useNotesStore = defineStore('notes', {
  state: () => ({
    notes: [] as Note[],
    cacheScope: {},
    catalog: createNotePageState(),
    trashPage: createNotePageState(),
    notebookPages: {} as Record<string, NotePageState>,
    deleted: [] as Note[],
    externalSources: [] as ExternalMarkdownSource[],
    notebooks: [] as Notebook[],
    templates: [] as NoteTemplate[],
    activeId: null as string | null,
    search: '',
    pinnedOnly: false,
    selectedNotebook: 'all',
    selectedTreeNode: { type: 'all', id: 'all' },
    loading: false,
    loadError: '',
    saveTimer: null as ReturnType<typeof setTimeout> | null,
    saving: false,
    pendingSaveCount: 0
  }),
  getters: {
    active: state => [...state.notes, ...state.deleted].find(note => note.id === state.activeId) || null,
    listed: state => state.catalog.items,
    visible: state => state.selectedNotebook === 'all' ? state.catalog.items : state.notebookPages[state.selectedNotebook]?.items || state.catalog.items.filter(note => note.notebookId === state.selectedNotebook)
  },
  actions: {
    async load() {
      const scope = this.cacheScope
      this.loading = true
      this.loadError = ''
      try {
        const [notebooks, sources] = await Promise.all([invoke('notebook_list'), invoke('external_markdown_list'), this.loadCatalog(), invoke('note_purge_expired')])
        if (this.cacheScope !== scope) return
        this.notebooks = notebooks
        this.externalSources = sources
      } catch (error) { if (this.cacheScope === scope) this.loadError = errorMessage(error, '笔记目录读取失败') }
      finally { if (this.cacheScope === scope) this.loading = false }
    },
    async loadCatalog() {
      const filter = { search: this.search || undefined, pinned: this.pinnedOnly ? true : undefined }
      await Promise.all([
        loadNotePage(this.catalog, filter),
        ...Object.keys(this.notebookPages).map(id => loadNotePage(this.notebookPages[id]!, { ...filter, notebookId: id }))
      ])
    },
    async loadNotebook(id: string, append = false) {
      if (!this.notebookPages[id]) this.notebookPages[id] = createNotePageState()
      return loadNotePage(this.notebookPages[id]!, { search: this.search || undefined, pinned: this.pinnedOnly ? true : undefined, notebookId: id }, append)
    },
    async loadTrash(append = false) { return loadNotePage(this.trashPage, { deleted: true }, append) },
    findMetadata(id: string): Note | NoteSummary | undefined {
      return cachedNote(this, id) || this.catalog.items.find(note => note.id === id) || this.trashPage.items.find(note => note.id === id) || Object.values(this.notebookPages).flatMap(page => page.items).find(note => note.id === id)
    },
    async getNote(id: string, expectedVersion?: number) {
      const summaries = [this.catalog, this.trashPage, ...Object.values(this.notebookPages)].flatMap(page => page.items).filter(note => note.id === id)
      const version = expectedVersion ?? summaries.sort((a, b) => (b.version || 0) - (a.version || 0))[0]?.version
      return readNoteBody(this, id, version)
    },
    syncSummary(note: Note) {
      if (note.external) return
      const summary = noteSummary(note)
      for (const page of [this.catalog, this.trashPage, ...Object.values(this.notebookPages)]) {
        const index = page.items.findIndex(item => item.id === note.id)
        if (index >= 0) page.items[index] = summary
      }
    },
    acceptMetadata(updated: Note, fields: Partial<Note>) {
      const existing = cachedNote(this, updated.id)
      if (existing) {
        if (noteHasUnsavedChanges(existing)) Object.assign(existing, fields, { version: updated.version, updatedAt: updated.updatedAt })
        else Object.assign(existing, updated)
        trackPersistedNote(existing, updated)
      }
      this.syncSummary(updated)
      return existing || updated
    },
    async loadTemplates() {
      this.templates = await invoke('note_template_list') || []
      return this.templates
    },
    async create() {
      const active = this.notes.find(note => note.id === this.activeId)
      const notebookId = this.selectedTreeNode.type === 'notebook' ? this.selectedTreeNode.id : this.selectedTreeNode.type === 'note' ? active?.notebookId || null : null
      const note = await invoke('note_create', { input: { title: '未命名笔记', notebookId, knowledgeBaseId: null, contentHtml: '<p></p>', contentText: '', contentMarkdown: '', pinned: false } })
      cacheNoteBody(this, note)
      this.activeId = note.id
      await this.loadCatalog()
      this.selectedTreeNode = { type: 'note', id: note.id }
      return note
    },
    async createFromTemplate(templateId: string) {
      const template = this.templates.find(item => item.id === templateId) || (await this.loadTemplates()).find(item => item.id === templateId)
      if (!template) return this.create()
      const markdown = template.contentMarkdown || ''
      const html = sanitizeEditorHtml(markdownToEditorHtml(markdown))
      return this.createFromContent({ title: template.title || template.name, contentHtml: html, contentText: textFromEditorHtml(html), contentMarkdown: markdown })
    },
    async createFromContent({ title = '未命名笔记', contentHtml = '<p></p>', contentText = '', contentMarkdown = '', notebookId, knowledgeBaseId = null, pinned = false }: CreateNoteContent = {}) {
      const uncategorizedId = this.notebooks.find(book => book.name === '未分类')?.id || null
      const note = await invoke('note_create', { input: { title: title.trim() || '未命名笔记', notebookId: notebookId === undefined ? uncategorizedId : notebookId, knowledgeBaseId, contentHtml, contentText, contentMarkdown, pinned } })
      cacheNoteBody(this, note)
      this.activeId = note.id
      await this.loadCatalog()
      return note
    },
    async importText(file: File) {
      const text = await file.text()
      const title = file.name.replace(/\.[^.]+$/, '') || '导入笔记'
      const extension = file.name.split('.').pop()?.toLowerCase()
      const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br>')
      const isHtmlNote = extension === 'note' && /<\w[\s\S]*>/.test(text)
      const html = extension === 'md' || extension === 'markdown' ? sanitizeEditorHtml(markdownToEditorHtml(text)) : isHtmlNote ? sanitizeEditorHtml(text) : '<p>' + escaped + '</p>'
      const contentMarkdown = isHtmlNote ? '' : text
      const contentText = extension === 'md' || extension === 'markdown' || isHtmlNote ? textFromEditorHtml(html) : text
      return this.createFromContent({ title, contentHtml: html, contentText, contentMarkdown, notebookId: this.selectedNotebook === 'all' ? null : this.selectedNotebook })
    },
    async openExternalMarkdown(input: ExternalMarkdownInput) {
      const current = this.notes.find(note => note.external && note.externalPath === input.path)
      if (current && noteHasUnsavedChanges(current)) {
        const reload = await requestConfirmation({
          title: '重新读取源文件？',
          message: '当前编辑尚未保存。重新读取会丢弃这些编辑，并显示磁盘上的内容；需要保留时请先复制草稿。',
          confirmLabel: '丢弃编辑并重新读取', cancelLabel: '保留当前编辑', tone: 'warning'
        })
        if (!reload) { this.activeId = current.id; return current }
      }
      const note = { ...(await invoke('note_open_external_markdown', { input })), external: true, externalPath: input.path }
      const index = this.notes.findIndex(item => item.id === note.id)
      if (index >= 0) this.notes[index] = note
      else this.notes.unshift(note)
      this.activeId = note.id
      trackPersistedNote(note)
      trimNoteCache(this, note.id)
      await this.loadExternalSources()
      return note
    },
    async loadExternalSources() {
      this.externalSources = await invoke('external_markdown_list') || []
      return this.externalSources
    },
    async openExternalSource(source: ExternalMarkdownSource) {
      const file = await invoke('external_markdown_read', { id: source.id })
      if (file.error) throw new Error(file.error)
      if (file.changed === false && !window.__TAURI_INTERNALS__) {
        const cached = this.notes.find(note => note.id === source.id)
        if (!cached) throw new Error('外部来源缓存不存在')
        const note = { ...cached, external: true, externalPath: file.path }
        const index = this.notes.findIndex(item => item.id === note.id)
        if (index >= 0) this.notes[index] = note
        else this.notes.unshift(note)
        this.activeId = note.id
        return note
      }
      if (typeof file.content !== 'string') throw new Error('外部文件读取失败')
      const contentHtml = sanitizeEditorHtml(markdownToEditorHtml(file.content))
      return this.openExternalMarkdown({
        path: file.path,
        title: source.title || file.fileName.replace(/\.(?:md|markdown)$/i, '') || 'Markdown 文件',
        contentHtml,
        contentText: textFromEditorHtml(contentHtml),
        contentMarkdown: file.content
      })
    },
    async clearExternalSources() {
      await invoke('external_markdown_clear')
      const externalIds = new Set(this.notes.filter(note => note.external).map(note => note.id))
      this.notes = this.notes.filter(note => !note.external)
      this.externalSources = []
      if (this.activeId && externalIds.has(this.activeId)) this.activeId = this.notes.find(note => !note.deletedAt)?.id || null
    },
    async removeExternalSource(id: string) {
      await invoke('external_markdown_remove', { id })
      this.externalSources = this.externalSources.filter(source => source.id !== id)
      this.notes = this.notes.filter(note => note.id !== id)
      if (this.activeId === id) this.activeId = null
    },
    async importExternal(note: Note) {
      if (!note?.external) return note
      const imported = await this.createFromContent({
        title: note.title,
        contentHtml: note.contentHtml,
        contentText: note.contentText,
        contentMarkdown: note.contentMarkdown || '',
        pinned: false
      })
      this.selectedNotebook = imported.notebookId || 'all'
      this.selectedTreeNode = { type: 'note', id: imported.id }
      return imported
    },
    async save(note: Note) {
      assertNoteBody(note)
      const cacheKey = toRaw(note)
      const previous = noteSaveQueues.get(cacheKey) || Promise.resolve(note)
      const queued = previous.catch(() => note).then(async () => {
        const content = noteSaveContent(note)
        const updated = note.external && window.__TAURI_INTERNALS__
          ? await saveExternalDocument(note, content.contentMarkdown)
          : await invoke('note_update', { id: note.id, input: { ...content, version: requireResourceVersion(note, '笔记') } })
        if (updated) { mergeSavedNote(note, updated, content); trackPersistedNote(note, updated); this.syncSummary(note) }
        return note
      })

      noteSaveQueues.set(cacheKey, queued)
      this.pendingSaveCount += 1
      this.saving = true
      try {
        return await queued
      } finally {
        if (noteSaveQueues.get(cacheKey) === queued) noteSaveQueues.delete(cacheKey)
        this.pendingSaveCount = Math.max(0, this.pendingSaveCount - 1)
        this.saving = this.pendingSaveCount > 0
        trimNoteCache(this)
      }
    },
    scheduleSave(note: Note, onSaved?: () => void) {
      if (this.saveTimer) clearTimeout(this.saveTimer)
      this.saveTimer = setTimeout(async () => {
        this.saveTimer = null
        try {
          await this.save(note)
          onSaved?.()
        } catch (error) {
          const conflict = typeof error === 'object' && error !== null && 'code' in error && error.code === 'external_file_changed'
          showToast(conflict ? '源文件已被其他程序修改，本次内容未覆盖。请重新打开文件确认。' : errorMessage(error, '笔记保存失败'), { tone: 'error' })
        }
      }, 800)
    },
    async setPinned(id: string, pinned: boolean) {
      const note = this.findMetadata(id) || await this.getNote(id)
      const updated = await invoke('note_set_pinned', { id, pinned, version: requireResourceVersion(note, '笔记') })
      if (updated) this.acceptMetadata(updated, { pinned })
      await this.loadCatalog()
      return updated || note
    },
    async listLinks(id: string) {
      if (id.startsWith('external:') || this.notes.find(note => note.id === id)?.external) return []
      return invoke('note_link_list', { noteId: id })
    },
    async remove(id: string) {
      const note = this.findMetadata(id) || await this.getNote(id)
      await invoke('note_delete', { id, version: requireResourceVersion(note, '笔记') })
      this.notes = this.notes.filter(note => note.id !== id)
      if (this.activeId === id) this.activeId = null
      await Promise.all([this.loadCatalog(), this.loadTrash()])
    },
    async purge(id: string) {
      await invoke('note_purge', { id })
      this.notes = this.notes.filter(note => note.id !== id)
      this.deleted = this.deleted.filter(note => note.id !== id)
      if (this.activeId === id) this.activeId = null
      await this.loadTrash()
    },
    async restore(id: string) {
      const note = this.findMetadata(id) || await this.getNote(id)
      await invoke('note_restore', { id, version: requireResourceVersion(note, '笔记') })
      this.notes = this.notes.filter(note => note.id !== id)
      this.deleted = this.deleted.filter(note => note.id !== id)
      if (this.activeId === id) this.activeId = null
      await Promise.all([this.loadCatalog(), this.loadTrash()])
    },
    async rename(id: string, title: string) {
      if (!title?.trim()) return null
      const note = this.findMetadata(id) || await this.getNote(id)
      const updated = await invoke('note_update', { id, input: { title: title.trim(), version: requireResourceVersion(note, '笔记') } })
      if (updated) this.acceptMetadata(updated, { title: title.trim() })
      await this.loadCatalog()
      return updated
    },
    async duplicate(id: string) {
      const copy = await invoke('note_copy', { id })
      if (copy) {
        cacheNoteBody(this, copy)
        this.activeId = copy.id
        await this.loadCatalog()
      }
      return copy
    },
    async move(id: string, notebookId: string | null) {
      const note = this.findMetadata(id) || await this.getNote(id)
      const updated = await invoke('note_move', { id, notebookId: notebookId || null, version: requireResourceVersion(note, '笔记') })
      if (updated) this.acceptMetadata(updated, { notebookId: updated.notebookId })
      await this.loadCatalog()
      return updated || note
    },
    async moveToKnowledge(id: string, knowledgeBaseId: string | null) {
      const note = this.findMetadata(id) || await this.getNote(id)
      const updated = await invoke('note_move_to_knowledge_base', { id, knowledgeBaseId: knowledgeBaseId || null, version: requireResourceVersion(note, '笔记') })
      if (updated) this.acceptMetadata(updated, { knowledgeBaseId })
      await this.loadCatalog()
      return updated || note
    },
    async createNotebook(name: string, parentId: string | null = null) {
      const notebook = await invoke('notebook_create', { name, description: '', parentId })
      await this.load()
      return notebook
    },
    async updateNotebook(id: string, name: string, parentId: string | null = null) {
      const notebook = this.notebooks.find(item => item.id === id)
      await invoke('notebook_update', { id, name, description: '', parentId, version: requireResourceVersion(notebook, '笔记本') })
      await this.load()
    },
    async moveNotebook(id: string, parentId: string | null = null) {
      const notebook = this.notebooks.find(item => item.id === id)
      await invoke('notebook_move', { id, parentId, version: requireResourceVersion(notebook, '笔记本') })
      await this.load()
    },
    async deleteNotebook(id: string) {
      await invoke('notebook_delete', { id })
      await this.load()
    },
    async exportWorkspace() {
      return invoke('workspace_export')
    },
    async importWorkspace(backup: JsonValue) {
      await invoke('workspace_import', { request: { backup, replaceExisting: true } })
      this.$reset()
      await this.load()
    }
  }
})
