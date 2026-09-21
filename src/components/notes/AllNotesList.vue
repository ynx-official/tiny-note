<script setup lang="ts">
import { computed } from 'vue'
import { FileText, Pin } from 'lucide-vue-next'
import NotePageControls from './NotePageControls.vue'
import type { NotesWorkspace } from '../../composables/useNotesWorkspace'

const props = defineProps<{ workspace: NotesWorkspace }>()
const { store, t, selectNote, openContextMenu } = props.workspace
const notebookNames = computed(() => new Map(store.notebooks.map(book => [book.id, book.name])))
</script>

<template>
  <div class="all-notes-list" :aria-label="`${t('allNotes')}列表`" :aria-busy="store.catalog.loading">
    <header class="all-notes-header">
      <h1>{{ t('allNotes') }}</h1>
      <span>{{ store.catalog.total }} 篇<span v-if="store.search || store.pinnedOnly"> · 筛选结果</span></span>
    </header>
    <button v-for="note in store.catalog.items" :key="note.id" type="button" class="all-notes-row" @click="selectNote(note)" @contextmenu.prevent="openContextMenu($event, note)">
      <FileText :size="18" aria-hidden="true" />
      <span class="all-notes-copy">
        <strong>{{ note.title || t('untitled') }}</strong>
        <span v-if="note.excerpt" class="all-notes-excerpt">{{ note.excerpt }}</span>
        <small>{{ notebookNames.get(note.notebookId || '') || '未分类' }}</small>
      </span>
      <Pin v-if="note.pinned" :size="14" aria-label="已置顶" />
      <time v-if="note.updatedAt" :datetime="note.updatedAt">{{ note.updatedAt.slice(0, 10) }}</time>
    </button>
    <NotePageControls :page="store.catalog" @more="store.loadCatalogPage(true)" @retry="store.loadCatalogPage(store.catalog.retryAppend)" />
    <p v-if="store.catalog.loaded && !store.catalog.items.length && !store.catalog.loading && !store.catalog.error" class="all-notes-empty">{{ store.search || store.pinnedOnly ? '没有匹配的笔记' : t('emptyNotes') }}</p>
  </div>
</template>

<style scoped>
.all-notes-list { height:100%; min-height:0; overflow:auto; padding:32px 40px; color:var(--text-primary); background:var(--bg-primary); }
.all-notes-header { display:flex; align-items:baseline; gap:16px; padding-bottom:20px; border-bottom:1px solid var(--border-color); }
.all-notes-header h1 { margin:0; font-size:28px; font-weight:600; }
.all-notes-header > span { font-size:12px; color:var(--text-secondary); }
.all-notes-row { display:flex; align-items:center; gap:14px; width:100%; padding:16px 8px; border:0; border-bottom:1px solid var(--border-color); background:transparent; color:inherit; text-align:left; cursor:pointer; }
.all-notes-row:hover { background:var(--bg-hover); }
.all-notes-row:focus-visible { outline:2px solid var(--accent-color); outline-offset:-2px; }
.all-notes-row > svg { flex-shrink:0; color:var(--text-secondary); }
.all-notes-copy { display:grid; gap:6px; flex:1; min-width:0; }
.all-notes-copy strong,.all-notes-excerpt { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.all-notes-copy strong { font-size:15px; font-weight:500; }
.all-notes-excerpt,.all-notes-copy small,.all-notes-row time { font-size:12px; color:var(--text-secondary); }
.all-notes-row time { flex-shrink:0; }
.all-notes-empty { padding:60px 16px; text-align:center; color:var(--text-secondary); }
@media (max-width:1100px) { .all-notes-list { padding:24px; } }
@media (max-width:700px) { .all-notes-list { padding:20px 12px; } .all-notes-row { flex-wrap:wrap; gap:8px; } .all-notes-row time { margin-left:26px; } }
</style>
