import { defineStore } from 'pinia'
import { invoke } from '../services/tauri'
import { markdownToEditorHtml, sanitizeEditorHtml, textFromEditorHtml } from '../utils/noteMarkdown'
import { showToast } from '../services/appFeedback'
import { requireResourceVersion } from '../services/resourceVersion'
import { errorMessage, type ExternalMarkdownSource, type JsonValue, type Note, type Notebook, type NoteTemplate } from '../types/domain'

interface CreateNoteContent { title?: string; contentHtml?: string; contentText?: string; contentMarkdown?: string; notebookId?: string | null; knowledgeBaseId?: string | null; pinned?: boolean }
interface ExternalMarkdownInput { path: string; title: string; contentHtml: string; contentText: string; contentMarkdown: string }

export const useNotesStore = defineStore('notes', {
  state: () => ({
    notes: [] as Note[],
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
    saveTimer: null as ReturnType<typeof setTimeout> | null,
    saving: false
  }),
  getters: {
    active: state => state.notes.find(note => note.id === state.activeId) || null,
    listed: state => state.notes.filter(note => !note.external),
    visible: state => state.notes.filter(note => !note.external && (state.selectedNotebook === 'all' || note.notebookId === state.selectedNotebook))
  },
  actions: {
    async load() {
      this.loading = true
      try {
        await invoke('note_purge_expired')
        const filters = { search: this.search || null, deleted: false, pinned: this.pinnedOnly ? true : null }
        ;[this.notes, this.deleted, this.notebooks, this.externalSources] = await Promise.all([
          invoke('note_list', filters),
          invoke('note_list', { search: '', deleted: true }),
          invoke('notebook_list'),
          invoke('external_markdown_list')
        ])
        const externalById = new Map(this.externalSources.map(source => [source.id, source]))
        this.notes = this.notes.map(note => externalById.has(note.id) ? { ...note, external: true, externalPath: externalById.get(note.id)?.path } : note)
        if (!this.activeId && this.notes[0]) this.activeId = this.notes[0].id
        if (this.activeId && !this.notes.some(note => note.id === this.activeId) && this.notes[0]) this.activeId = this.notes[0].id
      } finally {
        this.loading = false
      }
    },
    async loadTemplates() {
      this.templates = await invoke('note_template_list') || []
      return this.templates
    },
    async create() {
      const active = this.notes.find(note => note.id === this.activeId)
      const notebookId = this.selectedTreeNode.type === 'notebook' ? this.selectedTreeNode.id : this.selectedTreeNode.type === 'note' ? active?.notebookId || null : null
      const note = await invoke('note_create', { input: { title: '未命名笔记', notebookId, knowledgeBaseId: null, contentHtml: '<p></p>', contentText: '', contentMarkdown: '', pinned: false } })
      this.notes.unshift(note)
      this.activeId = note.id
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
      this.notes.unshift(note)
      this.activeId = note.id
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
      const note = { ...(await invoke('note_open_external_markdown', { input })), external: true, externalPath: input.path }
      const index = this.notes.findIndex(item => item.id === note.id)
      if (index >= 0) this.notes[index] = note
      else this.notes.unshift(note)
      this.activeId = note.id
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
      if (file.changed === false) {
        const cached = await invoke('note_get', { id: source.id })
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
      await Promise.all(this.externalSources.map(source => {
        const note = this.notes.find(item => item.id === source.id)
        return note ? invoke('note_delete', { id: source.id, version: requireResourceVersion(note, '笔记') }).catch(() => undefined) : Promise.resolve()
      }))
      await invoke('external_markdown_clear')
      const externalIds = new Set(this.notes.filter(note => note.external).map(note => note.id))
      this.notes = this.notes.filter(note => !note.external)
      this.externalSources = []
      if (this.activeId && externalIds.has(this.activeId)) this.activeId = this.notes[0]?.id || null
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
      this.saving = true
      try {
        const updated = await invoke('note_update', { id: note.id, input: { title: note.title, notebookId: note.notebookId, knowledgeBaseId: note.knowledgeBaseId || null, contentHtml: note.contentHtml, contentText: note.contentText, contentMarkdown: note.contentMarkdown || '', pinned: Boolean(note.pinned), version: requireResourceVersion(note, '笔记') } })
        if (updated) Object.assign(note, updated)
      } finally {
        this.saving = false
      }
    },
    scheduleSave(note: Note, onSaved?: () => void) {
      if (this.saveTimer) clearTimeout(this.saveTimer)
      this.saveTimer = setTimeout(async () => {
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
      const note = [...this.notes, ...this.deleted].find(item => item.id === id)
      const updated = await invoke('note_set_pinned', { id, pinned, version: requireResourceVersion(note, '笔记') })
      if (note && updated) Object.assign(note, updated)
      return updated || note
    },
    async listLinks(id: string) {
      return invoke('note_link_list', { noteId: id })
    },
    async remove(id: string) {
      const note = this.notes.find(item => item.id === id)
      await invoke('note_delete', { id, version: requireResourceVersion(note, '笔记') })
      this.notes = this.notes.filter(note => note.id !== id)
      if (this.activeId === id) this.activeId = this.notes[0]?.id || null
      await this.load()
    },
    async purge(id: string) {
      await invoke('note_purge', { id })
      if (this.activeId === id) this.activeId = this.notes[0]?.id || null
      await this.load()
    },
    async restore(id: string) {
      const note = this.deleted.find(item => item.id === id)
      await invoke('note_restore', { id, version: requireResourceVersion(note, '笔记') })
      await this.load()
    },
    async rename(id: string, title: string) {
      const note = [...this.notes, ...this.deleted].find(item => item.id === id)
      if (!note || !title?.trim()) return null
      const updated = await invoke('note_update', { id, input: { title: title.trim(), notebookId: note.notebookId, knowledgeBaseId: note.knowledgeBaseId || null, contentHtml: note.contentHtml, contentText: note.contentText, contentMarkdown: note.contentMarkdown || '', pinned: Boolean(note.pinned), version: requireResourceVersion(note, '笔记') } })
      if (updated) Object.assign(note, updated)
      return updated
    },
    async duplicate(id: string) {
      const copy = await invoke('note_copy', { id })
      if (copy) {
        this.notes.unshift(copy)
        this.activeId = copy.id
      }
      return copy
    },
    async move(id: string, notebookId: string | null) {
      const note = [...this.notes, ...this.deleted].find(item => item.id === id)
      const updated = await invoke('note_move', { id, notebookId: notebookId || null, version: requireResourceVersion(note, '笔记') })
      if (note && updated) Object.assign(note, updated)
      if (note) note.notebookId = notebookId || this.notebooks.find(book => book.name === '未分类')?.id || null
      return note
    },
    async moveToKnowledge(id: string, knowledgeBaseId: string | null) {
      const note = [...this.notes, ...this.deleted].find(item => item.id === id)
      const updated = await invoke('note_move_to_knowledge_base', { id, knowledgeBaseId: knowledgeBaseId || null, version: requireResourceVersion(note, '笔记') })
      if (note && updated) Object.assign(note, updated)
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
      this.activeId = null
      await this.load()
    }
  }
})
