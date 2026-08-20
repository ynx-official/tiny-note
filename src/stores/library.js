import { defineStore } from 'pinia'
import { invoke } from '../services/tauri'
import DOMPurify from 'dompurify'

function compareEntries(a, b, sortBy, direction) {
  if (sortBy === 'size') {
    const diff = (a.size || 0) - (b.size || 0)
    if (diff) return diff * direction
  } else if (sortBy === 'modified') {
    const diff = String(a.modifiedAt || '').localeCompare(String(b.modifiedAt || ''))
    if (diff) return diff * direction
  } else {
    const diff = String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' })
    if (diff) return diff * direction
  }
  if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
  return String(a.relativePath || '').localeCompare(String(b.relativePath || ''), undefined, { numeric: true, sensitivity: 'base' })
}

export const useLibraryStore = defineStore('library', {
  state: () => ({
    bases: [],
    activeId: null,
    entries: [],
    path: '',
    search: '',
    preview: null,
    loading: false,
    sortBy: 'name',
    sortDirection: 'asc',
    pathHistory: [],
    forwardHistory: []
  }),
  getters: {
    active: s => s.bases.find(k => k.id === s.activeId) || null,
    breadcrumbs: s => s.path ? s.path.split('/').filter(Boolean).reduce((items, name, index, names) => {
      items.push({ name, path: names.slice(0, index + 1).join('/') })
      return items
    }, []) : []
  },
  actions: {
    sortEntries(entries) {
      const direction = this.sortDirection === 'asc' ? 1 : -1
      return [...entries].sort((a, b) => compareEntries(a, b, this.sortBy, direction))
    },
    async load() {
      this.loading = true
      try {
        this.bases = await invoke('knowledge_base_list')
        if (!this.bases.some(base => base.id === this.activeId)) this.activeId = this.bases[0]?.id || null
        this.path = ''
        this.pathHistory = []
        this.forwardHistory = []
        if (this.activeId) await this.loadEntries()
      } finally {
        this.loading = false
      }
    },
    async selectBase(id) {
      if (!id || id === this.activeId) return
      this.activeId = id
      this.path = ''
      this.pathHistory = []
      this.forwardHistory = []
      this.preview = null
      await this.loadEntries()
    },
    async loadEntries() {
      if (!this.activeId) {
        this.entries = []
        return
      }
      this.loading = true
      try {
        const entries = await invoke('library_list', {
          knowledgeBaseId: this.activeId,
          relativePath: this.path,
          search: this.search || null
        })
        this.entries = this.sortEntries(entries || [])
      } finally {
        this.loading = false
      }
    },
    async navigate(path, record = true) {
      const next = String(path || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
      if (next === this.path) return
      if (record) {
        this.pathHistory.push(this.path)
        this.forwardHistory = []
      }
      this.path = next
      this.preview = null
      await this.loadEntries()
    },
    async goBack() {
      if (!this.pathHistory.length) return
      const target = this.pathHistory.pop()
      this.forwardHistory.unshift(this.path)
      this.path = target
      this.preview = null
      await this.loadEntries()
    },
    async goForward() {
      if (!this.forwardHistory.length) return
      const target = this.forwardHistory.shift()
      this.pathHistory.push(this.path)
      this.path = target
      this.preview = null
      await this.loadEntries()
    },
    setSort(sortBy) {
      if (sortBy === this.sortBy) this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc'
      else {
        this.sortBy = sortBy
        this.sortDirection = 'asc'
      }
      this.entries = this.sortEntries(this.entries)
    },
    async create(name, category = 'personal') {
      const kb = await invoke('knowledge_base_create', { input: { name, category } })
      this.bases.push(kb)
      await this.selectBase(kb.id)
    },
    async updateBase(base, name) {
      await invoke('knowledge_base_update', { id: base.id, name, description: base.description || '', cover: base.cover || null })
      base.name = name
    },
    async deleteBase(id) {
      await invoke('knowledge_base_delete', { id })
      this.bases = this.bases.filter(base => base.id !== id)
      if (this.activeId === id) {
        this.activeId = this.bases[0]?.id || null
        this.path = ''
        this.pathHistory = []
        this.forwardHistory = []
        this.preview = null
        await this.loadEntries()
      }
    },
    async createFolder(name) {
      if (!this.activeId) return
      await invoke('library_create_folder', { knowledgeBaseId: this.activeId, relativePath: this.path, name })
      await this.loadEntries()
    },
    async rename(relativePath, newName) {
      await invoke('library_rename', { knowledgeBaseId: this.activeId, relativePath, newName })
      await this.loadEntries()
    },
    async remove(relativePath) {
      await invoke('library_move_to_trash', { knowledgeBaseId: this.activeId, relativePath })
      await this.loadEntries()
    },
    async openPreview(relativePath) {
      this.preview = await invoke('library_preview', { knowledgeBaseId: this.activeId, relativePath })
      if (this.preview?.kind === 'html') this.preview.content = DOMPurify.sanitize(this.preview.content, { ADD_ATTR: ['target'] })
    },
    async importText(file) {
      const content = await file.text()
      const relativePath = `${this.path ? `${this.path}/` : ''}${file.name}`
      const result = await invoke('library_write_file', { knowledgeBaseId: this.activeId, relativePath, content })
      await this.loadEntries()
      return result
    },
    async importFiles(files) {
      for (const file of files) await this.importText(file)
    }
  }
})
