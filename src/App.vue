<script setup>
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useNotesStore } from './stores/notes'
import { useLibraryStore } from './stores/library'
import { useTasksStore } from './stores/tasks'
import AppShell from './components/AppShell.vue'
import AppPromptDialog from './components/AppPromptDialog.vue'

const route = useRoute(); const { locale } = useI18n(); const notes = useNotesStore(); const library = useLibraryStore(); const tasks = useTasksStore()
const active = computed(() => route.path === '/' || route.path.startsWith('/home') || route.path.startsWith('/chat') ? 'home' : route.path.startsWith('/library') ? 'library' : route.path.startsWith('/tasks') ? 'tasks' : route.path.startsWith('/settings') ? 'settings' : 'notes')
onMounted(async () => { await Promise.allSettled([notes.load(), library.load(), tasks.initialize()]) })
watch(locale, value => localStorage.setItem('tiny-note-language', value))
</script>
<template><AppShell :active="active"><router-view /></AppShell><AppPromptDialog /><div class="task-toast-region" aria-live="polite"><button v-for="notice in tasks.notices" :key="notice.id" type="button" class="task-toast" @click="tasks.dismissNotice(notice.id)">{{ notice.message }}</button></div></template>
