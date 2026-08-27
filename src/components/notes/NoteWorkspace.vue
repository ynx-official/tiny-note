<script setup lang="ts">
import NoteEditor from '../NoteEditor.vue'
import type { NotesWorkspace } from '../../composables/useNotesWorkspace'

const props = defineProps<{ workspace: NotesWorkspace }>()
const workspace = props.workspace
const { t, sidebarCollapsed, showDeleted, store, tocVisible, route, clearReviewedProposal, toggleToc, remove, importExternalNote } = workspace
</script>

<template>
    <button v-if="sidebarCollapsed" class="sidebar-expand-btn" :title="t('noteSidebarExpand')" @click="sidebarCollapsed = false"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg></button>

    <section class="note-main note-editor-area" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
      <NoteEditor v-if="!showDeleted" ref="noteEditorRef" :note="store.active" :toc-visible="tocVisible" :proposal-id="String(route.query.proposal || '')" @proposal-reviewed="clearReviewedProposal" @toggle-toc="toggleToc" @deleted="remove" @import-external="importExternalNote" />
      <div v-else-if="store.active" class="deleted-card"><h2>{{ store.active.title }}</h2><p>{{ store.active.contentText.slice(0, 300) }}</p><button class="secondary-button" @click="store.restore(store.active.id)">{{ t('restore') }}</button><button class="danger-button" @click="store.remove(store.active.id)">{{ t('delete') }}</button></div>
      <div v-else class="empty-state"><div class="empty-icon">⌁</div><h2>{{ t('recentlyDeleted') }}</h2></div>
    </section>
</template>
