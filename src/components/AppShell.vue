<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { BookOpen, FileText, Settings, Plus, Minus, Square, Copy, X, PanelLeftClose, PanelLeftOpen, Home } from 'lucide-vue-next'
import AvatarDrawer from './AvatarDrawer.vue'

const props = defineProps({ active: String })
const router = useRouter()
const { t } = useI18n()
const isMac = /Macintosh|Mac OS/.test(navigator.userAgent || '')
const railCollapsed = ref(false)
const isMaximized = ref(false)
const avatarOpen = ref(false)
let appWindow = null
let stopResizeListener = null
const nav = computed(() => [{ key: 'notes', label: t('notes'), icon: FileText, path: '/notes' }, { key: 'library', label: t('library'), icon: BookOpen, path: '/library' }, { key: 'settings', label: t('settings'), icon: Settings, path: '/settings' }])
function navigate(path) { router.push(path) }

function tauriWindow() {
  if (!appWindow) {
    try { appWindow = getCurrentWindow() } catch { return null }
  }
  return appWindow
}
async function syncMaximized() {
  const current = tauriWindow()
  if (!current) return
  try { isMaximized.value = await current.isMaximized() } catch { /* browser preview or a closed native window */ }
}
async function minimizeWindow() {
  const current = tauriWindow()
  if (current) await current.minimize()
}
async function toggleMaximize() {
  const current = tauriWindow()
  if (!current) return
  await current.toggleMaximize()
  await syncMaximized()
}
async function closeWindow() {
  const current = tauriWindow()
  if (current) await current.close()
}
async function startWindowDrag(event) {
  if (event.button !== 0) return
  const target = event.target
  if (target instanceof Element && target.closest('button, a, input, select, textarea, [role="button"], [role="tab"]')) return
  const current = tauriWindow()
  if (!current) return
  try { await current.startDragging() } catch { /* browser preview or a window without drag permission */ }
}

onMounted(async () => {
  const current = tauriWindow()
  if (!current) return
  await syncMaximized()
  try { stopResizeListener = await current.onResized(syncMaximized) } catch { /* keep controls usable if event permission is unavailable */ }
})
onUnmounted(() => { if (stopResizeListener) stopResizeListener() })
</script>
<template>
  <div class="window-shell app-container">
    <header class="topbar tauri-drag-region" @mousedown="startWindowDrag">
      <div class="topbar-leading"><button class="sidebar-toggle-btn" :title="railCollapsed ? '展开导航' : '收起导航'" @click="railCollapsed = !railCollapsed"><PanelLeftOpen v-if="railCollapsed" :size="16" :stroke-width="1.8" /><PanelLeftClose v-else :size="16" :stroke-width="1.8" /></button></div>
      <div class="tab-strip"><button v-for="tab in [{ key: 'home', label: t('appName'), path: '/', icon: Home }, { key: 'notes', label: t('notes'), path: '/notes', icon: FileText }, { key: 'library', label: t('library'), path: '/library', icon: BookOpen }]" :key="tab.key" :class="['tab', { active: active === tab.key }]" @click="navigate(tab.path)"><component :is="tab.icon" :size="14" :stroke-width="1.8" /><span>{{ tab.label }}</span><span v-if="active === tab.key" class="tab-close">×</span></button><button v-if="active === 'settings'" class="tab active" @click="navigate('/settings')"><Settings :size="14" :stroke-width="1.8" /><span>{{ t('settings') }}</span><span class="tab-close">×</span></button><button class="tab-plus" :title="t('newNote')" @click="navigate('/notes?new=1')"><Plus :size="16" :stroke-width="2" /></button><div class="tabs-area-spacer"></div></div>
      <div v-if="!isMac" class="window-actions"><button aria-label="Minimize" title="Minimize" @click="minimizeWindow"><Minus :size="15" /></button><button :aria-label="isMaximized ? 'Restore' : 'Maximize'" :title="isMaximized ? 'Restore' : 'Maximize'" @click="toggleMaximize"><Copy v-if="isMaximized" :size="13" /><Square v-else :size="13" /></button><button class="close" aria-label="Close" title="Close" @click="closeWindow"><X :size="15" /></button></div>
    </header>
    <div class="app-body main-body">
      <aside class="rail sidebar" :class="{ 'is-collapsed': railCollapsed }">
        <button class="rail-avatar" aria-label="Tiny Note" @click="avatarOpen = true"><span>🐶</span><i class="avatar-status"></i></button>
        <button class="rail-add" aria-label="New" @click="navigate('/notes?new=1')"><Plus :size="18" /></button>
        <nav><button v-for="item in nav.filter(item => item.key !== 'settings')" :key="item.key" :class="['rail-item', { active: props.active === item.key }]" :title="item.label" @click="navigate(item.path)"><component :is="item.icon" :size="19" /><span>{{ item.label }}</span></button></nav>
        <div class="rail-spacer"></div>
        <button class="rail-item rail-clock" title="最近活动"><span>◷</span></button>
        <button class="rail-item" :class="{ active: props.active === 'settings' }" :title="t('settings')" @click="navigate('/settings')"><Settings :size="19" /><span>{{ t('settings') }}</span></button>
      </aside>
      <main class="content-wrap main-content"><div class="content-card content-wrapper"><slot /></div></main>
    </div>
    <AvatarDrawer v-model="avatarOpen" />
  </div>
</template>
