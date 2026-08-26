import { defineStore } from 'pinia'
import { invoke } from '../services/tauri'

export const useTagsStore = defineStore('tags', {
  state: () => ({
    tags: [],
    activeId: 'untagged',
    notes: [],
    search: '',
    loading: false
  }),
  getters: {
    visibleTags: state => {
      const query = state.search.trim().toLocaleLowerCase()
      return query ? state.tags.filter(tag => tag.name.toLocaleLowerCase().includes(query)) : state.tags
    },
    activeTag: state => state.tags.find(tag => tag.id === state.activeId) || null
  },
  actions: {
    async load() {
      this.loading = true
      try {
        this.tags = await invoke('tag_list') || []
        if (this.activeId !== 'untagged' && !this.tags.some(tag => tag.id === this.activeId)) this.activeId = this.tags[0]?.id || 'untagged'
        await this.loadNotes()
      } finally {
        this.loading = false
      }
    },
    async loadNotes() {
      this.notes = await invoke('tag_note_list', { tagId: this.activeId === 'untagged' ? null : this.activeId, untagged: this.activeId === 'untagged' }) || []
    },
    async select(id) {
      this.activeId = id
      await this.loadNotes()
    },
    async create(name) {
      const tag = await invoke('tag_create', { name })
      this.tags = await invoke('tag_list') || []
      await this.select(tag.id)
      return tag
    },
    async rename(id, name) {
      const updated = await invoke('tag_update', { id, name })
      this.tags = await invoke('tag_list') || []
      return updated
    },
    async remove(id) {
      await invoke('tag_delete', { id })
      if (this.activeId === id) this.activeId = 'untagged'
      await this.load()
    },
    async noteTags(noteId) {
      return invoke('note_tag_list', { noteId })
    },
    async addNotes(tagId, noteIds) {
      await invoke('tag_note_add', { tagId, noteIds })
      await this.load()
    },
    async removeNotes(tagId, noteIds) {
      await invoke('tag_note_remove', { tagId, noteIds })
      await this.load()
    },
    async toggleForNote(noteId, tagId, selected) {
      await invoke(selected ? 'tag_note_add' : 'tag_note_remove', { tagId, noteIds: [noteId] })
      this.tags = await invoke('tag_list') || []
    }
  }
})
