<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNotesStore } from '../../stores/notes'
import { Check, LoaderCircle } from 'lucide-vue-next'

const props = defineProps<{ noteId: string; sourceDirty?: boolean }>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
const store = useNotesStore()
const state = computed(() => store.saveStates[props.noteId])
const status = computed(() => props.sourceDirty ? 'pending' : state.value?.status)
const label = computed(() => t(status.value === 'saving' ? 'saving' : status.value === 'saved' ? 'save' : status.value === 'pending' ? 'noteSavePending' : status.value === 'error' ? 'noteSaveError' : 'noteAutoSaveReady'))
</script>

<template>
  <span class="note-auto-save" role="status" aria-live="polite">
    <button v-if="status === 'error'" type="button" :title="state?.error" @click="emit('retry')">{{ label }}</button>
    <span v-else><Check v-if="status === 'saved'" class="save-check" :size="14" aria-hidden="true" /><LoaderCircle v-else-if="status === 'saving'" class="save-spinner" :size="13" aria-hidden="true" />{{ label }}</span>
  </span>
</template>

<style scoped>
.note-auto-save { margin-left:auto; flex-shrink:0; font-size:11px; font-weight:400; color:var(--text-secondary); }
.note-auto-save > span { display:inline-flex; align-items:center; gap:4px; }
.save-check { color:var(--success-color, #32805b); }
.save-spinner { animation:save-spin 1s linear infinite; }
@keyframes save-spin { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .save-spinner { animation:none; } }
.note-auto-save button { padding:0; border:0; background:transparent; color:var(--danger-color, #b94032); font:inherit; cursor:pointer; }
.note-auto-save button:hover { text-decoration:underline; }
.note-auto-save button:focus-visible { outline:2px solid var(--accent-color); outline-offset:3px; }
</style>
