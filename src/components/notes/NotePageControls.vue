<script setup lang="ts">
import type { NotePageState } from '../../services/notePage'
import { useDelayedBusy } from '../../composables/useDelayedBusy'
const props = defineProps<{ page: NotePageState }>()
const showLoading = useDelayedBusy(() => props.page.loading)
defineEmits<{ more: []; retry: [] }>()
</script>
<template>
  <div v-if="page.error || page.hasMore || (showLoading && !page.items.length)" class="note-page-controls" :aria-busy="page.loading">
    <p v-if="page.error" role="alert">{{ page.error }} <button type="button" @click="$emit('retry')">重试</button></p>
    <button v-else-if="page.hasMore" type="button" :disabled="page.loading" @click="$emit('more')">{{ showLoading ? '正在加载笔记…' : '加载更多' }}</button>
    <span v-else-if="showLoading" role="status">正在加载笔记…</span>
  </div>
</template>
<style scoped>
.note-page-controls { display:flex; align-items:center; justify-content:center; gap:12px; padding:12px; color:var(--text-tertiary,#777); font-size:12px; }
.note-page-controls p { margin:0; }
.note-page-controls button { min-width:110px; padding:5px 10px; border:1px solid var(--border-color,#ddd); border-radius:6px; color:var(--text-primary,#333); background:var(--bg-primary,#fff); }
.note-page-controls button:disabled { color:var(--text-tertiary,#777); cursor:default; }
</style>
