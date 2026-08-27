<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Bell, CalendarClock, Check, CheckCircle2, ChevronDown, ChevronRight, Circle, Inbox, List, ListTodo, LoaderCircle, Menu, MoreHorizontal, Pencil, Plus, SortAsc, Trash2, X } from 'lucide-vue-next'
import { useTodosStore } from '../stores/todos'
import { ensureReminderPermission, fromDateTimeLocal, normalizedReminder, reminderSummary, toDateTimeLocal } from '../services/reminders'
import { requestConfirmation } from '../services/appFeedback'
import { defaultQuickDue, filterTodoViewItems, groupTodos, TODO_FILTERS, TODO_SORTS, todoCounts } from '../utils/todos'
import { localDateValue } from '../utils/dateTime'
import TodoQuickScheduler from '../components/TodoQuickScheduler.vue'
import TodoListDialog from '../components/TodoListDialog.vue'

const emptyReminder = () => ({ enabled: false, mode: 'at', triggerAt: '', offsetMinutes: 10, intervalMinutes: 10 })
const store = useTodosStore()
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const { loading, error } = storeToRefs(store)
const initialFilter = TODO_FILTERS.includes(String(route.query.filter)) ? String(route.query.filter) : 'inbox'
const filter = ref(initialFilter)
const activeListId = ref(String(route.query.list || ''))
const sortMode = ref('due')
const sortOpen = ref(false)
const navOpen = ref(false)
const listsCollapsed = ref(false)
const listMenuId = ref('')
const listDialogOpen = ref(false)
const editingList = ref(null)
const listDialogSaving = ref(false)
const listDialogError = ref('')
const selectedId = ref('')
const quickTitle = ref('')
const quickStartAt = ref('')
const quickDueAt = ref(defaultQuickDue(initialFilter))
const quickReminder = ref(emptyReminder())
const quickInput = ref(null)
const quickSaving = ref(false)
const quickError = ref('')
const collapsedGroups = ref(new Set())
const suppressFormWatch = ref(false)
const dirty = ref(false)
const saveState = ref('idle')
const saveError = ref('')
const permissionWarning = ref('')
const form = reactive({ title: '', notes: '', listId: '', startAt: '', dueAt: '', priority: 'none', reminder: emptyReminder() })
let saveTimer
let editVersion = 0
let lastQueuedVersion = 0
let saveQueue = Promise.resolve(true)

const counts = computed(() => todoCounts(store.todos))
const navItems = computed(() => [
  { key: 'today', label: t('todoToday'), icon: CalendarClock, count: counts.value.today },
  { key: 'upcoming', label: t('todoRecent7'), icon: ChevronRight, count: counts.value.upcoming },
  { key: 'inbox', label: t('todoInbox'), icon: Inbox, count: counts.value.inbox }
])
const completedNav = computed(() => ({ key: 'completed', label: t('todoCompleted'), icon: CheckCircle2, count: counts.value.completed }))
const activeList = computed(() => store.listById(activeListId.value))
const heading = computed(() => activeList.value?.name || [...navItems.value, completedNav.value].find(item => item.key === filter.value)?.label || t('todoInbox'))
const headingCount = computed(() => activeList.value ? store.activeCountForList(activeList.value.id) : filter.value === 'completed' ? counts.value.completed : counts.value[filter.value] || 0)
const visible = computed(() => activeList.value ? store.itemsForList(activeList.value.id) : filterTodoViewItems(store.todos, filter.value))
const groups = computed(() => groupTodos(visible.value, activeList.value ? 'inbox' : filter.value, new Date(), sortMode.value))
const canQuickAdd = computed(() => Boolean(activeList.value) || filter.value !== 'completed')
const selected = computed(() => store.byId(selectedId.value))
const sortOptions = computed(() => [
  { key: 'due', label: t('todoSortDue') },
  { key: 'priority', label: t('todoSortPriority') },
  { key: 'created', label: t('todoSortCreated') }
])
const saveLabel = computed(() => saveState.value === 'saving' ? t('todoSaving') : saveState.value === 'error' ? t('todoSaveFailed') : saveState.value === 'saved' ? t('todoSaved') : '')

function groupLabel(key) { return t({ overdue: 'todoOverdue', today: 'todoToday', later: 'todoLater', undated: 'todoUndated', completed: 'todoCompleted' }[key]) }
function resetQuickDraft() { quickStartAt.value = ''; quickDueAt.value = defaultQuickDue(activeListId.value ? 'inbox' : filter.value); quickReminder.value = emptyReminder(); quickError.value = '' }
function fillForm(item) {
  if (!item) return
  suppressFormWatch.value = true
  clearTimeout(saveTimer)
  Object.assign(form, {
    title: item.title,
    notes: item.notes || '',
    listId: item.listId || '',
    startAt: toDateTimeLocal(item.startAt),
    dueAt: toDateTimeLocal(item.dueAt),
    priority: item.priority || 'none',
    reminder: item.reminder ? {
      enabled: item.reminder.enabled,
      mode: item.reminder.mode,
      triggerAt: toDateTimeLocal(item.reminder.triggerAt),
      offsetMinutes: item.reminder.offsetMinutes || 10,
      intervalMinutes: item.reminder.intervalMinutes || 10
    } : emptyReminder()
  })
  dirty.value = false
  saveState.value = 'idle'
  saveError.value = ''
  permissionWarning.value = ''
  editVersion += 1
  nextTick(() => { suppressFormWatch.value = false })
}
function snapshotForm(version) {
  return { id: selectedId.value, version, title: form.title, notes: form.notes, listId: form.listId || null, startAt: form.startAt, dueAt: form.dueAt, priority: form.priority, reminder: { ...form.reminder } }
}
async function persistSnapshot(snapshot) {
  if (!snapshot.id) return true
  if (!snapshot.title.trim()) {
    if (snapshot.version === editVersion) { saveState.value = 'error'; saveError.value = t('todoTitleRequired') }
    return false
  }
  try {
    if (snapshot.version === editVersion) { saveState.value = 'saving'; saveError.value = ''; permissionWarning.value = '' }
    const startAt = fromDateTimeLocal(snapshot.startAt)
    const dueAt = fromDateTimeLocal(snapshot.dueAt)
    if (startAt && (!dueAt || new Date(startAt) >= new Date(dueAt))) {
      if (snapshot.version === editVersion) { saveState.value = 'error'; saveError.value = t('todoRangeInvalid') }
      return false
    }
    let reminder = normalizedReminder(snapshot.reminder, { hasAnchor: Boolean(dueAt) })
    if (reminder && !(await ensureReminderPermission())) {
      reminder = null
      if (snapshot.id === selectedId.value && snapshot.version === editVersion) {
        suppressFormWatch.value = true
        form.reminder = { ...snapshot.reminder, enabled: false }
        permissionWarning.value = t('todoReminderPermissionDenied')
        await nextTick(); suppressFormWatch.value = false
      }
    }
    await store.update(snapshot.id, { title: snapshot.title.trim(), notes: snapshot.notes, listId: snapshot.listId, startAt, dueAt, priority: snapshot.priority, reminder })
    const movedOutOfActiveList = Boolean(activeListId.value && snapshot.listId !== activeListId.value)
    if (snapshot.id === selectedId.value && snapshot.version === editVersion) {
      dirty.value = false
      saveState.value = 'saved'
      saveError.value = ''
      if (movedOutOfActiveList) {
        selectedId.value = ''
        await router.replace({ query: { list: activeListId.value } })
      }
    }
    return true
  } catch (reason) {
    if (snapshot.id === selectedId.value && snapshot.version === editVersion) {
      saveState.value = 'error'
      saveError.value = reason?.message || String(reason)
    }
    return false
  }
}
function queueSave(version = editVersion) {
  if (version <= lastQueuedVersion) return saveQueue
  lastQueuedVersion = version
  const snapshot = snapshotForm(version)
  saveQueue = saveQueue.then(() => persistSnapshot(snapshot), () => persistSnapshot(snapshot))
  return saveQueue
}
function scheduleSave() {
  if (suppressFormWatch.value || !selectedId.value) return
  dirty.value = true
  saveState.value = 'dirty'
  saveError.value = ''
  editVersion += 1
  const version = editVersion
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => queueSave(version), 500)
}
async function flushAutoSave() {
  clearTimeout(saveTimer)
  if (!dirty.value) return saveQueue
  return queueSave(editVersion)
}
async function select(item) {
  if (item?.id === selectedId.value) return
  if (selectedId.value && !(await flushAutoSave())) return
  selectedId.value = item?.id || ''
  if (item) fillForm(item)
  await router.replace({ query: { ...(activeListId.value ? { list: activeListId.value } : { filter: filter.value }), ...(item ? { id: item.id } : {}) } })
}
async function clearSelection() {
  clearTimeout(saveTimer)
  selectedId.value = ''
  dirty.value = false
  await router.replace({ query: activeListId.value ? { list: activeListId.value } : { filter: filter.value } })
}
async function changeFilter(key) {
  if (!activeListId.value && key === filter.value) { navOpen.value = false; return }
  if (selectedId.value && !(await flushAutoSave())) return
  filter.value = key
  activeListId.value = ''
  navOpen.value = false
  selectedId.value = ''
  resetQuickDraft()
  await router.replace({ query: { filter: key } })
  await nextTick(); quickInput.value?.focus()
}
async function changeList(item) {
  if (item.id === activeListId.value) { navOpen.value = false; return }
  if (selectedId.value && !(await flushAutoSave())) return
  activeListId.value = item.id
  navOpen.value = false
  selectedId.value = ''
  resetQuickDraft()
  await router.replace({ query: { list: item.id } })
  await nextTick(); quickInput.value?.focus()
}
async function quickAdd() {
  const title = quickTitle.value.trim()
  if (!title || quickSaving.value) return
  try {
    quickSaving.value = true
    quickError.value = ''
    const startAt = fromDateTimeLocal(quickStartAt.value)
    const dueAt = fromDateTimeLocal(quickDueAt.value)
    const reminder = normalizedReminder(quickReminder.value, { hasAnchor: Boolean(dueAt) })
    if (reminder && !(await ensureReminderPermission())) throw new Error(t('todoReminderPermissionDenied'))
    await store.create({ title, notes: '', listId: activeListId.value || null, startAt, dueAt, priority: 'none', reminder })
    quickTitle.value = ''
    resetQuickDraft()
    await nextTick(); quickInput.value?.focus()
  } catch (reason) { quickError.value = reason?.message || String(reason) }
  finally { quickSaving.value = false }
}
async function toggle(item) {
  if (item.id === selectedId.value && !(await flushAutoSave())) return
  const completed = !item.completedAt
  await store.setCompleted(item.id, completed)
  if (item.id === selectedId.value) {
    if (visible.value.some(value => value.id === item.id)) fillForm(store.byId(item.id))
    else await clearSelection()
  }
}
async function remove() {
  if (!selected.value || !window.confirm(t('todoDeleteConfirm'))) return
  clearTimeout(saveTimer)
  const id = selected.value.id
  await store.remove(id)
  if (selectedId.value === id) await clearSelection()
}
function openListDialog(item = null) {
  editingList.value = item
  listDialogError.value = ''
  listDialogOpen.value = true
  listMenuId.value = ''
}
function closeListDialog() {
  if (listDialogSaving.value) return
  listDialogOpen.value = false
  editingList.value = null
  listDialogError.value = ''
}
async function saveList(input) {
  if (listDialogSaving.value) return
  try {
    listDialogSaving.value = true
    listDialogError.value = ''
    const item = editingList.value ? await store.updateList(editingList.value.id, input) : await store.createList(input)
    const created = !editingList.value
    listDialogOpen.value = false
    editingList.value = null
    listDialogError.value = ''
    if (created) await changeList(item)
  } catch (reason) {
    listDialogError.value = reason?.message || String(reason)
  } finally {
    listDialogSaving.value = false
  }
}
async function deleteList(item) {
  listMenuId.value = ''
  const confirmed = await requestConfirmation({
    title: t('todoListDeleteTitle'),
    message: t('todoListDeleteConfirm', { name: item.name }),
    tone: 'danger',
    confirmLabel: t('todoListDelete'),
    cancelLabel: t('cancel')
  })
  if (!confirmed) return
  if (selectedId.value && !(await flushAutoSave())) return
  const selectedWasInList = selected.value?.listId === item.id
  await store.deleteList(item.id)
  if (activeListId.value === item.id) {
    activeListId.value = ''
    filter.value = 'inbox'
    selectedId.value = ''
    dirty.value = false
    resetQuickDraft()
    await router.replace({ query: { filter: 'inbox' } })
  } else if (selectedWasInList && selected.value) {
    fillForm(store.byId(selected.value.id))
  }
}
function setSort(key) { if (TODO_SORTS.includes(key)) sortMode.value = key; sortOpen.value = false }
function toggleGroup(key) {
  const next = new Set(collapsedGroups.value)
  if (next.has(key)) next.delete(key); else next.add(key)
  collapsedGroups.value = next
}
function formatDue(value, startValue = '') {
  if (!value) return t('todoNoDue')
  const date = new Date(value)
  const prefix = localDateValue(date) === localDateValue() ? t('todoToday') : new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric' }).format(date)
  if (!startValue) {
    const time = new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit' }).format(date)
    return `${prefix} ${time}`
  }
  const start = new Date(startValue)
  if (Number.isNaN(start.getTime())) return prefix
  if (localDateValue(start) === localDateValue(date)) return prefix
  const format = new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric' })
  return `${format.format(start)} – ${format.format(date)}`
}
function isOverdue(item) { return !item.completedAt && item.dueAt && new Date(item.dueAt) < new Date() }
function handleDocumentClick(event) {
  if (!event.target?.closest?.('.todo-sort-wrap')) sortOpen.value = false
  if (!event.target?.closest?.('.todo-list-row-wrap')) listMenuId.value = ''
}
function handleKey(event) {
  if (event.key !== 'Escape') return
  if (sortOpen.value) sortOpen.value = false
  else if (listMenuId.value) listMenuId.value = ''
  else if (navOpen.value) navOpen.value = false
  else if (selectedId.value && window.innerWidth < 1180) clearSelection()
}

watch(form, scheduleSave, { deep: true })
onMounted(async () => {
  window.addEventListener('keydown', handleKey)
  document.addEventListener('pointerdown', handleDocumentClick)
  await store.load()
  if (activeListId.value && !store.listById(activeListId.value)) {
    activeListId.value = ''
    filter.value = 'inbox'
    await router.replace({ query: { filter: 'inbox' } })
  }
  const routeItem = route.query.id && store.byId(String(route.query.id))
  if (routeItem) { selectedId.value = routeItem.id; fillForm(routeItem) }
})
onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  if (dirty.value) queueSave(editVersion)
  window.removeEventListener('keydown', handleKey)
  document.removeEventListener('pointerdown', handleDocumentClick)
})
</script>

<template>
  <section class="todos-page">
    <button v-if="navOpen" class="todo-nav-backdrop" :aria-label="t('close')" @click="navOpen = false"></button>
    <aside class="todo-smart-lists" :class="{ open: navOpen }">
      <header><ListTodo :size="20" /><strong>{{ t('todos') }}</strong><button class="nav-close" :aria-label="t('close')" @click="navOpen = false"><X :size="18" /></button></header>
      <nav class="smart-nav">
        <button v-for="item in navItems" :key="item.key" :class="{ active: !activeListId && filter === item.key }" @click="changeFilter(item.key)"><component :is="item.icon" :size="18" /><span>{{ item.label }}</span><small>{{ item.count }}</small></button>
      </nav>
      <section class="custom-lists-section">
        <header>
          <button type="button" class="custom-lists-toggle" :aria-expanded="!listsCollapsed" :aria-label="listsCollapsed ? t('todoListsExpand') : t('todoListsCollapse')" @click="listsCollapsed = !listsCollapsed"><ChevronDown :size="15" :class="{ collapsed: listsCollapsed }" /><span>{{ t('todoLists') }}</span></button>
          <button type="button" class="custom-list-add" :aria-label="t('todoListAdd')" @click="openListDialog()"><Plus :size="17" /></button>
        </header>
        <div v-if="!listsCollapsed" class="custom-list-rows">
          <div v-for="item in store.lists" :key="item.id" class="todo-list-row-wrap" :class="{ active: activeListId === item.id }">
            <button type="button" class="custom-list-row" @click="changeList(item)"><span class="custom-list-icon" :style="{ '--list-color': item.color }"><List :size="15" /></span><span>{{ item.name }}</span><small>{{ store.activeCountForList(item.id) }}</small></button>
            <button type="button" class="custom-list-more" :aria-label="`${item.name} ${t('todoListMore')}`" :aria-expanded="listMenuId === item.id" @click.stop="listMenuId = listMenuId === item.id ? '' : item.id"><MoreHorizontal :size="16" /></button>
            <div v-if="listMenuId === item.id" class="custom-list-menu" role="menu">
              <button type="button" role="menuitem" @click="openListDialog(item)"><Pencil :size="14" />{{ t('todoListEdit') }}</button>
              <button type="button" class="danger" role="menuitem" @click="deleteList(item)"><Trash2 :size="14" />{{ t('todoListDelete') }}</button>
            </div>
          </div>
        </div>
      </section>
      <nav class="smart-nav nav-bottom">
        <button :class="{ active: !activeListId && filter === completedNav.key }" @click="changeFilter(completedNav.key)"><component :is="completedNav.icon" :size="18" /><span>{{ completedNav.label }}</span><small>{{ completedNav.count }}</small></button>
      </nav>
    </aside>

    <main class="todo-list-pane">
      <header class="todo-list-header">
        <div class="todo-heading"><button class="nav-trigger" :aria-label="t('todoOpenNavigation')" @click="navOpen = true"><Menu :size="21" /></button><div><h1>{{ heading }}</h1><small>{{ headingCount }} {{ t('todoItems') }}</small></div></div>
        <div class="todo-list-actions"><div class="todo-sort-wrap"><button :title="t('todoSort')" :aria-expanded="sortOpen" @click.stop="sortOpen = !sortOpen"><SortAsc :size="20" /></button><div v-if="sortOpen" class="todo-sort-menu" role="menu"><button v-for="option in sortOptions" :key="option.key" type="button" role="menuitemradio" :aria-checked="sortMode === option.key" @click="setSort(option.key)"><Check v-if="sortMode === option.key" :size="14" /><span>{{ option.label }}</span></button></div></div></div>
      </header>

      <form v-if="canQuickAdd" class="todo-quick" @submit.prevent="quickAdd">
        <Plus :size="22" /><input ref="quickInput" v-model="quickTitle" :placeholder="t('todoQuickPlaceholder')" :aria-label="t('todoQuickPlaceholder')">
        <TodoQuickScheduler v-model:start-at="quickStartAt" v-model:due-at="quickDueAt" v-model:reminder="quickReminder" :locale="locale" :disabled="quickSaving" />
        <button class="quick-submit" :disabled="!quickTitle.trim() || quickSaving">{{ quickSaving ? t('todoAdding') : t('add') }}</button>
      </form>
      <p v-if="quickError" class="quick-error" role="alert">{{ quickError }}</p>

      <div v-if="loading" class="todo-state"><LoaderCircle class="spin" :size="20" />{{ t('todoLoading') }}</div>
      <div v-else-if="error" class="todo-state error">{{ error }}<button @click="store.load()">{{ t('refresh') }}</button></div>
      <div v-else-if="!visible.length" class="todo-empty"><CheckCircle2 :size="38" /><strong>{{ !activeListId && filter === 'completed' ? t('todoNoCompleted') : t('todoEmpty') }}</strong><span>{{ t('todoEmptyHint') }}</span></div>
      <div v-else class="todo-groups">
        <section v-for="group in groups" :key="group.key" class="todo-group">
          <button class="todo-group-heading" :aria-expanded="!collapsedGroups.has(group.key)" @click="toggleGroup(group.key)"><ChevronDown :size="17" :class="{ collapsed: collapsedGroups.has(group.key) }" /><strong>{{ groupLabel(group.key) }}</strong><span>{{ group.items.length }}</span></button>
          <div v-if="!collapsedGroups.has(group.key)" class="todo-rows">
            <article v-for="item in group.items" :key="item.id" :class="{ active: selectedId === item.id, completed: item.completedAt }">
              <button class="todo-check" type="button" :aria-label="item.completedAt ? t('todoRestore') : t('todoMarkCompleted')" :aria-pressed="Boolean(item.completedAt)" @click="toggle(item)"><span class="todo-checkbox" :class="{ checked: item.completedAt }"><Check v-if="item.completedAt" :size="13" :stroke-width="3" /></span></button>
              <button class="todo-row-main" @click="select(item)"><span class="todo-row-title"><strong>{{ item.title }}</strong><span class="todo-priority-dot" :class="`p-${item.priority}`"></span></span><span v-if="item.notes" class="todo-notes">{{ item.notes }}</span><span class="todo-meta"><small :class="{ overdue: isOverdue(item) }">{{ formatDue(item.dueAt, item.startAt) }}</small><small v-if="item.reminder?.enabled"><Bell :size="12" />{{ reminderSummary(item.reminder, locale) }}</small></span></button>
            </article>
          </div>
        </section>
      </div>
    </main>

    <aside class="todo-detail" :class="{ open: selected }">
      <template v-if="selected">
        <header><div><small>{{ t('todoDetail') }}</small><span class="save-status" :class="saveState">{{ saveLabel }}</span></div><button class="detail-close" :aria-label="t('close')" @click="select(null)"><X :size="19" /></button></header>
        <form class="todo-detail-form" @submit.prevent>
          <label class="detail-title"><span class="sr-only">{{ t('todoTitle') }}</span><textarea v-model="form.title" rows="2" :placeholder="t('todoTitle')"></textarea></label>
          <label class="detail-notes"><span>{{ t('todoNotes') }}</span><textarea v-model="form.notes" rows="6" :placeholder="t('todoNotesPlaceholder')"></textarea></label>
          <label class="detail-property"><span><List :size="16" />{{ t('todoListAssignment') }}</span><select v-model="form.listId"><option value="">{{ t('todoListNone') }}</option><option v-for="item in store.lists" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
          <div class="detail-property"><span><CalendarClock :size="16" />{{ t('todoSchedule') }}</span><TodoQuickScheduler v-model:start-at="form.startAt" v-model:due-at="form.dueAt" v-model:reminder="form.reminder" :locale="locale" /></div>
          <label class="detail-property"><span><Circle :size="16" />{{ t('todoPriority') }}</span><select v-model="form.priority"><option value="none">{{ t('todoPriorityNone') }}</option><option value="low">{{ t('todoPriorityLow') }}</option><option value="medium">{{ t('todoPriorityMedium') }}</option><option value="high">{{ t('todoPriorityHigh') }}</option></select></label>
          <p v-if="selected.reminder && !selected.reminder.enabled" class="stopped">{{ t('todoReminderStopped') }}</p><p v-if="permissionWarning" class="permission-warning">{{ permissionWarning }}</p><p v-if="saveError" class="form-error" role="alert">{{ saveError }}</p>
        </form>
        <footer><button class="complete-action" @click="toggle(selected)"><CheckCircle2 :size="16" />{{ selected.completedAt ? t('todoRestore') : t('todoMarkCompleted') }}</button><button class="delete-action" @click="remove"><Trash2 :size="16" />{{ t('todoDeletePermanent') }}</button></footer>
      </template>
      <div v-else class="detail-placeholder"><ListTodo :size="42" /><strong>{{ t('todoSelect') }}</strong><span>{{ t('todoSelectHint') }}</span></div>
    </aside>
    <TodoListDialog :open="listDialogOpen" :item="editingList" :saving="listDialogSaving" :error="listDialogError" @close="closeListDialog" @save="saveList" />
  </section>
</template>

<style scoped>
.todos-page{position:relative;height:100%;min-height:0;display:grid;grid-template-columns:clamp(160px,18vw,220px) minmax(320px,1fr) clamp(270px,28vw,360px);background:var(--bg);color:var(--text);overflow:hidden}.todo-smart-lists,.todo-detail{box-sizing:border-box;background:var(--panel);min-height:0}.todo-smart-lists{border-right:1px solid var(--line);display:flex;flex-direction:column;padding:12px 9px}.todo-smart-lists>header{height:32px;display:flex;align-items:center;gap:8px;padding:0 9px 11px}.todo-smart-lists>header strong{font-size:15px}.nav-close{display:none;margin-left:auto;border:0;background:transparent;color:var(--muted)}.smart-nav{display:grid;gap:3px}.smart-nav button{height:38px;border:0;border-radius:8px;background:transparent;color:var(--text);display:grid;grid-template-columns:20px 1fr auto;gap:8px;align-items:center;padding:0 10px;text-align:left;font:inherit;font-size:13px}.smart-nav button:hover,.smart-nav button.active{background:var(--hover)}.smart-nav button.active{font-weight:650}.smart-nav button small{color:var(--muted);font-variant-numeric:tabular-nums}.custom-lists-section{min-height:0;flex:1;margin:14px 4px 0;padding-top:9px;border-top:1px solid var(--line);display:flex;flex-direction:column}.custom-lists-section>header{height:31px;display:flex;align-items:center;gap:4px}.custom-lists-toggle,.custom-list-add,.custom-list-more{border:0;border-radius:6px;background:transparent;color:var(--muted)}.custom-lists-toggle{min-width:0;flex:1;height:29px;display:flex;align-items:center;gap:5px;padding:0 5px;font:inherit;text-align:left}.custom-lists-toggle span{color:var(--text);font-size:12px;font-weight:650}.custom-lists-toggle svg{transition:transform .15s}.custom-lists-toggle svg.collapsed{transform:rotate(-90deg)}.custom-list-add{width:29px;height:29px;display:grid;place-items:center}.custom-lists-toggle:hover,.custom-list-add:hover,.custom-list-more:hover{background:var(--hover);color:var(--text)}.custom-list-rows{min-height:0;overflow:auto;display:grid;align-content:start;gap:2px;padding-top:2px}.todo-list-row-wrap{position:relative;border-radius:8px}.todo-list-row-wrap:hover,.todo-list-row-wrap.active{background:var(--hover)}.custom-list-row{box-sizing:border-box;width:100%;height:36px;display:grid;grid-template-columns:20px minmax(0,1fr) auto;align-items:center;gap:7px;border:0;border-radius:8px;background:transparent;color:var(--text);padding:0 29px 0 7px;font:inherit;text-align:left}.custom-list-row>span:nth-child(2){overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.custom-list-row small{color:var(--muted);font-size:11px;font-variant-numeric:tabular-nums;transition:opacity .12s}.custom-list-icon{width:20px;height:20px;display:grid;place-items:center;border-radius:5px;background:color-mix(in srgb,var(--list-color),transparent 86%);color:var(--list-color)}.custom-list-more{position:absolute;right:3px;top:4px;width:28px;height:28px;display:grid;place-items:center;opacity:0}.todo-list-row-wrap:hover .custom-list-more,.todo-list-row-wrap:focus-within .custom-list-more{opacity:1}.todo-list-row-wrap:hover .custom-list-row small,.todo-list-row-wrap:focus-within .custom-list-row small{opacity:0}.custom-list-menu{position:absolute;z-index:70;right:2px;top:34px;width:142px;display:grid;gap:2px;padding:5px;border:1px solid var(--line);border-radius:8px;background:var(--panel);box-shadow:0 12px 35px #0005}.custom-list-menu button{height:32px;display:flex;align-items:center;gap:8px;border:0;border-radius:5px;background:transparent;color:var(--text);padding:0 9px;font:inherit;font-size:12px;text-align:left}.custom-list-menu button:hover{background:var(--hover)}.custom-list-menu .danger{color:#dc4c4c}.nav-bottom{flex:none;margin-top:10px;padding-top:11px;border-top:1px solid var(--line)}
.todo-list-pane{min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--bg)}.todos-page .todo-list-header{box-sizing:border-box;height:58px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 18px;border:0}.todo-heading{display:flex;align-items:center;gap:9px;min-width:0}.todo-heading>div{display:flex;align-items:baseline;gap:7px;min-width:0}.todos-page .todo-heading h1{margin:0;font-size:20px;line-height:1.2;white-space:nowrap}.todos-page .todo-heading small{color:var(--muted)!important;font-size:10px}.nav-trigger{display:none}.todo-list-actions button,.nav-trigger{width:32px;height:32px;border:0;border-radius:7px;background:transparent;color:var(--text);place-items:center;padding:0}.todo-list-actions button{display:grid}.todo-list-actions button:hover,.nav-trigger:hover{background:var(--hover)}.todo-sort-wrap{position:relative}.todo-sort-menu{position:absolute;z-index:60;right:0;top:38px;width:165px;padding:5px;border:1px solid var(--line);border-radius:9px;background:var(--panel);box-shadow:0 12px 35px #0005}.todo-sort-menu button{width:100%;height:34px;display:grid;grid-template-columns:20px 1fr;text-align:left}.todo-sort-menu span{justify-self:start}
.todo-quick{position:relative;box-sizing:border-box;flex:none;margin:6px 18px 10px;min-height:48px;display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:10px;background:var(--panel);padding:0 8px 0 13px;transition:.16s}.todo-quick:focus-within{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent),transparent 75%)}.todo-quick>svg{color:var(--muted)}.todo-quick>input{min-width:80px;flex:1;border:0;outline:0;background:transparent;color:var(--text);font:inherit;font-size:13px}.todo-quick>input::placeholder{color:var(--muted)}.quick-submit{height:32px;border:0;border-radius:7px;background:var(--accent);color:#fff;padding:0 10px;font:inherit;font-size:11px;font-weight:650}.quick-submit:disabled{opacity:.4}.quick-error{margin:-4px 20px 7px;color:#dc4c4c;font-size:11px}.todo-state,.todo-empty,.detail-placeholder{height:100%;display:grid;place-content:center;justify-items:center;gap:8px;color:var(--muted)}.todo-state{display:flex;align-items:center}.todo-state.error{color:#dc4c4c}.todo-state.error button{border:0;background:transparent;color:var(--accent)}.todo-empty strong,.detail-placeholder strong{color:var(--text)}.todo-empty span,.detail-placeholder span{font-size:11px}
.todo-groups{min-height:0;overflow:auto;padding:2px 18px 22px}.todo-group+.todo-group{margin-top:7px}.todo-group-heading{width:100%;height:30px;display:flex;align-items:center;gap:5px;border:0;background:transparent;color:var(--text);padding:0 2px;font:inherit;text-align:left}.todo-group-heading svg{transition:.15s}.todo-group-heading svg.collapsed{transform:rotate(-90deg)}.todo-group-heading strong{font-size:13px}.todo-group-heading span{margin-left:2px;color:var(--muted);font-size:11px}.todo-rows article{display:grid;grid-template-columns:36px minmax(0,1fr);align-items:start;border-bottom:1px solid var(--line);transition:.12s}.todo-rows article:hover,.todo-rows article.active{background:var(--hover)}.todo-rows article.active{box-shadow:inset 3px 0 0 var(--accent)}.todo-rows article.completed{opacity:.58}.todos-page .todo-check,.todos-page .todo-row-main{border:0;background:transparent;color:var(--text)}.todos-page .todo-check{width:36px;height:40px;display:grid;place-items:center;padding:0;border-radius:6px;cursor:pointer}.todo-checkbox{box-sizing:border-box;width:17px;height:17px;display:grid;place-items:center;border:1.5px solid color-mix(in srgb,var(--muted),transparent 20%);border-radius:5px;background:transparent;color:#fff;transition:border-color .14s,background-color .14s,box-shadow .14s}.todo-check:hover .todo-checkbox{border-color:var(--accent);background:color-mix(in srgb,var(--accent),transparent 90%)}.todo-check:focus-visible{outline:0}.todo-check:focus-visible .todo-checkbox{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent),transparent 75%)}.todo-checkbox.checked{border-color:var(--accent);background:var(--accent)}.todo-checkbox.checked svg{display:block}.todos-page .todo-row-main{min-width:0;padding:8px 10px 9px 1px;text-align:left;font:inherit;outline:0}.todo-row-title{display:flex;align-items:center;gap:7px}.todo-row-title strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.todo-priority-dot{display:block!important;inline-size:7px!important;block-size:7px!important;min-inline-size:7px;border-radius:50%!important}.p-high{background:#d95461}.p-medium{background:#d4944e}.p-low{background:#4e8fb8}.p-none{display:none!important}.todo-notes{display:block;margin-top:3px;color:var(--muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.todo-meta{display:flex;align-items:center;gap:10px;margin-top:4px}.todo-meta small{display:flex;align-items:center;gap:4px;color:var(--muted);font-size:10px}.todo-meta small.overdue{color:#dc4c4c}.todo-rows article.completed .todo-row-title strong{text-decoration:line-through}
.todo-detail{min-width:0;border-left:1px solid var(--line);display:flex;flex-direction:column}.todo-detail>header{height:68px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 18px;border-bottom:1px solid var(--line)}.todo-detail>header>div{display:grid;gap:3px}.todo-detail>header small{color:var(--muted)}.save-status{min-height:15px;font-size:11px;color:var(--muted)}.save-status.error{color:#dc4c4c}.save-status.saved{color:#36a27a}.detail-close{display:none;width:34px;height:34px;border:0;border-radius:8px;background:transparent;color:var(--muted)}.todo-detail-form{min-height:0;overflow:auto;display:grid;align-content:start;gap:16px;padding:20px}.todo-detail-form textarea,.todo-detail-form select{box-sizing:border-box;width:100%;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--text);padding:8px;font:inherit;resize:none}.todo-detail-form textarea:hover,.todo-detail-form textarea:focus,.todo-detail-form select:hover,.todo-detail-form select:focus{outline:0;border-color:var(--line);background:var(--bg)}.detail-title textarea{font-size:20px;font-weight:650;line-height:1.35}.detail-notes{display:grid;gap:5px}.detail-notes>span{color:var(--muted);font-size:11px}.detail-notes textarea{line-height:1.55}.detail-property{display:grid;grid-template-columns:105px minmax(0,1fr);align-items:center;gap:10px}.detail-property>span{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:12px}.detail-property select{border-color:var(--line);background:var(--bg)}.todo-detail>footer{margin-top:auto;display:flex;justify-content:space-between;gap:8px;padding:14px 18px;border-top:1px solid var(--line)}.todo-detail>footer button{border:0;border-radius:8px;background:transparent;padding:8px;color:var(--muted);display:flex;align-items:center;gap:6px;font:inherit;font-size:12px}.todo-detail>footer button:hover{background:var(--hover);color:var(--text)}.todo-detail>footer .delete-action{color:#dc4c4c}.stopped,.permission-warning,.form-error{margin:0;font-size:11px;color:var(--muted)}.permission-warning{color:#b7791f}.form-error{color:#dc4c4c}.todo-nav-backdrop{display:none}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:760px){.todos-page{grid-template-columns:minmax(155px,190px) minmax(320px,1fr)}.todo-detail{position:absolute;z-index:80;right:0;top:0;bottom:0;width:min(360px,calc(100% - 64px));transform:translateX(103%);box-shadow:-18px 0 48px #0005;transition:transform .18s}.todo-detail.open{transform:translateX(0)}.detail-close{display:grid;place-items:center}}
@media(max-width:620px){.todos-page{grid-template-columns:1fr}.todo-smart-lists{position:absolute;z-index:100;left:0;top:0;bottom:0;width:min(230px,calc(100% - 48px));transform:translateX(-103%);box-shadow:18px 0 45px #0005;transition:transform .18s}.todo-smart-lists.open{transform:translateX(0)}.nav-close{display:grid;place-items:center}.nav-trigger{display:grid}.todo-nav-backdrop{position:absolute;z-index:90;inset:0;display:block;border:0;background:#0007}.todos-page .todo-list-header{padding:0 13px}.todo-quick{margin-inline:13px}.todo-groups{padding-inline:13px}}
@media(max-width:590px){.todo-heading h1{font-size:21px}.todo-heading small{display:none}.todo-quick{min-height:54px;flex-wrap:wrap;padding-block:8px}.todo-quick>input{min-width:calc(100% - 38px)}.quick-scheduler{margin-left:31px}.quick-submit{margin-left:auto}.todo-groups{padding-inline:10px}.todo-detail{width:100%}.detail-property{grid-template-columns:1fr}.todo-meta{flex-wrap:wrap}}
.todos-page{box-sizing:border-box;width:100%;max-width:100%;min-width:0;grid-template-columns:clamp(160px,18vw,220px) minmax(0,1fr) clamp(260px,26vw,350px)}
@media(max-width:760px){.todos-page{grid-template-columns:minmax(155px,190px) minmax(0,1fr)}}
@media(max-width:620px){.todos-page{grid-template-columns:minmax(0,1fr)}}
</style>
