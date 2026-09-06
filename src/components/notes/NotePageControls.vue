<script setup lang="ts">
import type { NotePageState } from '../../services/notePage'
defineProps<{ page: NotePageState }>()
defineEmits<{ more: []; retry: [] }>()
</script>
<template>
  <div class="note-page-controls">
    <p v-if="page.error" role="alert">{{ page.error }} <button type="button" @click="$emit('retry')">重试</button></p>
    <span v-else-if="page.loading" role="status">正在加载笔记…</span>
    <template v-else>
      <small v-if="page.total">已显示 {{ page.items.length }} / {{ page.total }}</small>
      <button v-if="page.hasMore" type="button" @click="$emit('more')">加载更多</button>
    </template>
  </div>
</template>
<style scoped>
.note-page-controls { display:flex; align-items:center; justify-content:center; gap:12px; padding:12px; color:var(--text-tertiary,#777); font-size:12px; }
.note-page-controls p { margin:0; }
.note-page-controls button { padding:5px 10px; border:1px solid var(--border-color,#ddd); border-radius:6px; color:var(--text-primary,#333); background:var(--bg-primary,#fff); }
</style>
