<script setup>
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listen } from '@tauri-apps/api/event'
import { useI18n } from 'vue-i18n'
import { useNotesStore } from './stores/notes'
import { useLibraryStore } from './stores/library'
import { useTasksStore } from './stores/tasks'
import AppShell from './components/AppShell.vue'
import AppPromptDialog from './components/AppPromptDialog.vue'
import AppFeedbackHost from './components/AppFeedbackHost.vue'
import AppUpdateDialog from './components/AppUpdateDialog.vue'
import AppExportLocationDialog from './components/AppExportLocationDialog.vue'
import AppExportSuccessDialog from './components/AppExportSuccessDialog.vue'
import TrayTodoPanel from './components/TrayTodoPanel.vue'

const route = useRoute(); const router = useRouter(); const { locale } = useI18n(); const notes = useNotesStore(); const library = useLibraryStore(); const tasks = useTasksStore()
const isTrayPanel = Boolean(window.__TINY_NOTE_TRAY_PANEL__)
const active = computed(() => route.path === '/' || route.path.startsWith('/home') || route.path.startsWith('/chat') ? 'home' : route.path.startsWith('/library') ? 'library' : route.path.startsWith('/tags') ? 'tags' : route.path.startsWith('/calendar') ? 'calendar' : route.path.startsWith('/todos') ? 'todos' : route.path.startsWith('/images') ? 'images' : route.path.startsWith('/tasks') ? 'tasks' : route.path.startsWith('/settings') ? 'settings' : 'notes')
let unlistenNavigate
onMounted(async () => {
  if (isTrayPanel) return
  if (window.__TAURI_INTERNALS__) {
    unlistenNavigate = await listen('tiny-note://navigate', event => {
      const target = String(event.payload || '')
      if (target.startsWith('/')) router.push(target)
    })
  }
  await Promise.allSettled([notes.load(), library.load(), tasks.initialize()])
})
onBeforeUnmount(() => unlistenNavigate?.())
watch(locale, value => localStorage.setItem('tiny-note-language', value))
</script>
<template>
  <TrayTodoPanel v-if="isTrayPanel" />
  <template v-else><AppShell :active="active"><router-view /></AppShell><AppPromptDialog /><AppFeedbackHost /><AppUpdateDialog /><AppExportLocationDialog /><AppExportSuccessDialog /></template>
</template>
