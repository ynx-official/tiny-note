import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { CalendarClock, CheckCircle2, ChevronRight, Inbox } from 'lucide-vue-next'
import { useTodosStore } from '../stores/todos'
import { ensureReminderPermission, fromDateTimeLocal, normalizedReminder, reminderSummary, toDateTimeLocal } from '../services/reminders'
import { requestConfirmation } from '../services/appFeedback'
import { defaultQuickDue, filterTodoViewItems, groupTodos, TODO_FILTERS, TODO_SORTS, todoCounts } from '../utils/todos'
import { localDateValue } from '../utils/dateTime'
import { errorMessage, type Todo, type TodoList } from '../types/domain'

interface ReminderDraft { enabled: boolean; mode: string; triggerAt: string; offsetMinutes: number; intervalMinutes: number }
interface TodoSnapshot { id: string; version: number; title: string; notes: string; listId: string | null; startAt: string; dueAt: string; priority: string; reminder: ReminderDraft }

export function useTodosWorkspace() {
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
  const editingList = ref<TodoList | null>(null)
  const listDialogSaving = ref(false)
  const listDialogError = ref('')
  const selectedId = ref('')
  const quickTitle = ref('')
  const quickStartAt = ref('')
  const quickDueAt = ref(defaultQuickDue(initialFilter))
  const quickReminder = ref(emptyReminder())
  const quickInput = ref<HTMLInputElement | null>(null)
  const quickSaving = ref(false)
  const quickError = ref('')
  const collapsedGroups = ref(new Set<string>())
  const suppressFormWatch = ref(false)
  const dirty = ref(false)
  const saveState = ref('idle')
  const saveError = ref('')
  const permissionWarning = ref('')
  const form = reactive({ title: '', notes: '', listId: '', startAt: '', dueAt: '', priority: 'none', reminder: emptyReminder() })
  let saveTimer: number | undefined
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
  const headingCount = computed(() => activeList.value ? store.activeCountForList(activeList.value.id) : filter.value === 'completed' ? counts.value.completed : (counts.value as Record<string, number>)[filter.value] || 0)
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
  
  const groupLabels: Record<string, string> = { overdue: 'todoOverdue', today: 'todoToday', later: 'todoLater', undated: 'todoUndated', completed: 'todoCompleted' }
  function groupLabel(key: string) { return t(groupLabels[key] || key) }
  function resetQuickDraft() { quickStartAt.value = ''; quickDueAt.value = defaultQuickDue(activeListId.value ? 'inbox' : filter.value); quickReminder.value = emptyReminder(); quickError.value = '' }
  function fillForm(item: Todo | undefined) {
    if (!item) return
    suppressFormWatch.value = true
    if (saveTimer !== undefined) window.clearTimeout(saveTimer)
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
  function snapshotForm(version: number): TodoSnapshot {
    return { id: selectedId.value, version, title: form.title, notes: form.notes, listId: form.listId || null, startAt: form.startAt, dueAt: form.dueAt, priority: form.priority, reminder: { ...form.reminder } }
  }
  async function persistSnapshot(snapshot: TodoSnapshot) {
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
        saveError.value = errorMessage(reason, String(reason))
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
    if (saveTimer !== undefined) window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => queueSave(version), 500)
  }
  async function flushAutoSave() {
    if (saveTimer !== undefined) window.clearTimeout(saveTimer)
    if (!dirty.value) return saveQueue
    return queueSave(editVersion)
  }
  async function select(item: Todo | null) {
    if (item?.id === selectedId.value) return
    if (selectedId.value && !(await flushAutoSave())) return
    selectedId.value = item?.id || ''
    if (item) fillForm(item)
    await router.replace({ query: { ...(activeListId.value ? { list: activeListId.value } : { filter: filter.value }), ...(item ? { id: item.id } : {}) } })
  }
  async function clearSelection() {
    if (saveTimer !== undefined) window.clearTimeout(saveTimer)
    selectedId.value = ''
    dirty.value = false
    await router.replace({ query: activeListId.value ? { list: activeListId.value } : { filter: filter.value } })
  }
  async function changeFilter(key: string) {
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
  async function changeList(item: TodoList) {
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
    } catch (reason) { quickError.value = errorMessage(reason, String(reason)) }
    finally { quickSaving.value = false }
  }
  async function toggle(item: Todo) {
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
    if (saveTimer !== undefined) window.clearTimeout(saveTimer)
    const id = selected.value.id
    await store.remove(id)
    if (selectedId.value === id) await clearSelection()
  }
  function openListDialog(item: TodoList | null = null) {
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
  async function saveList(input: Partial<TodoList>) {
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
      listDialogError.value = errorMessage(reason, String(reason))
    } finally {
      listDialogSaving.value = false
    }
  }
  async function deleteList(item: TodoList) {
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
  function setSort(key: string) { if (TODO_SORTS.includes(key)) sortMode.value = key; sortOpen.value = false }
  function toggleGroup(key: string) {
    const next = new Set(collapsedGroups.value)
    if (next.has(key)) next.delete(key); else next.add(key)
    collapsedGroups.value = next
  }
  function formatDue(value: string | null, startValue: string | null = '') {
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
  function isOverdue(item: Todo) { return !item.completedAt && item.dueAt && new Date(item.dueAt) < new Date() }
  function handleDocumentClick(event: PointerEvent) {
    const target = event.target instanceof Element ? event.target : null
    if (!target?.closest('.todo-sort-wrap')) sortOpen.value = false
    if (!target?.closest('.todo-list-row-wrap')) listMenuId.value = ''
  }
  function handleKey(event: KeyboardEvent) {
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
    if (saveTimer !== undefined) window.clearTimeout(saveTimer)
    if (dirty.value) queueSave(editVersion)
    window.removeEventListener('keydown', handleKey)
    document.removeEventListener('pointerdown', handleDocumentClick)
  })
  return {
    store, t, locale, loading, error, filter, activeListId, sortMode, sortOpen, navOpen,
    listsCollapsed, listMenuId, listDialogOpen, editingList, listDialogSaving, listDialogError,
    selectedId, quickTitle, quickStartAt, quickDueAt, quickReminder, quickInput, quickSaving,
    quickError, collapsedGroups, form, saveState, saveError, permissionWarning, navItems,
    completedNav, heading, headingCount, visible, groups, canQuickAdd, selected, sortOptions,
    saveLabel, groupLabel, changeFilter, openListDialog, changeList, deleteList, setSort,
    quickAdd, toggleGroup, toggle, select, formatDue, isOverdue, remove, closeListDialog,
    saveList, reminderSummary
  }}

export type TodosWorkspace = ReturnType<typeof useTodosWorkspace>
