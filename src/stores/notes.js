import { defineStore } from 'pinia'
import { invoke } from '../services/tauri'
import DOMPurify from 'dompurify'
import { marked } from 'marked'

export const useNotesStore = defineStore('notes', { state: () => ({ notes: [], deleted: [], notebooks: [], activeId: null, search: '', selectedNotebook: 'all', loading: false, saveTimer: null, saving: false }), getters: { active: s => s.notes.find(n => n.id === s.activeId) || null, visible: s => s.notes.filter(n => s.selectedNotebook === 'all' || n.notebookId === s.selectedNotebook) }, actions: {
  async load() { this.loading = true; try { await invoke('note_purge_expired'); [this.notes, this.deleted, this.notebooks] = await Promise.all([invoke('note_list', { search: this.search || null, deleted: false }), invoke('note_list', { search: '', deleted: true }), invoke('notebook_list')]); if (!this.activeId && this.notes[0]) this.activeId = this.notes[0].id } finally { this.loading = false } },
  async create() { const n = await invoke('note_create', { input: { title: '未命名笔记', notebookId: this.selectedNotebook === 'all' ? null : this.selectedNotebook, contentHtml: '<p></p>', contentText: '' } }); this.notes.unshift(n); this.activeId = n.id; return n },
  async createFromContent({ title = '未命名笔记', contentHtml = '<p></p>', contentText = '', notebookId } = {}) { const n = await invoke('note_create', { input: { title: title.trim() || '未命名笔记', notebookId: notebookId === undefined ? (this.selectedNotebook === 'all' ? null : this.selectedNotebook) : notebookId, contentHtml, contentText } }); this.notes.unshift(n); this.activeId = n.id; return n },
  async importText(file) { const text = await file.text(); const title = file.name.replace(/\.[^.]+$/, '') || '导入笔记'; const extension = file.name.split('.').pop()?.toLowerCase(); const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br>'); const html = extension === 'md' || extension === 'markdown' ? DOMPurify.sanitize(marked.parse(text)) : extension === 'note' && /<\w[\s\S]*>/.test(text) ? DOMPurify.sanitize(text) : `<p>${escaped}</p>`; const n = await invoke('note_create', { input: { title, notebookId: this.selectedNotebook === 'all' ? null : this.selectedNotebook, contentHtml: html, contentText: text } }); this.notes.unshift(n); this.activeId = n.id; return n },
  async save(note) { this.saving = true; try { const updated = await invoke('note_update', { id: note.id, input: { title: note.title, notebookId: note.notebookId, contentHtml: note.contentHtml, contentText: note.contentText } }); if (updated) Object.assign(note, updated) } finally { this.saving = false } },
  scheduleSave(note) { clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.save(note), 800) },
  async remove(id) { await invoke('note_delete', { id }); this.notes = this.notes.filter(n => n.id !== id); if (this.activeId === id) this.activeId = this.notes[0]?.id || null; await this.load() },
  async purge(id) { await invoke('note_purge', { id }); if (this.activeId === id) this.activeId = this.notes[0]?.id || null; await this.load() },
  async restore(id) { await invoke('note_restore', { id }); await this.load() },
  async rename(id, title) {
    const note = [...this.notes, ...this.deleted].find(item => item.id === id)
    if (!note || !title?.trim()) return null
    const updated = await invoke('note_update', { id, input: { title: title.trim(), notebookId: note.notebookId, contentHtml: note.contentHtml, contentText: note.contentText } })
    if (updated) Object.assign(note, updated)
    return updated
  },
  async duplicate(id) {
    const copy = await invoke('note_copy', { id })
    if (copy) { this.notes.unshift(copy); this.activeId = copy.id }
    return copy
  },
  async move(id, notebookId) {
    await invoke('note_move', { id, notebookId: notebookId || null })
    const note = [...this.notes, ...this.deleted].find(item => item.id === id)
    if (note) note.notebookId = notebookId || null
    return note
  },
  async createNotebook(name) { await invoke('notebook_create', { name }); await this.load() },
  async updateNotebook(id, name) { await invoke('notebook_update', { id, name, description: '' }); await this.load() },
  async deleteNotebook(id) { await invoke('notebook_delete', { id }); await this.load() }
} })
