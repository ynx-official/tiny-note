<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { AlertCircle, BookOpen, CalendarDays, CheckCircle2, ClipboardList, FileText, ImagePlus, ListTodo, LoaderCircle, Settings, Plus, Minus, Square, Copy, X, PanelLeftClose, PanelLeftOpen, Home, Tags } from 'lucide-vue-next'
import { useTasksStore } from '../stores/tasks'
const AvatarDrawer = defineAsyncComponent(() => import('./AvatarDrawer.vue'))
const ChatHistoryDrawer = defineAsyncComponent(() => import('./ChatHistoryDrawer.vue'))

const props = defineProps<{ active?: string }>()
const router = useRouter()
const { t, te } = useI18n()
const tasksStore = useTasksStore()
const railCollapsed = ref(false)
const isMaximized = ref(false)
const avatarOpen = ref(false)
const historyOpen = ref(false)
const avatarHostReady = ref(false)
const historyHostReady = ref(false)
const taskArrival = ref(false)
let appWindow: ReturnType<typeof getCurrentWindow> | null = null
let stopResizeListener: (() => void) | null = null
let taskArrivalTimer: number | null = null
const calendarLabel = computed(() => te('calendar') ? t('calendar') : '日历')
const todosLabel = computed(() => te('todos') ? t('todos') : '待办')
const nav = computed(() => [{ key: 'notes', label: t('notes'), icon: FileText, path: '/notes' }, { key: 'library', label: t('library'), icon: BookOpen, path: '/library' }, { key: 'tags', label: t('tags'), icon: Tags, path: '/tags' }, { key: 'calendar', label: calendarLabel.value, icon: CalendarDays, path: '/calendar' }, { key: 'todos', label: todosLabel.value, icon: ClipboardList, path: '/todos' }, { key: 'images', label: '生图', icon: ImagePlus, path: '/images' }, { key: 'tasks', label: '任务中心', icon: ListTodo, path: '/tasks' }, { key: 'settings', label: t('settings'), icon: Settings, path: '/settings' }])
function navigate(path: string) { router.push(path) }
function openAvatar() {
  avatarHostReady.value = true
  avatarOpen.value = true
}
function toggleHistory() {
  historyHostReady.value = true
  historyOpen.value = !historyOpen.value
}
function openTaskCenter() {
  tasksStore.markResultsSeen()
  router.push('/tasks')
}
function openConversation(id: string) { router.push({ path: '/chat', query: { id } }) }
function closeHistoryOnOutsideClick(event: PointerEvent) {
  if (!historyOpen.value || !(event.target instanceof Element)) return
  if (event.target.closest('.history-drawer, .rail-clock')) return
  historyOpen.value = false
}
function handleTaskArrival() {
  taskArrival.value = true
  if (taskArrivalTimer !== null) window.clearTimeout(taskArrivalTimer)
  taskArrivalTimer = window.setTimeout(() => { taskArrival.value = false }, 700)
}

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
async function startWindowDrag(event: MouseEvent) {
  if (event.button !== 0) return
  const target = event.target
  if (target instanceof Element && target.closest('button, a, input, select, textarea, [role="button"], [role="tab"]')) return
  const current = tauriWindow()
  if (!current) return
  try { await current.startDragging() } catch { /* browser preview or a window without drag permission */ }
}

onMounted(async () => {
  document.addEventListener('pointerdown', closeHistoryOnOutsideClick)
  window.addEventListener('tiny-note-task-flight-arrival', handleTaskArrival)
  const current = tauriWindow()
  if (!current) return
  await syncMaximized()
  try { stopResizeListener = await current.onResized(syncMaximized) } catch { /* keep controls usable if event permission is unavailable */ }
})
onUnmounted(() => { if (stopResizeListener) stopResizeListener(); if (taskArrivalTimer !== null) window.clearTimeout(taskArrivalTimer); window.removeEventListener('tiny-note-task-flight-arrival', handleTaskArrival); document.removeEventListener('pointerdown', closeHistoryOnOutsideClick) })
</script>
<template>
  <div class="window-shell app-container">
    <header class="topbar tauri-drag-region" @mousedown="startWindowDrag">
      <div class="topbar-leading"><button class="sidebar-toggle-btn" :title="railCollapsed ? '展开导航' : '收起导航'" @click="railCollapsed = !railCollapsed"><PanelLeftOpen v-if="railCollapsed" :size="16" :stroke-width="1.8" /><PanelLeftClose v-else :size="16" :stroke-width="1.8" /></button></div>
      <div class="tab-strip"><button v-for="tab in [{ key: 'home', label: t('appName'), path: '/', icon: Home }, { key: 'notes', label: t('notes'), path: '/notes', icon: FileText }, { key: 'library', label: t('library'), path: '/library', icon: BookOpen }, { key: 'tags', label: t('tags'), path: '/tags', icon: Tags }, { key: 'calendar', label: calendarLabel, path: '/calendar', icon: CalendarDays }, { key: 'todos', label: todosLabel, path: '/todos', icon: ClipboardList }]" :key="tab.key" :class="['tab', { active: active === tab.key }]" @click="navigate(tab.path)"><component :is="tab.icon" :size="14" :stroke-width="1.8" /><span>{{ tab.label }}</span><span v-if="active === tab.key" class="tab-close">×</span></button><button v-if="active === 'settings'" class="tab active" @click="navigate('/settings')"><Settings :size="14" :stroke-width="1.8" /><span>{{ t('settings') }}</span><span class="tab-close">×</span></button><button class="tab-plus" :title="t('newNote')" @click="navigate('/notes?new=1')"><Plus :size="16" :stroke-width="2" /></button><div class="tabs-area-spacer"></div></div>
      <div class="window-actions"><button aria-label="Minimize" title="Minimize" @click="minimizeWindow"><Minus :size="15" /></button><button :aria-label="isMaximized ? 'Restore' : 'Maximize'" :title="isMaximized ? 'Restore' : 'Maximize'" @click="toggleMaximize"><Copy v-if="isMaximized" :size="13" /><Square v-else :size="13" /></button><button class="close" aria-label="Close" title="Close" @click="closeWindow"><X :size="15" /></button></div>
    </header>
    <div class="app-body main-body">
      <aside class="rail sidebar" :class="{ 'is-collapsed': railCollapsed }">
        <button class="rail-avatar" aria-label="Tiny Note" @click="openAvatar"><span>🐶</span><i class="avatar-status"></i></button>
        <button class="rail-add" aria-label="New" @click="navigate('/notes?new=1')"><Plus :size="18" /></button>
        <nav><button v-for="item in nav.filter(item => !['settings', 'tasks'].includes(item.key))" :key="item.key" :class="['rail-item', { active: props.active === item.key }]" :title="item.label" :aria-label="item.label" @click="navigate(item.path)"><component :is="item.icon" :size="19" /><span>{{ item.label }}</span></button></nav>
        <div class="rail-spacer"></div>
        <button data-task-center-target class="rail-item rail-tasks" :class="{ active: props.active === 'tasks', 'has-running-task': tasksStore.runningCount, 'task-center-arrival': taskArrival, 'has-failed-task': tasksStore.failedCount }" title="任务中心" aria-label="任务中心" @click="openTaskCenter"><AlertCircle v-if="tasksStore.failedCount" class="rail-task-state is-failed" :size="20" /><LoaderCircle v-else-if="tasksStore.runningCount" class="rail-task-state is-running" :size="20" /><CheckCircle2 v-else-if="tasksStore.unreadSucceededCount && !tasksStore.waitingCount" class="rail-task-state is-succeeded" :size="20" /><ListTodo v-else :size="19" /><span>任务中心</span><b v-if="tasksStore.failedCount || tasksStore.waitingCount" class="rail-task-badge" :class="{ 'is-failed': tasksStore.failedCount }">{{ Math.min(tasksStore.failedCount || tasksStore.waitingCount, 99) }}</b></button>
        <button class="rail-item rail-clock" :class="{ active: historyOpen }" title="历史记录" @click="toggleHistory"><span>◷</span></button>
        <button class="rail-item" :class="{ active: props.active === 'settings' }" :title="t('settings')" @click="navigate('/settings')"><Settings :size="19" /><span>{{ t('settings') }}</span></button>
      </aside>
      <main class="content-wrap main-content"><div class="content-card content-wrapper"><slot /></div></main>
    </div>
    <AvatarDrawer v-if="avatarHostReady" v-model="avatarOpen" />
    <ChatHistoryDrawer v-if="historyHostReady" v-model="historyOpen" @open="openConversation" />
  </div>
</template>
