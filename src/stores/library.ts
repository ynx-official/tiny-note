import { defineStore } from 'pinia'
import { invoke } from '../services/tauri'
import DOMPurify from 'dompurify'
import { requireResourceVersion } from '../services/resourceVersion'
import { errorMessage, type KnowledgeBase, type LibraryEntry, type LibraryPreview, type Note } from '../types/domain'

type LibrarySort = 'name' | 'size' | 'modified'
type SortDirection = 'asc' | 'desc'
interface Breadcrumb { name: string; path: string }

function compareEntries(a: LibraryEntry, b: LibraryEntry, sortBy: LibrarySort, direction: number): number {
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
    bases: [] as KnowledgeBase[],
    activeId: null as string | null,
    entries: [] as LibraryEntry[],
    path: '',
    search: '',
    preview: null as LibraryPreview | null,
    loading: false,
    error: '',
    sortBy: 'name' as LibrarySort,
    sortDirection: 'asc' as SortDirection,
    pathHistory: [] as string[],
    forwardHistory: [] as string[]
  }),
  getters: {
    active: s => s.bases.find(k => k.id === s.activeId) || null,
    breadcrumbs: s => s.path ? s.path.split('/').filter(Boolean).reduce<Breadcrumb[]>((items, name, index, names) => {
      items.push({ name, path: names.slice(0, index + 1).join('/') })
      return items
    }, []) : []
  },
  actions: {
    sortEntries(entries: LibraryEntry[]) {
      const direction = this.sortDirection === 'asc' ? 1 : -1
      return [...entries].sort((a, b) => compareEntries(a, b, this.sortBy, direction))
    },
    async load() {
      this.loading = true
      this.error = ''
      try {
        this.bases = await invoke('knowledge_base_list')
        if (!this.bases.some(base => base.id === this.activeId)) this.activeId = this.bases[0]?.id || null
        this.path = ''
        this.pathHistory = []
        this.forwardHistory = []
        if (this.activeId) await this.loadEntries()
      } catch (cause) {
        this.error = errorMessage(cause, '知识库读取失败')
        this.entries = []
      } finally {
        this.loading = false
      }
    },
    async selectBase(id: string) {
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
      this.error = ''
      try {
        const entries = await invoke('library_list', {
          knowledgeBaseId: this.activeId,
          relativePath: this.path,
          search: this.search || null
        })
        this.entries = this.sortEntries(entries || [])
      } catch (cause) {
        this.error = errorMessage(cause, '文件列表读取失败')
        this.entries = []
      } finally {
        this.loading = false
      }
    },
    async navigate(path: string, record = true) {
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
      this.path = target || ''
      this.preview = null
      await this.loadEntries()
    },
    async goForward() {
      if (!this.forwardHistory.length) return
      const target = this.forwardHistory.shift()
      this.pathHistory.push(this.path)
      this.path = target || ''
      this.preview = null
      await this.loadEntries()
    },
    setSort(sortBy: LibrarySort) {
      if (sortBy === this.sortBy) this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc'
      else {
        this.sortBy = sortBy
        this.sortDirection = 'asc'
      }
      this.entries = this.sortEntries(this.entries)
    },
    async create(name: string, category = 'personal') {
      const kb = await invoke('knowledge_base_create', { input: { name, category } })
      this.bases.push(kb)
      await this.selectBase(kb.id)
    },
    async updateBase(base: KnowledgeBase, name: string) {
      const updated = await invoke('knowledge_base_update', { id: base.id, name, description: base.description || '', cover: base.cover || null, version: requireResourceVersion(base, '知识库') })
      Object.assign(base, updated)
    },
    async deleteBase(id: string) {
      const base = this.bases.find(item => item.id === id)
      await invoke('knowledge_base_delete', { id, version: requireResourceVersion(base, '知识库') })
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
    async createFolder(name: string) {
      if (!this.activeId) return
      await invoke('library_create_folder', { knowledgeBaseId: this.activeId, relativePath: this.path, name })
      await this.loadEntries()
    },
    async rename(relativePath: string, newName: string) {
      await invoke('library_rename', { knowledgeBaseId: this.activeId, relativePath, newName })
      await this.loadEntries()
    },
    async remove(relativePath: string) {
      await invoke('library_move_to_trash', { knowledgeBaseId: this.activeId, relativePath })
      await this.loadEntries()
    },
    async openPreview(relativePath: string) {
      this.preview = await invoke('library_preview', { knowledgeBaseId: this.activeId, relativePath })
      if (this.preview?.kind === 'html') this.preview.content = DOMPurify.sanitize(this.preview.content, { ADD_ATTR: ['target'] })
    },
    async importText(file: File) {
      const content = await file.text()
      const relativePath = `${this.path ? `${this.path}/` : ''}${file.name}`
      const result = await invoke('library_write_file', { knowledgeBaseId: this.activeId, relativePath, content })
      await this.loadEntries()
      return result
    },
    async importFile(file: File) {
      const extension = file.name.split('.').pop()?.toLowerCase() || ''
      const binary = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf', 'epub', 'zip', 'docx'].includes(extension) || (file.type && !file.type.startsWith('text/') && !['application/json', 'application/xml'].includes(file.type))
      if (!binary) return this.importText(file)
      const bytes = new Uint8Array(await file.arrayBuffer())
      const relativePath = `${this.path ? `${this.path}/` : ''}${file.name}`
      const result = await invoke('library_write_file_bytes', { knowledgeBaseId: this.activeId, relativePath, content: Array.from(bytes) })
      await this.loadEntries()
      return result
    },
    async importFiles(files: File[]) {
      for (const file of files) await this.importFile(file)
    },
    async importUrl(url: string, relativePath = '') {
      const result = await invoke('library_import_url', { knowledgeBaseId: this.activeId, relativePath: relativePath || null, url })
      await this.loadEntries()
      return result
    },
    async addNoteReference(knowledgeBaseId: string, note: Note) {
      if (!knowledgeBaseId || !note?.id) throw new Error('缺少知识库或笔记信息')
      const result = await invoke('note_move_to_knowledge_base', { id: note.id, knowledgeBaseId, version: requireResourceVersion(note, '笔记') })
      if (result) Object.assign(note, result)
      return result
    }
  }
})
