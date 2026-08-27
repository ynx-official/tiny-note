<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { CalendarDays, Check, ChevronDown, Inbox, ListTodo, LoaderCircle, Plus, Settings } from 'lucide-vue-next'
import { listen } from '@tauri-apps/api/event'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '../services/tauri'
import { useTodosStore } from '../stores/todos'
import { sortTodos } from '../utils/todos'
import { localDateValue } from '../utils/dateTime'
import { errorMessage, type Todo } from '../types/domain'

const store = useTodosStore()
const { t, locale } = useI18n()
const selectedListId = ref('')
const listMenuOpen = ref(false)
const completedOpen = ref(true)
const quickTitle = ref('')
const quickInput = ref<HTMLInputElement | null>(null)
const saving = ref(false)
const actionError = ref('')
let unlistenTrayOpen: UnlistenFn | undefined

const selectedList = computed(() => store.listById(selectedListId.value))
const panelTitle = computed(() => selectedList.value?.name || t('todoInbox'))
const scopedTodos = computed(() => selectedListId.value
  ? store.todos.filter(item => item.listId === selectedListId.value)
  : store.todos)
const activeTodos = computed(() => sortTodos(scopedTodos.value.filter(item => !item.completedAt)))
const completedTodos = computed(() => sortTodos(scopedTodos.value.filter(item => item.completedAt), 'created'))

function selectList(id = '') {
  selectedListId.value = id
  listMenuOpen.value = false
  nextTick(() => quickInput.value?.focus())
}

function formatDue(item: Todo) {
  if (!item.dueAt) return ''
  const date = new Date(item.dueAt)
  if (Number.isNaN(date.getTime())) return ''
  const today = localDateValue()
  const itemDay = localDateValue(date)
  const time = new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit' }).format(date)
  if (itemDay === today) return `${t('todoToday')} ${time}`
  const day = new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric' }).format(date)
  return `${day} ${time}`
}

function isOverdue(item: Todo) {
  return Boolean(!item.completedAt && item.dueAt && new Date(item.dueAt) < new Date())
}

async function refresh() {
  try {
    actionError.value = ''
    await store.load()
    if (selectedListId.value && !store.listById(selectedListId.value)) selectedListId.value = ''
  } catch (error) {
    actionError.value = errorMessage(error, String(error))
  }
}

async function quickAdd() {
  const title = quickTitle.value.trim()
  if (!title || saving.value) return
  try {
    saving.value = true
    actionError.value = ''
    await store.create({
      title,
      notes: '',
      listId: selectedListId.value || null,
      startAt: null,
      dueAt: null,
      priority: 'none',
      reminder: null
    })
    quickTitle.value = ''
    await nextTick()
    quickInput.value?.focus()
  } catch (error) {
    actionError.value = errorMessage(error, String(error))
  } finally {
    saving.value = false
  }
}

async function toggleTodo(item: Todo) {
  try {
    actionError.value = ''
    await store.setCompleted(item.id, !item.completedAt)
  } catch (error) {
    actionError.value = errorMessage(error, String(error))
  }
}

async function openMain(route: string) {
  try {
    await invoke('tray_open_main', { route })
  } catch (error) {
    actionError.value = errorMessage(error, String(error))
  }
}

function openTodo(item: Todo) {
  const scope = selectedListId.value
    ? `list=${encodeURIComponent(selectedListId.value)}`
    : `filter=${item.completedAt ? 'completed' : 'inbox'}`
  return openMain(`/todos?${scope}&id=${encodeURIComponent(item.id)}`)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') listMenuOpen.value = false
}

onMounted(async () => {
  document.documentElement.classList.add('tray-panel-root')
  document.body.classList.add('tray-panel-body')
  window.addEventListener('keydown', handleKeydown)
  await refresh()
  await nextTick()
  quickInput.value?.focus()
  if (window.__TAURI_INTERNALS__) {
    unlistenTrayOpen = await listen('tiny-note://tray-open', async () => {
      await refresh()
      await nextTick()
      quickInput.value?.focus()
    })
  }
})

onBeforeUnmount(() => {
  document.documentElement.classList.remove('tray-panel-root')
  document.body.classList.remove('tray-panel-body')
  window.removeEventListener('keydown', handleKeydown)
  unlistenTrayOpen?.()
})
</script>

<template>
  <main class="tray-todo-panel">
    <header class="tray-panel-header">
      <div class="tray-list-picker">
        <button type="button" class="tray-list-trigger" :aria-expanded="listMenuOpen" @click="listMenuOpen = !listMenuOpen">
          <span>{{ panelTitle }}</span><ChevronDown :size="17" />
        </button>
        <div v-if="listMenuOpen" class="tray-list-menu" role="menu">
          <button type="button" role="menuitemradio" :aria-checked="!selectedListId" @click="selectList()">
            <Inbox :size="16" /><span>{{ t('todoInbox') }}</span><Check v-if="!selectedListId" :size="15" />
          </button>
          <button v-for="list in store.lists" :key="list.id" type="button" role="menuitemradio" :aria-checked="selectedListId === list.id" @click="selectList(list.id)">
            <span class="tray-list-dot" :style="{ background: list.color }"></span><span>{{ list.name }}</span><Check v-if="selectedListId === list.id" :size="15" />
          </button>
        </div>
      </div>
      <button type="button" class="tray-open-full" :title="t('trayTodoOpenFull')" @click="openMain('/todos')"><ListTodo :size="20" /></button>
    </header>

    <form class="tray-quick-add" @submit.prevent="quickAdd">
      <Plus :size="20" />
      <input ref="quickInput" v-model="quickTitle" :placeholder="t('todoQuickPlaceholder')" :aria-label="t('todoQuickPlaceholder')" />
      <LoaderCircle v-if="saving" class="tray-spin" :size="16" />
    </form>

    <p v-if="actionError" class="tray-panel-error" role="alert">{{ actionError }}</p>

    <section class="tray-todo-scroll">
      <div v-if="store.loading" class="tray-panel-state"><LoaderCircle class="tray-spin" :size="20" />{{ t('todoLoading') }}</div>
      <template v-else>
        <div v-if="activeTodos.length" class="tray-todo-rows">
          <article v-for="item in activeTodos" :key="item.id" class="tray-todo-row">
            <button type="button" class="tray-check" :aria-label="t('todoMarkCompleted')" @click="toggleTodo(item)"><span></span></button>
            <button type="button" class="tray-row-main" @click="openTodo(item)">
              <strong>{{ item.title }}</strong>
              <small v-if="formatDue(item)" :class="{ overdue: isOverdue(item) }">{{ formatDue(item) }}</small>
            </button>
          </article>
        </div>
        <div v-else class="tray-panel-empty">
          <Check :size="26" /><strong>{{ t('todoEmpty') }}</strong><span>{{ t('todoEmptyHint') }}</span>
        </div>

        <section v-if="completedTodos.length" class="tray-completed">
          <button type="button" class="tray-section-heading" :aria-expanded="completedOpen" @click="completedOpen = !completedOpen">
            <ChevronDown :size="16" :class="{ collapsed: !completedOpen }" /><span>{{ t('todoCompleted') }}</span><small>{{ completedTodos.length }}</small>
          </button>
          <div v-if="completedOpen" class="tray-todo-rows completed">
            <article v-for="item in completedTodos" :key="item.id" class="tray-todo-row">
              <button type="button" class="tray-check checked" :aria-label="t('todoRestore')" @click="toggleTodo(item)"><span><Check :size="12" :stroke-width="3" /></span></button>
              <button type="button" class="tray-row-main" @click="openTodo(item)">
                <strong>{{ item.title }}</strong><small v-if="formatDue(item)">{{ formatDue(item) }}</small>
              </button>
            </article>
          </div>
        </section>
      </template>
    </section>

    <footer class="tray-panel-nav">
      <button type="button" class="active" :title="t('todos')" @click="openMain('/todos')"><Check :size="21" :stroke-width="3" /></button>
      <button type="button" :title="t('calendar')" @click="openMain('/calendar')"><CalendarDays :size="21" /></button>
      <button type="button" :title="t('settings')" @click="openMain('/settings')"><Settings :size="21" /></button>
    </footer>
  </main>
</template>

<style scoped>
:global(html.tray-panel-root),:global(body.tray-panel-body),:global(body.tray-panel-body #app){width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;background:var(--surface)}
.tray-todo-panel{width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden;border:1px solid color-mix(in srgb,var(--line),#000 6%);border-radius:16px;background:color-mix(in srgb,var(--surface) 97%,transparent);color:var(--text);box-shadow:0 18px 55px rgba(0,0,0,.18);font-size:13px}
.tray-panel-header{position:relative;flex:none;height:70px;display:flex;align-items:center;justify-content:space-between;padding:9px 22px 0}.tray-list-picker{position:relative;min-width:0}.tray-list-trigger{max-width:290px;height:42px;display:flex;align-items:center;gap:7px;border-radius:9px;padding:0 5px;font-size:24px;font-weight:700;letter-spacing:-.03em}.tray-list-trigger span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tray-list-trigger svg{flex:none;color:var(--muted)}.tray-list-trigger:hover,.tray-open-full:hover{background:var(--hover)}.tray-open-full{width:36px;height:36px;display:grid;place-items:center;border-radius:9px;color:var(--muted)}
.tray-list-menu{position:absolute;z-index:20;left:0;top:44px;width:230px;max-height:250px;overflow:auto;display:grid;gap:2px;padding:5px;border:1px solid var(--line);border-radius:10px;background:var(--surface);box-shadow:0 14px 38px rgba(0,0,0,.17)}.tray-list-menu button{height:36px;display:grid;grid-template-columns:18px minmax(0,1fr) 18px;align-items:center;gap:8px;padding:0 9px;border-radius:7px;text-align:left}.tray-list-menu button:hover{background:var(--hover)}.tray-list-menu button>span:nth-child(2){overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tray-list-dot{width:10px;height:10px;border-radius:4px;justify-self:center}
.tray-quick-add{height:48px;flex:none;display:flex;align-items:center;gap:8px;margin:9px 22px 10px;padding:0 15px;border:1px solid transparent;border-radius:12px;background:var(--surface-2);color:var(--muted);transition:.15s}.tray-quick-add:focus-within{border-color:color-mix(in srgb,var(--accent),transparent 35%);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent),transparent 84%)}.tray-quick-add input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:var(--text);font-size:13px}.tray-quick-add input::placeholder{color:var(--text-tertiary)}
.tray-panel-error{flex:none;margin:0 24px 7px;color:#dc4c4c;font-size:11px}.tray-todo-scroll{min-height:0;flex:1;overflow:auto;padding:0 14px 14px}.tray-todo-scroll::-webkit-scrollbar{width:5px}.tray-todo-scroll::-webkit-scrollbar-thumb{border-radius:5px;background:var(--line)}.tray-todo-rows{display:grid}.tray-todo-row{min-height:46px;display:grid;grid-template-columns:40px minmax(0,1fr);align-items:start;border-radius:9px}.tray-todo-row:hover{background:var(--hover)}.tray-check{width:40px;height:44px;display:grid;place-items:center}.tray-check>span{width:18px;height:18px;display:grid;place-items:center;border:1.5px solid var(--text-tertiary);border-radius:6px;color:#fff;transition:.14s}.tray-check:hover>span{border-color:var(--accent);background:var(--accent-soft)}.tray-check.checked>span{border-color:var(--accent);background:var(--accent)}.tray-row-main{min-width:0;min-height:44px;display:flex;align-items:center;gap:9px;padding:0 10px 0 0;text-align:left}.tray-row-main strong{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:520}.tray-row-main small{flex:none;color:var(--text-tertiary);font-size:11px}.tray-row-main small.overdue{color:#e5484d}.tray-todo-rows.completed{opacity:.54}.tray-todo-rows.completed .tray-row-main strong{text-decoration:line-through}
.tray-completed{margin-top:8px}.tray-section-heading{width:100%;height:36px;display:flex;align-items:center;gap:6px;padding:0 8px;color:var(--muted);text-align:left}.tray-section-heading svg{transition:.15s}.tray-section-heading svg.collapsed{transform:rotate(-90deg)}.tray-section-heading span{font-weight:600}.tray-section-heading small{margin-left:2px}.tray-panel-state,.tray-panel-empty{min-height:150px;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--muted)}.tray-panel-empty{flex-direction:column;text-align:center}.tray-panel-empty svg{color:var(--accent)}.tray-panel-empty strong{color:var(--text);font-size:14px}.tray-panel-empty span{font-size:11px}
.tray-panel-nav{height:58px;flex:none;display:grid;grid-template-columns:repeat(3,1fr);align-items:center;border-top:1px solid var(--line);background:color-mix(in srgb,var(--surface) 97%,transparent)}.tray-panel-nav button{width:42px;height:38px;display:grid;place-items:center;justify-self:center;border-radius:10px;color:var(--text-tertiary)}.tray-panel-nav button:hover{background:var(--hover);color:var(--text)}.tray-panel-nav button.active{background:var(--accent);color:#fff;box-shadow:0 5px 14px color-mix(in srgb,var(--accent),transparent 66%)}
.tray-spin{animation:tray-spin 1s linear infinite}@keyframes tray-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.tray-spin{animation-duration:.01ms}.tray-section-heading svg,.tray-check>span{transition-duration:.01ms}}
</style>
