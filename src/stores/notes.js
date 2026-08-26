import { defineStore } from 'pinia'
import { invoke } from '../services/tauri'
import { markdownToEditorHtml, sanitizeEditorHtml, textFromEditorHtml } from '../utils/noteMarkdown'
import { showToast } from '../services/appFeedback'

export const useNotesStore = defineStore('notes', {
  state: () => ({
    notes: [],
    deleted: [],
    externalSources: [],
    notebooks: [],
    templates: [],
    activeId: null,
    search: '',
    pinnedOnly: false,
    selectedNotebook: 'all',
    selectedTreeNode: { type: 'all', id: 'all' },
    loading: false,
    saveTimer: null,
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
    async createFromTemplate(templateId) {
      const template = this.templates.find(item => item.id === templateId) || (await this.loadTemplates()).find(item => item.id === templateId)
      if (!template) return this.create()
      const markdown = template.contentMarkdown || ''
      const html = sanitizeEditorHtml(markdownToEditorHtml(markdown))
      return this.createFromContent({ title: template.title || template.name, contentHtml: html, contentText: textFromEditorHtml(html), contentMarkdown: markdown })
    },
    async createFromContent({ title = '未命名笔记', contentHtml = '<p></p>', contentText = '', contentMarkdown = '', notebookId, knowledgeBaseId = null, pinned = false } = {}) {
      const uncategorizedId = this.notebooks.find(book => book.name === '未分类')?.id || null
      const note = await invoke('note_create', { input: { title: title.trim() || '未命名笔记', notebookId: notebookId === undefined ? uncategorizedId : notebookId, knowledgeBaseId, contentHtml, contentText, contentMarkdown, pinned } })
      this.notes.unshift(note)
      this.activeId = note.id
      return note
    },
    async importText(file) {
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
    async openExternalMarkdown(input) {
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
    async openExternalSource(source) {
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
      await invoke('external_markdown_clear')
      const externalIds = new Set(this.notes.filter(note => note.external).map(note => note.id))
      this.notes = this.notes.filter(note => !note.external)
      this.externalSources = []
      if (externalIds.has(this.activeId)) this.activeId = this.notes[0]?.id || null
    },
    async importExternal(note) {
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
    async save(note) {
      this.saving = true
      try {
        const updated = await invoke('note_update', { id: note.id, input: { title: note.title, notebookId: note.notebookId, knowledgeBaseId: note.knowledgeBaseId || null, contentHtml: note.contentHtml, contentText: note.contentText, contentMarkdown: note.contentMarkdown || '', pinned: Boolean(note.pinned) } })
        if (updated) Object.assign(note, updated)
      } finally {
        this.saving = false
      }
    },
    scheduleSave(note, onSaved) {
      clearTimeout(this.saveTimer)
      this.saveTimer = setTimeout(async () => {
        try {
          await this.save(note)
          onSaved?.()
        } catch (error) {
          const conflict = error?.code === 'external_file_changed'
          showToast(conflict ? '源文件已被其他程序修改，本次内容未覆盖。请重新打开文件确认。' : (error?.message || '笔记保存失败'), { tone: 'error' })
        }
      }, 800)
    },
    async setPinned(id, pinned) {
      const updated = await invoke('note_set_pinned', { id, pinned })
      const note = [...this.notes, ...this.deleted].find(item => item.id === id)
      if (note && updated) Object.assign(note, updated)
      return updated || note
    },
    async listLinks(id) {
      return invoke('note_link_list', { noteId: id })
    },
    async remove(id) {
      await invoke('note_delete', { id })
      this.notes = this.notes.filter(note => note.id !== id)
      if (this.activeId === id) this.activeId = this.notes[0]?.id || null
      await this.load()
    },
    async purge(id) {
      await invoke('note_purge', { id })
      if (this.activeId === id) this.activeId = this.notes[0]?.id || null
      await this.load()
    },
    async restore(id) {
      await invoke('note_restore', { id })
      await this.load()
    },
    async rename(id, title) {
      const note = [...this.notes, ...this.deleted].find(item => item.id === id)
      if (!note || !title?.trim()) return null
      const updated = await invoke('note_update', { id, input: { title: title.trim(), notebookId: note.notebookId, knowledgeBaseId: note.knowledgeBaseId || null, contentHtml: note.contentHtml, contentText: note.contentText, contentMarkdown: note.contentMarkdown || '', pinned: Boolean(note.pinned) } })
      if (updated) Object.assign(note, updated)
      return updated
    },
    async duplicate(id) {
      const copy = await invoke('note_copy', { id })
      if (copy) {
        this.notes.unshift(copy)
        this.activeId = copy.id
      }
      return copy
    },
    async move(id, notebookId) {
      await invoke('note_move', { id, notebookId: notebookId || null })
      const note = [...this.notes, ...this.deleted].find(item => item.id === id)
      if (note) note.notebookId = notebookId || this.notebooks.find(book => book.name === '未分类')?.id || null
      return note
    },
    async moveToKnowledge(id, knowledgeBaseId) {
      const updated = await invoke('note_move_to_knowledge_base', { id, knowledgeBaseId: knowledgeBaseId || null })
      const note = [...this.notes, ...this.deleted].find(item => item.id === id)
      if (note && updated) Object.assign(note, updated)
      return updated || note
    },
    async createNotebook(name, parentId = null) {
      const notebook = await invoke('notebook_create', { name, description: '', parentId })
      await this.load()
      return notebook
    },
    async updateNotebook(id, name, parentId = null) {
      await invoke('notebook_update', { id, name, description: '', parentId })
      await this.load()
    },
    async moveNotebook(id, parentId = null) {
      await invoke('notebook_move', { id, parentId })
      await this.load()
    },
    async deleteNotebook(id) {
      await invoke('notebook_delete', { id })
      await this.load()
    },
    async exportWorkspace() {
      return invoke('workspace_export')
    },
    async importWorkspace(backup) {
      await invoke('workspace_import', { request: { backup, replaceExisting: true } })
      this.activeId = null
      await this.load()
    }
  }
})
