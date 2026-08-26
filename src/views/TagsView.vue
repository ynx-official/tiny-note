<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { FileText, Plus, Search, Tag, Trash2 } from 'lucide-vue-next'
import { useTagsStore } from '../stores/tags'
import { useNotesStore } from '../stores/notes'
import { requestPrompt } from '../services/promptDialog'
import { requestConfirmation } from '../services/appFeedback'
import { useWorkspaceSidebar } from '../utils/workspaceSidebar'

const tags = useTagsStore()
const notes = useNotesStore()
const router = useRouter()
const { t } = useI18n()
const pickerOpen = ref(false)
const pickerSearch = ref('')
const selectedNoteIds = ref(new Set())
const { sidebarWidth, isResizing, onResizeStart } = useWorkspaceSidebar()

const activeTitle = computed(() => tags.activeId === 'untagged' ? t('untagged') : tags.activeTag?.name || t('tags'))
const availableNotes = computed(() => {
  const linked = new Set(tags.notes.map(note => note.id))
  const query = pickerSearch.value.trim().toLocaleLowerCase()
  return notes.notes.filter(note => !linked.has(note.id) && (!query || `${note.title} ${note.contentText}`.toLocaleLowerCase().includes(query)))
})
function notebookPath(notebookId) {
  const parts = []
  const visited = new Set()
  let current = notes.notebooks.find(book => book.id === notebookId)
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    parts.unshift(current.name)
    current = notes.notebooks.find(book => book.id === current.parentId)
  }
  return parts.join(' / ') || '未分类'
}
async function createTag() {
  const name = await requestPrompt(t('newTag'))
  if (name?.trim()) await tags.create(name.trim())
}
async function renameTag() {
  if (!tags.activeTag) return
  const name = await requestPrompt(t('renameTag'), tags.activeTag.name)
  if (name?.trim()) await tags.rename(tags.activeTag.id, name.trim())
}
async function deleteTag() {
  if (!tags.activeTag || !(await requestConfirmation({ title: '删除标签', message: `删除“${tags.activeTag.name}”只会移除标签及关联关系，不会删除笔记。`, tone: 'danger', confirmLabel: '删除' }))) return
  await tags.remove(tags.activeTag.id)
}
function openPicker() { pickerSearch.value = ''; selectedNoteIds.value = new Set(); pickerOpen.value = true }
function toggleSelection(id) { const next = new Set(selectedNoteIds.value); if (next.has(id)) next.delete(id); else next.add(id); selectedNoteIds.value = next }
async function addSelected() { if (!tags.activeTag || !selectedNoteIds.value.size) return; await tags.addNotes(tags.activeTag.id, [...selectedNoteIds.value]); pickerOpen.value = false }
async function removeNote(id) { if (tags.activeTag) await tags.removeNotes(tags.activeTag.id, [id]) }
function openNote(note) { router.push({ path: '/notes', query: { note: note.id } }) }

onMounted(() => tags.load())
</script>

<template>
  <div class="tags-workspace">
    <aside class="tags-sidebar" :class="{ 'is-resizing': isResizing }" :style="{ width: sidebarWidth + 'px' }">
      <div class="tags-search"><Search :size="15" /><input v-model="tags.search" :placeholder="t('searchTags')" /></div>
      <div class="tags-heading"><strong>{{ t('tags') }}</strong><button :title="t('newTag')" @click="createTag"><Plus :size="16" /></button></div>
      <button class="tag-row" :class="{ active: tags.activeId === 'untagged' }" @click="tags.select('untagged')"><Tag :size="14" /><span>{{ t('untagged') }}</span><small v-if="tags.activeId === 'untagged'">{{ tags.notes.length }}</small></button>
      <button v-for="item in tags.visibleTags" :key="item.id" class="tag-row" :class="{ active: tags.activeId === item.id }" @click="tags.select(item.id)"><Tag :size="14" /><span>{{ item.name }}</span><small>{{ item.noteCount }}</small></button>
    </aside>
    <div class="sidebar-resize-handle" @mousedown="onResizeStart"></div>
    <section class="tags-main">
      <header class="tags-main-header">
        <div><span class="eyebrow">{{ t('tags') }}</span><h1>{{ activeTitle }}</h1></div>
        <div class="tag-actions" v-if="tags.activeTag"><button @click="renameTag">{{ t('rename') }}</button><button @click="openPicker"><Plus :size="15" />{{ t('addNotes') }}</button><button class="danger" :title="t('deleteTag')" @click="deleteTag"><Trash2 :size="15" /></button></div>
      </header>
      <div class="tagged-note-list">
        <button v-for="note in tags.notes" :key="note.id" class="tagged-note-row" @click="openNote(note)">
          <FileText :size="17" /><span class="tagged-note-copy"><strong>{{ note.title || t('untitled') }}</strong><small>{{ notebookPath(note.notebookId) }}</small></span><time>{{ new Date(note.updatedAt).toLocaleDateString() }}</time><span v-if="tags.activeTag" class="remove-link" @click.stop="removeNote(note.id)">{{ t('removeFromTag') }}</span>
        </button>
        <div v-if="!tags.notes.length" class="tags-empty"><Tag :size="34" /><p>{{ t('noTaggedNotes') }}</p><small>{{ tags.activeTag ? t('batchAddHint') : t('allNotesTagged') }}</small></div>
      </div>
    </section>
    <div v-if="pickerOpen" class="tag-picker-backdrop" @click.self="pickerOpen = false">
      <section class="tag-picker" role="dialog" aria-modal="true" :aria-label="t('addNotes')">
        <header><div><h2>{{ t('addNotes') }}</h2><small>{{ tags.activeTag?.name }}</small></div><button @click="pickerOpen = false">×</button></header>
        <div class="tags-search"><Search :size="15" /><input v-model="pickerSearch" autofocus :placeholder="t('searchNotes')" /></div>
        <div class="tag-picker-list"><label v-for="note in availableNotes" :key="note.id"><input type="checkbox" :checked="selectedNoteIds.has(note.id)" @change="toggleSelection(note.id)" /><span><strong>{{ note.title || t('untitled') }}</strong><small>{{ notebookPath(note.notebookId) }}</small></span></label><p v-if="!availableNotes.length">{{ t('noAvailableNotes') }}</p></div>
        <footer><button @click="pickerOpen = false">{{ t('cancel') }}</button><button class="primary" :disabled="!selectedNoteIds.size" @click="addSelected">{{ t('add') }} {{ selectedNoteIds.size || '' }}</button></footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.tags-workspace{display:flex;height:100%;min-width:0;background:var(--bg-primary,#fff);color:var(--text-primary,#242424)}
.tags-sidebar{flex:0 0 auto;min-width:0;padding:12px;border-right:1px solid var(--border-color,#e6e6e6);background:var(--bg-primary,#fff);overflow:auto;transition:width .25s cubic-bezier(.4,0,.2,1)}.tags-sidebar.is-resizing{transition:none}.tags-search{height:32px;display:flex;align-items:center;gap:8px;padding:0 10px;border:1px solid var(--border-color,#dde1e6);border-radius:6px;background:var(--bg-secondary,#fff)}.tags-search input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:var(--text-primary);font:inherit}.tags-heading{display:flex;align-items:center;justify-content:space-between;margin:16px 8px 8px}.tags-heading strong{font-size:13px}.tags-heading button,.tag-actions button{border:0;background:transparent;display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 8px;border-radius:4px}.tags-heading button:hover,.tag-actions button:hover{background:var(--bg-hover,#eceef1)}.tag-row{width:100%;height:32px;border:0;background:transparent;display:flex;align-items:center;gap:8px;padding:0 9px;border-radius:4px;text-align:left}.tag-row:hover{background:var(--bg-hover,#f0f1f3)}.tag-row.active{background:var(--accent-light,#e9edff);color:var(--accent-color,#315efb)}.tag-row span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tag-row small{color:var(--text-secondary,#858b94)}.tags-main{min-width:0;flex:1;overflow:auto;padding:44px 42px}.tags-main-header{display:flex;align-items:flex-end;justify-content:space-between;padding-bottom:20px;border-bottom:1px solid var(--border-color,#ececec)}.eyebrow{font-size:12px;color:var(--text-secondary,#7d838c)}.tags-main h1{font-size:28px;margin:5px 0 0}.tag-actions{display:flex;gap:6px}.tag-actions .danger{color:#c73c3c}.tagged-note-row{width:100%;border:0;border-bottom:1px solid var(--border-color,#efefef);background:transparent;display:flex;align-items:center;gap:12px;padding:14px 8px;text-align:left}.tagged-note-row:hover{background:var(--bg-hover,#fafafa)}.tagged-note-copy{min-width:0;flex:1;display:grid;gap:4px}.tagged-note-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tagged-note-copy small,.tagged-note-row time{font-size:12px;color:var(--text-secondary,#818792)}.remove-link{opacity:0;color:#bc3a3a}.tagged-note-row:hover .remove-link{opacity:1}.tags-empty{display:grid;place-items:center;gap:7px;color:var(--text-tertiary,#9ba1aa);padding:100px 20px}.tags-empty p{margin:4px 0 0;color:var(--text-secondary,#5f6670)}.tag-picker-backdrop{position:fixed;inset:0;z-index:200;background:rgba(25,28,34,.28);display:grid;place-items:center}.tag-picker{width:min(520px,calc(100vw - 40px));max-height:70vh;background:var(--bg-primary,#fff);border:1px solid var(--border-color,#ddd);border-radius:8px;box-shadow:0 18px 50px rgba(0,0,0,.16);display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:14px;padding:18px}.tag-picker header,.tag-picker footer{display:flex;align-items:center;justify-content:space-between}.tag-picker h2{margin:0 0 3px;font-size:18px}.tag-picker header button{border:0;background:transparent;font-size:22px}.tag-picker-list{overflow:auto;border-block:1px solid var(--border-color,#eee)}.tag-picker-list label{display:flex;gap:10px;padding:11px 5px;border-bottom:1px solid var(--border-color,#f1f1f1)}.tag-picker-list label span{display:grid;gap:3px}.tag-picker-list small{color:var(--text-secondary,#858b94)}.tag-picker footer{justify-content:flex-end;gap:8px}.tag-picker footer button{height:32px;padding:0 14px;border:1px solid var(--border-color,#d9d9d9);background:var(--bg-primary,#fff)}.tag-picker footer .primary{background:var(--accent-color,#315efb);color:#fff;border-color:var(--accent-color,#315efb)}.tag-picker footer .primary:disabled{opacity:.45}@media(max-width:760px){.tags-sidebar{width:280px!important}.tags-main{padding:28px 20px}}
:global(:root[data-theme=dark]) .tags-workspace,:global(:root[data-theme=dark]) .tags-sidebar,:global(:root[data-theme=dark]) .tag-picker,:global(:root[data-theme=dark]) .tags-search{color:var(--text-primary);background:var(--bg-primary);border-color:var(--border-color)}
:global(:root[data-theme=dark]) .tags-sidebar{background:var(--bg-secondary)}:global(:root[data-theme=dark]) .tag-row:hover,:global(:root[data-theme=dark]) .tag-actions button:hover,:global(:root[data-theme=dark]) .tagged-note-row:hover{background:var(--bg-hover)}:global(:root[data-theme=dark]) .tag-row.active{color:var(--accent-color);background:var(--bg-active)}:global(:root[data-theme=dark]) .tags-main-header,:global(:root[data-theme=dark]) .tagged-note-row,:global(:root[data-theme=dark]) .tag-picker-list,:global(:root[data-theme=dark]) .tag-picker-list label{border-color:var(--border-color)}
</style>
