import { defineStore } from 'pinia'
import { invoke } from '../services/tauri'
import { marked } from 'marked'
import { sanitizeEditorHtml, textFromEditorHtml } from '../utils/noteMarkdown'

export const useNotesStore = defineStore('notes', {
  state: () => ({
    notes: [],
    deleted: [],
    notebooks: [],
    templates: [],
    activeId: null,
    search: '',
    selectedTag: '',
    pinnedOnly: false,
    selectedNotebook: 'all',
    loading: false,
    saveTimer: null,
    saving: false
  }),
  getters: {
    active: state => state.notes.find(note => note.id === state.activeId) || null,
    visible: state => state.notes.filter(note => state.selectedNotebook === 'all' || note.notebookId === state.selectedNotebook),
    allTags: state => [...new Set(state.notes.flatMap(note => note.tags || []))].sort()
  },
  actions: {
    async load() {
      this.loading = true
      try {
        await invoke('note_purge_expired')
        const filters = { search: this.search || null, deleted: false, tag: this.selectedTag || null, pinned: this.pinnedOnly ? true : null }
        ;[this.notes, this.deleted, this.notebooks] = await Promise.all([
          invoke('note_list', filters),
          invoke('note_list', { search: '', deleted: true }),
          invoke('notebook_list')
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
      const note = await invoke('note_create', { input: { title: '未命名笔记', notebookId: this.selectedNotebook === 'all' ? null : this.selectedNotebook, knowledgeBaseId: null, contentHtml: '<p></p>', contentText: '', contentMarkdown: '', tags: [], pinned: false } })
      this.notes.unshift(note)
      this.activeId = note.id
      return note
    },
    async createFromTemplate(templateId) {
      const template = this.templates.find(item => item.id === templateId) || (await this.loadTemplates()).find(item => item.id === templateId)
      if (!template) return this.create()
      const markdown = template.contentMarkdown || ''
      const html = sanitizeEditorHtml(marked.parse(markdown))
      return this.createFromContent({ title: template.title || template.name, contentHtml: html, contentText: textFromEditorHtml(html), contentMarkdown: markdown })
    },
    async createFromContent({ title = '未命名笔记', contentHtml = '<p></p>', contentText = '', contentMarkdown = '', notebookId, knowledgeBaseId = null, tags = [], pinned = false } = {}) {
      const uncategorizedId = this.notebooks.find(book => book.name === '未分类')?.id || null
      const note = await invoke('note_create', { input: { title: title.trim() || '未命名笔记', notebookId: notebookId === undefined ? uncategorizedId : notebookId, knowledgeBaseId, contentHtml, contentText, contentMarkdown, tags, pinned } })
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
      const html = extension === 'md' || extension === 'markdown' ? sanitizeEditorHtml(marked.parse(text)) : isHtmlNote ? sanitizeEditorHtml(text) : '<p>' + escaped + '</p>'
      const contentMarkdown = isHtmlNote ? '' : text
      const contentText = extension === 'md' || extension === 'markdown' || isHtmlNote ? textFromEditorHtml(html) : text
      return this.createFromContent({ title, contentHtml: html, contentText, contentMarkdown, notebookId: this.selectedNotebook === 'all' ? null : this.selectedNotebook })
    },
    async save(note) {
      this.saving = true
      try {
        const updated = await invoke('note_update', { id: note.id, input: { title: note.title, notebookId: note.notebookId, knowledgeBaseId: note.knowledgeBaseId || null, contentHtml: note.contentHtml, contentText: note.contentText, contentMarkdown: note.contentMarkdown || '', tags: note.tags || [], pinned: Boolean(note.pinned) } })
        if (updated) Object.assign(note, updated)
      } finally {
        this.saving = false
      }
    },
    scheduleSave(note, onSaved) {
      clearTimeout(this.saveTimer)
      this.saveTimer = setTimeout(async () => {
        await this.save(note)
        onSaved?.()
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
      const updated = await invoke('note_update', { id, input: { title: title.trim(), notebookId: note.notebookId, knowledgeBaseId: note.knowledgeBaseId || null, contentHtml: note.contentHtml, contentText: note.contentText, contentMarkdown: note.contentMarkdown || '', tags: note.tags || [], pinned: Boolean(note.pinned) } })
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
      if (note) note.notebookId = notebookId || null
      return note
    },
    async moveToKnowledge(id, knowledgeBaseId) {
      const updated = await invoke('note_move_to_knowledge_base', { id, knowledgeBaseId: knowledgeBaseId || null })
      const note = [...this.notes, ...this.deleted].find(item => item.id === id)
      if (note && updated) Object.assign(note, updated)
      return updated || note
    },
    async createNotebook(name) {
      await invoke('notebook_create', { name })
      await this.load()
    },
    async updateNotebook(id, name) {
      await invoke('notebook_update', { id, name, description: '' })
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
