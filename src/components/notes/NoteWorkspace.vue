<script setup lang="ts">
import { computed } from 'vue'
import NoteEditor from '../NoteEditor.vue'
import AllNotesList from './AllNotesList.vue'
import { useDelayedBusy } from '../../composables/useDelayedBusy'
import type { NotesWorkspace } from '../../composables/useNotesWorkspace'

const props = defineProps<{ workspace: NotesWorkspace }>()
const workspace = props.workspace
const { bodyLoading, bodyError, retryNote, t, sidebarCollapsed, showDeleted, store, noteEditorRef, tocVisible, route, clearReviewedProposal, toggleToc, remove, importExternalNote } = workspace
const initializing = computed(() => Boolean(workspace.initializing?.value))
const showLoading = useDelayedBusy(() => Boolean(bodyLoading?.value || initializing.value))
const showingAllNotes = computed(() => !showDeleted.value && !store.active && store.selectedTreeNode?.type === 'all')
</script>

<template>
    <button v-if="sidebarCollapsed" class="sidebar-expand-btn" :title="t('noteSidebarExpand')" @click="sidebarCollapsed = false"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg></button>

    <section class="note-main note-editor-area" :class="{ 'sidebar-collapsed': sidebarCollapsed }" :aria-busy="bodyLoading || initializing">
      <div v-if="showLoading" class="note-read-status" role="status">正在读取笔记…</div>
      <div v-if="bodyError" class="note-read-status is-error" role="alert">{{ bodyError }} <button type="button" @click="retryNote">重试</button></div>
      <AllNotesList v-if="showingAllNotes" :workspace="workspace" />
      <NoteEditor v-else-if="!showDeleted && (store.active || (!initializing && !bodyLoading && !bodyError && !store.loadError))" ref="noteEditorRef" :note="store.active" :toc-visible="tocVisible" :proposal-id="String(route.query.proposal || '')" @proposal-reviewed="clearReviewedProposal" @toggle-toc="toggleToc" @deleted="remove" @import-external="importExternalNote" />
      <div v-else-if="store.active" class="deleted-card"><h2>{{ store.active.title }}</h2><p>{{ store.active.contentText.slice(0, 300) }}</p><button class="secondary-button" @click="store.restore(store.active.id)">{{ t('restore') }}</button><button class="danger-button" @click="remove(store.active.id)">{{ t('delete') }}</button></div>
      <div v-else-if="showDeleted" class="empty-state"><div class="empty-icon">⌁</div><h2>{{ t('recentlyDeleted') }}</h2></div>
    </section>
</template>

<style scoped>
.note-read-status { position:absolute; z-index:20; right:16px; bottom:16px; max-width:calc(100% - 32px); padding:6px 10px; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-primary); color:var(--text-secondary); font-size:12px; pointer-events:none; }
.note-read-status.is-error { pointer-events:auto; color:var(--text-primary); }
.note-read-status button { margin-left:8px; color:var(--accent-color); text-decoration:underline; }
</style>
