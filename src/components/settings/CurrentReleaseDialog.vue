<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { X } from 'lucide-vue-next'
import '../../styles/release-notes.css'

defineProps<{ version: string; date: string; html: string; chinese: boolean }>()
defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)
onMounted(() => dialog.value?.showModal())
</script>

<template>
  <dialog ref="dialog" class="current-release-dialog" aria-labelledby="current-release-title" @close="$emit('close')">
    <header>
      <div><h2 id="current-release-title">{{ chinese ? '当前版本更新内容' : 'Current release notes' }}</h2><p>v{{ version }}<span v-if="date"> · {{ date }}</span></p></div>
      <button type="button" :aria-label="chinese ? '关闭' : 'Close'" autofocus @click="dialog?.close()"><X :size="18" /></button>
    </header>
    <div v-if="html" class="current-release-content release-notes-markdown" tabindex="0" v-html="html"></div>
    <p v-else class="current-release-content">{{ chinese ? '暂无当前版本更新日志。' : 'No release notes are available for this version.' }}</p>
  </dialog>
</template>

<style scoped>
.current-release-dialog { position:fixed; inset:0; margin:auto; box-sizing:border-box; width:min(600px,calc(100vw - 40px)); max-height:80vh; padding:0; overflow:hidden; border:1px solid var(--border-subtle); border-radius:12px; color:var(--text-primary); background:var(--surface); box-shadow:0 24px 70px #0003; }
.current-release-dialog[open] { display:flex; flex-direction:column; }
.current-release-dialog::backdrop { background:rgba(15,23,42,.28); backdrop-filter:blur(3px); }
header { flex-shrink:0; display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:20px 22px; border-bottom:1px solid var(--border-subtle); }
h2 { margin:0; font-size:17px; font-weight:600; }
header p { margin:6px 0 0; color:var(--text-secondary); font-size:12px; }
button { display:grid; place-items:center; width:32px; height:32px; border-radius:6px; color:var(--text-secondary); }
button:hover { background:var(--bg-hover); }
button:focus-visible,.current-release-content:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
.current-release-content { min-height:0; margin:0; padding:20px 22px; overflow:auto; overscroll-behavior:contain; scrollbar-width:thin; }
</style>
