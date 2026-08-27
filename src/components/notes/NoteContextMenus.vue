<script lang="ts">
import { defineComponent, type PropType } from 'vue'
import { BookOpen, ChevronRight, Copy, FolderInput, Pin, PinOff, Plus, RotateCcw, Tags, Trash2 } from 'lucide-vue-next'
import type { NotesWorkspace } from '../../composables/useNotesWorkspace'

export default defineComponent({
  name: 'NoteContextMenus',
  components: { BookOpen, ChevronRight, Copy, FolderInput, Pin, PinOff, Plus, RotateCcw, Tags, Trash2 },
  props: { workspace: { type: Object as PropType<NotesWorkspace>, required: true } },
  setup: props => props.workspace
})
</script>

<template>
    <div v-if="contextMenu && contextNote" ref="contextMenuRef" class="note-context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }" @click.stop @contextmenu.prevent.stop>
      <template v-if="!showDeleted">
        <div ref="contextKnowledgeAnchorRef" class="note-context-submenu-anchor" @mouseenter="showKnowledgeSubmenu" @mouseleave="hideKnowledgeSubmenu">
          <button class="has-submenu"><BookOpen :size="15" /><span>{{ t('addToKnowledge') }}</span><ChevronRight class="context-arrow" :size="14" /></button>
        </div>
        <div ref="contextMoveAnchorRef" class="note-context-submenu-anchor" @mouseenter="showMoveSubmenu" @mouseleave="hideMoveSubmenu">
          <button class="has-submenu"><FolderInput :size="15" /><span>移动到笔记本</span><ChevronRight class="context-arrow" :size="14" /></button>
        </div>
        <button class="has-submenu" @click="contextTagsOpen = !contextTagsOpen"><Tags :size="15" /><span>标签</span><ChevronRight class="context-arrow" :class="{ expanded: contextTagsOpen }" :size="14" /></button>
        <div v-if="contextTagsOpen" class="note-context-tag-list">
          <button class="note-context-create-item" @click="createContextTag"><Plus :size="13" />新建标签</button>
          <button v-for="tag in tagsStore.tags" :key="tag.id" @click="toggleContextTag(tag)"><span class="context-tag-check">{{ contextTagIds.has(tag.id) ? '✓' : '' }}</span>{{ tag.name }}</button>
          <span v-if="!tagsStore.tags.length" class="note-context-empty">暂无标签</span>
        </div>
        <button @click="duplicateContextNote"><Copy :size="15" /><span>复制</span></button>
        <button @click="togglePinned(contextNote); closeContextMenu()"><PinOff v-if="contextNote?.pinned" :size="15" /><Pin v-else :size="15" /><span>{{ contextNote?.pinned ? '取消置顶' : '置顶笔记' }}</span></button>
        <div class="note-context-divider"></div>
        <button class="danger" @click="deleteContextNote"><Trash2 :size="15" /><span>删除</span></button>
      </template>
      <template v-else>
        <button @click="restoreContextNote"><RotateCcw :size="15" /><span>{{ t('restore') }}</span></button>
        <button class="danger" @click="deleteContextNote"><Trash2 :size="15" /><span>{{ t('permanentlyDelete') }}</span></button>
      </template>
    </div>

    <Teleport to="body">
      <div v-if="contextKnowledgeOpen && contextMenu && contextNote" ref="contextKnowledgeSubmenuRef" class="note-context-submenu note-knowledge-submenu" :style="contextKnowledgeStyle" @mouseenter="cancelHideKnowledgeSubmenu" @mouseleave="hideKnowledgeSubmenu" @click.stop @contextmenu.prevent.stop>
        <button class="note-context-create-item" @click="createKnowledgeBaseForContext"><Plus :size="14" />{{ t('newKnowledge') }}</button>
        <div class="note-context-divider"></div>
        <template v-if="knowledgeGroups.length">
          <template v-for="group in knowledgeGroups" :key="group.id">
            <div class="note-context-group-label">{{ group.label }}</div>
            <button v-for="base in group.items" :key="base.id" @click="addContextNoteToKnowledge(base.id)"><BookOpen :size="14" />{{ base.name }}</button>
          </template>
        </template>
        <span v-else class="note-context-empty">{{ t('noKnowledgeBases') }}</span>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="contextMoveOpen && contextMenu && contextNote" ref="contextMoveSubmenuRef" class="note-context-submenu" :style="contextMoveStyle" @mouseenter="cancelHideMoveSubmenu" @mouseleave="hideMoveSubmenu" @click.stop @contextmenu.prevent.stop>
        <button @click="createNotebookForContext"><Plus :size="14" />{{ t('newNotebook') }}</button>
        <div class="note-context-divider"></div>
        <button v-for="notebook in store.notebooks" :key="notebook.id" :class="{ selected: contextNote.notebookId === notebook.id }" @click="moveContextNote(notebook.id)"><FolderInput :size="14" />{{ notebook.name }}</button>
        <span v-if="!store.notebooks.length" class="note-context-empty">没有笔记本</span>
      </div>
    </Teleport>
</template>
