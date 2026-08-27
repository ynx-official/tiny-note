<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listen } from '@tauri-apps/api/event'
import { useI18n } from 'vue-i18n'
import AppShell from './components/AppShell.vue'
import AppPromptDialog from './components/AppPromptDialog.vue'
import AppFeedbackHost from './components/AppFeedbackHost.vue'
const AppUpdateDialog = defineAsyncComponent(() => import('./components/AppUpdateDialog.vue'))
const AppExportLocationDialog = defineAsyncComponent(() => import('./components/AppExportLocationDialog.vue'))
const AppExportSuccessDialog = defineAsyncComponent(() => import('./components/AppExportSuccessDialog.vue'))

const route = useRoute(); const router = useRouter(); const { locale } = useI18n()
const active = computed(() => route.path === '/' || route.path.startsWith('/home') || route.path.startsWith('/chat') ? 'home' : route.path.startsWith('/library') ? 'library' : route.path.startsWith('/tags') ? 'tags' : route.path.startsWith('/calendar') ? 'calendar' : route.path.startsWith('/todos') ? 'todos' : route.path.startsWith('/images') ? 'images' : route.path.startsWith('/tasks') ? 'tasks' : route.path.startsWith('/settings') ? 'settings' : 'notes')
const deferredHostsReady = ref(false)
let unlistenNavigate: (() => void) | undefined
onMounted(async () => {
  if (window.__TAURI_INTERNALS__) {
    unlistenNavigate = await listen('tiny-note://navigate', event => {
      const target = String(event.payload || '')
      if (target.startsWith('/')) router.push(target)
    })
  }
  const schedule = window.requestIdleCallback || ((callback: IdleRequestCallback) => window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 0 }), 800))
  schedule(() => { deferredHostsReady.value = true })
})
onBeforeUnmount(() => unlistenNavigate?.())
watch(locale, value => localStorage.setItem('tiny-note-language', value))
</script>
<template>
  <AppShell :active="active"><router-view /></AppShell>
  <AppPromptDialog />
  <AppFeedbackHost />
  <template v-if="deferredHostsReady"><AppUpdateDialog /><AppExportLocationDialog /><AppExportSuccessDialog /></template>
</template>
