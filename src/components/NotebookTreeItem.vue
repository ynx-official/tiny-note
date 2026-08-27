<script setup lang="ts">
import { FileText, Folder, Pin } from 'lucide-vue-next'
import type { Note, Notebook } from '../types/domain'

interface TreeNode extends Notebook { children: TreeNode[]; notes: Note[]; totalNoteCount: number }

defineOptions({ name: 'NotebookTreeItem' })
const props = withDefaults(defineProps<{ node: TreeNode; depth?: number; expanded: Set<unknown>; selected: { type: string; id: string } }>(), { depth: 0 })
const emit = defineEmits(['toggle', 'select-notebook', 'select-note', 'notebook-menu', 'note-menu', 'drop-node'])

function dragStart(event: DragEvent, kind: string, id: string) {
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('application/x-tiny-note-tree', JSON.stringify({ kind, id }))
}
function drop(event: DragEvent) {
  if (!event.dataTransfer) return
  try {
    const payload = JSON.parse(event.dataTransfer.getData('application/x-tiny-note-tree'))
    if (payload?.id) emit('drop-node', payload, props.node.id)
  } catch { /* ignore foreign drags */ }
}
function folderKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); emit('select-notebook', props.node) }
  if (event.key === 'ArrowRight' && !props.expanded.has(props.node.id)) { event.preventDefault(); emit('toggle', props.node.id) }
  if (event.key === 'ArrowLeft' && props.expanded.has(props.node.id)) { event.preventDefault(); emit('toggle', props.node.id) }
}
</script>

<template>
  <div class="notebook-tree-branch">
    <div
      class="tree-row tree-folder-row"
      :class="{ active: selected.type === 'notebook' && selected.id === node.id }"
      :style="{ paddingLeft: `${8 + depth * 16}px` }"
      tabindex="0"
      draggable="true"
      @dragstart="dragStart($event, 'notebook', node.id)"
      @dragover.prevent
      @drop.stop.prevent="drop"
      @keydown="folderKeydown"
      @click="$emit('select-notebook', node)"
      @contextmenu.prevent.stop="$emit('notebook-menu', $event, node)"
    >
      <button class="tree-disclosure" :aria-label="expanded.has(node.id) ? '折叠' : '展开'" @click.stop="$emit('toggle', node.id)">
        <span :class="{ expanded: expanded.has(node.id) }">›</span>
      </button>
      <Folder :size="16" :stroke-width="1.9" />
      <span class="tree-label">{{ node.name }}</span>
      <small>{{ node.totalNoteCount }}</small>
    </div>
    <div v-if="expanded.has(node.id)" class="tree-children">
      <NotebookTreeItem
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :expanded="expanded"
        :selected="selected"
        @toggle="$emit('toggle', $event)"
        @select-notebook="$emit('select-notebook', $event)"
        @select-note="$emit('select-note', $event)"
        @notebook-menu="(event, item) => $emit('notebook-menu', event, item)"
        @note-menu="(event, item) => $emit('note-menu', event, item)"
        @drop-node="(payload, notebookId) => $emit('drop-node', payload, notebookId)"
      />
      <button
        v-for="note in node.notes"
        :key="note.id"
        class="tree-row tree-note-row"
        :class="{ active: selected.type === 'note' && selected.id === note.id }"
        :style="{ paddingLeft: `${29 + (depth + 1) * 16}px` }"
        draggable="true"
        @dragstart="dragStart($event, 'note', note.id)"
        @click="$emit('select-note', note)"
        @contextmenu.prevent.stop="$emit('note-menu', $event, note)"
      >
        <FileText :size="16" :stroke-width="1.9" />
        <span class="tree-label">{{ note.title || '未命名笔记' }}</span>
        <Pin v-if="note.pinned" :size="12" :stroke-width="1.9" class="tree-pin" />
      </button>
    </div>
  </div>
</template>
