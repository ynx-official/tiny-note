<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, type CSSProperties } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Bell, CalendarDays, CalendarRange, Check, ChevronDown, ChevronLeft, ChevronRight, List, LoaderCircle, Plus, Trash2, X } from 'lucide-vue-next'
import { EVENT_COLORS, useCalendarStore } from '../stores/calendar'
import { useTodosStore } from '../stores/todos'
import { addDays, formatDate, isInDateRange, lunarLabelForDate, monthWeekRows, startOfWeek, todoCalendarItems, weekDays, yearMonths } from '../utils/calendar'
import { ensureReminderPermission, normalizedReminder } from '../services/reminders'
import ReminderEditor from '../components/ReminderEditor.vue'
import DateTimePicker from '../components/DateTimePicker.vue'
import { compareLocalEventTimes, defaultEventSchedule, shiftEventStart } from '../utils/dateTime'
import { errorMessage, type CalendarEvent } from '../types/domain'
import type { CalendarDisplayItem } from '../utils/calendar'

interface CalendarContext { visible: boolean; x: number; y: number; item: CalendarDisplayItem | null }
interface CalendarOverflow { visible: boolean; x: number; y: number; date: string; items: CalendarDisplayItem[] }
interface MonthSegment { item: CalendarDisplayItem; startColumn: number; span: number; lane: number }

const router = useRouter()
const calendar = useCalendarStore()
const todosStore = useTodosStore()
const { events, loading, error } = storeToRefs(calendar)
const anchor = ref(new Date())
const view = ref(localStorage.getItem('tiny-note-calendar-view') || 'month')
const viewMenu = ref(false)
const modal = ref(false)
const saving = ref(false)
const formError = ref('')
const selection = reactive({ active: false, start: '', end: '' })
const context = reactive<CalendarContext>({ visible: false, x: 0, y: 0, item: null })
const overflow = reactive<CalendarOverflow>({ visible: false, x: 0, y: 0, date: '', items: [] })
const form = reactive({ title: '', ...defaultEventSchedule(), allDay: false, description: '', color: '#1E88E5', priority: 'important', completed: false, reminder: { enabled: false, mode: 'at', triggerAt: '', offsetMinutes: 10, intervalMinutes: 10 } })
const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六']
const views = [{ key: 'month', label: '月' }, { key: 'week', label: '周' }, { key: 'year', label: '年' }, { key: 'list', label: '列表' }]

const projectedTodos = computed(() => todoCalendarItems(todosStore.todos))
const allItems = computed(() => [...events.value.map(item => ({ ...item, kind: 'event' })), ...projectedTodos.value])
const monthRows = computed(() => monthWeekRows(anchor.value.getFullYear(), anchor.value.getMonth(), allItems.value).map(week => ({ ...week, cells: week.cells.map(cell => ({ ...cell, lunar: lunarLabelForDate(cell.date) })) })))
const days = computed(() => weekDays(anchor.value).map(day => ({ ...day, items: allItems.value.filter(item => item.startDate <= day.date && item.endDate >= day.date) })))
const months = computed(() => yearMonths(anchor.value.getFullYear(), allItems.value))
const listItems = computed(() => [...allItems.value].sort((a, b) => (a.startDate + (a.startTime || '')).localeCompare(b.startDate + (b.startTime || ''))))
const label = computed(() => view.value === 'year'
  ? anchor.value.getFullYear() + '年'
  : view.value === 'week'
    ? formatDate(startOfWeek(anchor.value)) + ' — ' + formatDate(addDays(startOfWeek(anchor.value), 6))
    : anchor.value.getFullYear() + '年 ' + (anchor.value.getMonth() + 1) + '月')

function setView(next: string) { view.value = next; viewMenu.value = false; localStorage.setItem('tiny-note-calendar-view', next) }
function move(direction: number) {
  const date = new Date(anchor.value)
  if (view.value === 'year') date.setFullYear(date.getFullYear() + direction)
  else if (view.value === 'week') date.setDate(date.getDate() + direction * 7)
  else { date.setDate(1); date.setMonth(date.getMonth() + direction) }
  anchor.value = date
}
function today() { anchor.value = new Date() }
function resetForm(start = formatDate(new Date()), end = start) {
  const schedule = defaultEventSchedule()
  Object.assign(form, { title: '', startDate: start, endDate: end, startTime: schedule.startTime, endTime: schedule.endTime, allDay: false, description: '', color: '#1E88E5', priority: 'important', completed: false, reminder: { enabled: false, mode: 'at', triggerAt: '', offsetMinutes: 10, intervalMinutes: 10 } })
  formError.value = ''
  modal.value = true
}
function changeStartDate(value: string) { const end = shiftEventStart(form, value, form.startTime); form.startDate = value; Object.assign(form, end) }
function changeEndDate(value: string) { form.endDate = value; if (!form.startDate || value < form.startDate) form.startDate = value }
function changeStartTime(value: string) { const end = shiftEventStart(form, form.startDate, value); form.startTime = value; Object.assign(form, end) }
function startSelect(date: string) { selection.active = true; selection.start = date; selection.end = date }
function extendSelect(date: string) { if (selection.active) selection.end = date }
function finishSelect() {
  if (!selection.active) return
  const start = selection.start < selection.end ? selection.start : selection.end
  const end = selection.start < selection.end ? selection.end : selection.start
  selection.active = false
  resetForm(start, end)
}
async function saveEvent() {
  if (!form.title.trim()) { formError.value = '请输入日程标题'; return }
  if (!form.startDate || !form.endDate) { formError.value = '请选择开始和结束日期'; return }
  if (!form.allDay && (!form.startTime || !form.endTime || compareLocalEventTimes(form) <= 0)) { formError.value = '结束时间需要晚于开始时间'; return }
  try {
    saving.value = true
    formError.value = ''
    const anchorAt = !form.allDay && form.startDate && form.startTime ? new Date(`${form.startDate}T${form.startTime}`).toISOString() : null
    const reminder = normalizedReminder(form.reminder, { hasAnchor: Boolean(anchorAt), anchorAt })
    if (reminder && !(await ensureReminderPermission())) { formError.value = '未获得系统通知权限，无法启用提醒'; return }
    await calendar.create({ title: form.title, startDate: form.startDate, endDate: form.endDate, startTime: form.allDay ? '' : form.startTime, endTime: form.allDay ? '' : form.endTime, allDay: form.allDay, description: form.description, color: form.color, priority: form.priority, completed: form.completed, reminder })
    modal.value = false
  } catch (reason) { formError.value = errorMessage(reason, String(reason)) } finally { saving.value = false }
}
function openItem(item: CalendarDisplayItem) { if (item.kind === 'todo') router.push({ path: '/todos', query: { id: item.id } }); else router.push('/calendar/' + item.id) }
function openContext(event: MouseEvent, item: CalendarDisplayItem) { context.visible = true; context.x = event.clientX; context.y = event.clientY; context.item = item }
function openOverflow(event: MouseEvent, cell: { date: string; events: CalendarDisplayItem[] }) {
  overflow.visible = true
  overflow.x = Math.max(8, Math.min(event.clientX, window.innerWidth - 280))
  overflow.y = Math.max(8, Math.min(event.clientY, window.innerHeight - 260))
  overflow.date = cell.date
  overflow.items = cell.events
}
async function toggleItem(item: CalendarDisplayItem | null) {
  if (!item) return
  if (item.kind === 'todo') await todosStore.setCompleted(item.id, !item.completed)
  else {
    const { kind, ...input } = item
    void kind
    await calendar.update(item.id, { ...(input as Partial<CalendarEvent>), completed: !item.completed, reminder: item.reminder?.enabled ? { ...item.reminder } : null })
  }
}
async function toggleContext() { const item = context.item; context.visible = false; await toggleItem(item) }
function openContextItem() { if (context.item) openItem(context.item); context.visible = false }
async function deleteContext() { const item = context.item; context.visible = false; if (item?.kind === 'event' && window.confirm('确定删除这个日程吗？')) await calendar.remove(item.id) }
function eventStyle(item: CalendarDisplayItem): CSSProperties { return { '--item-color': item.color || '#4E83A8' } as CSSProperties }
function segmentStyle(segment: MonthSegment): CSSProperties { return { gridColumn: segment.startColumn + ' / span ' + segment.span, gridRow: segment.lane + 1, ...eventStyle(segment.item) } }
function monthClick(month: number) { anchor.value = new Date(anchor.value.getFullYear(), month, 1); setView('month') }
function closeMenus(event: PointerEvent) { const target = event.target instanceof Element ? event.target : null; if (!target?.closest('.calendar-view-switch')) viewMenu.value = false; if (!target?.closest('.calendar-context')) context.visible = false; if (!target?.closest('.calendar-overflow')) overflow.visible = false }
function onKey(event: KeyboardEvent) { if (event.key === 'Escape') { modal.value = false; context.visible = false; overflow.visible = false; viewMenu.value = false } }
onMounted(async () => { document.addEventListener('pointerdown', closeMenus); window.addEventListener('keydown', onKey); await Promise.allSettled([calendar.load(), todosStore.load()]) })
onUnmounted(() => { document.removeEventListener('pointerdown', closeMenus); window.removeEventListener('keydown', onKey) })
</script>

<template>
  <section class="calendar-page">
    <header class="calendar-toolbar">
      <div class="calendar-heading"><CalendarRange :size="24" /><h1>{{ label }}</h1></div>
      <div class="calendar-actions">
        <button class="add-event" aria-label="新建日程" title="新建日程" @click="resetForm()"><Plus :size="22" /></button>
        <div class="calendar-view-switch"><button @click.stop="viewMenu = !viewMenu"><List :size="15" />{{ views.find(item => item.key === view)?.label }}<ChevronDown :size="14" /></button><div v-if="viewMenu" class="calendar-view-menu"><button v-for="item in views" :key="item.key" :class="{ active: view === item.key }" @click="setView(item.key)"><Check v-if="view === item.key" :size="14" /><span v-else></span>{{ item.label }}</button></div></div>
        <div class="calendar-step"><button aria-label="上一段时间" @click="move(-1)"><ChevronLeft :size="18" /></button><button aria-label="下一段时间" @click="move(1)"><ChevronRight :size="18" /></button></div>
        <button class="today" @click="today">今天</button>
      </div>
    </header>

    <div v-if="loading" class="calendar-state"><LoaderCircle class="spin" :size="20" />正在读取日程…</div>
    <div v-else-if="error" class="calendar-state error">{{ error }}<button @click="calendar.load()">重试</button></div>
    <template v-else>
      <div v-if="view === 'month'" class="calendar-month">
        <div class="month-weekdays"><div v-for="day in weekdayLabels" :key="day">周{{ day }}</div></div>
        <div class="month-weeks">
          <section v-for="(week, weekIndex) in monthRows" :key="weekIndex" class="month-week">
            <div class="month-week-cells">
              <article v-for="(cell, cellIndex) in week.cells" :key="cell.date" class="month-cell" :class="{ muted: !cell.isCurrentMonth, today: cell.isToday, selected: isInDateRange(cell.date, selection.start, selection.end) }" @mousedown.prevent="startSelect(cell.date)" @mouseenter="extendSelect(cell.date)" @mouseup.prevent="finishSelect">
                <header class="cell-head"><b>{{ cell.day }}</b><small :class="{ holiday: cell.lunar.holiday }">{{ cell.lunar.text }}</small></header>
                <button v-if="week.hiddenCounts[cellIndex]" class="month-more" type="button" @mousedown.stop @click.stop="openOverflow($event, cell)">+{{ week.hiddenCounts[cellIndex] }}</button>
              </article>
            </div>
            <div class="month-week-events">
              <div v-for="segment in week.segments" :key="segment.key" class="month-item" :class="{ todo: segment.item.kind === 'todo', completed: segment.item.completed, 'continues-before': segment.continuesBefore, 'continues-after': segment.continuesAfter }" :data-status="segment.item.completed ? 'completed' : 'active'" :style="segmentStyle(segment)" @mousedown.stop @contextmenu.prevent.stop="openContext($event, segment.item)">
                <button class="item-check" type="button" :aria-label="segment.item.completed ? '取消完成' : '标记完成'" @click.stop="toggleItem(segment.item)"><Check v-if="segment.item.completed" :size="11" stroke-width="3" /></button>
                <button class="item-main" type="button" @click.stop="openItem(segment.item)"><span>{{ segment.item.title }}</span><Bell v-if="segment.item.reminder?.enabled" :size="11" /><time v-if="!segment.item.allDay && segment.item.startTime">{{ segment.item.startTime }}{{ segment.item.endTime ? `–${segment.item.endTime}` : '' }}</time></button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div v-else-if="view === 'week'" class="calendar-week"><article v-for="day in days" :key="day.date" :class="{ today: day.isToday }" @dblclick="resetForm(day.date)"><header><span>{{ day.weekday }}</span><b>{{ day.day }}</b></header><div class="week-items"><button v-for="item in day.items" :key="item.kind + '-' + item.id" :style="eventStyle(item)" :class="{ completed: item.completed }" :data-status="item.completed ? 'completed' : 'active'" @click="openItem(item)" @contextmenu.prevent="openContext($event, item)"><span class="week-item-title"><Check v-if="item.completed" :size="12" stroke-width="3" /><strong>{{ item.title }}</strong></span><small>{{ item.allDay ? '全天' : item.startTime ? item.startTime + (item.endTime ? `–${item.endTime}` : '') : '待办' }}</small></button><span v-if="!day.items.length" class="week-empty">双击新建</span></div></article></div>
      <div v-else-if="view === 'year'" class="calendar-year"><button v-for="month in months" :key="month.month" @click="monthClick(month.month)"><strong>{{ month.month + 1 }}月</strong><span class="mini-week"><i v-for="day in weekdayLabels" :key="day">{{ day }}</i></span><span class="mini-grid"><i v-for="cell in month.cells" :key="cell.date" :class="{ today: cell.isToday, busy: cell.events.length }">{{ cell.day }}</i></span></button></div>
      <div v-else class="calendar-list"><header><div><b>{{ listItems.length }}</b><span>全部事项</span></div><div><b>{{ listItems.filter(item => item.completed).length }}</b><span>已完成</span></div><div><b>{{ listItems.filter(item => item.kind === 'todo').length }}</b><span>待办投影</span></div></header><button v-for="item in listItems" :key="item.kind + '-' + item.id" :class="{ completed: item.completed }" :data-status="item.completed ? 'completed' : 'active'" @click="openItem(item)" @contextmenu.prevent="openContext($event, item)"><span class="list-dot" :class="{ completed: item.completed }" :style="{ '--item-color': item.color }"><Check v-if="item.completed" :size="9" stroke-width="3" /></span><span><strong>{{ item.title }}</strong><small>{{ item.startDate }} {{ item.allDay ? '全天' : item.startTime + (item.endTime ? `–${item.endTime}` : '') }}</small></span><em>{{ item.kind === 'todo' ? '待办' : item.priority === 'urgent' ? '紧急' : item.priority === 'minor' ? '次要' : '重要' }}</em></button><div v-if="!listItems.length" class="calendar-empty"><CalendarDays :size="34" /><b>暂无日程和待办</b><span>新建日程，或为待办设置截止时间。</span></div></div>
    </template>

    <div v-if="modal" class="calendar-modal-backdrop" @mousedown.self="modal = false"><form class="calendar-modal" @submit.prevent="saveEvent"><header><h2>新建日程</h2><button type="button" @click="modal = false"><X :size="18" /></button></header><label>标题<input v-model="form.title" autofocus placeholder="日程标题"></label><div class="form-grid"><label>开始日期<DateTimePicker mode="date" :model-value="form.startDate" placeholder="选择开始日期" :clearable="false" @update:model-value="changeStartDate" /></label><label>结束日期<DateTimePicker mode="date" :model-value="form.endDate" placeholder="选择结束日期" :clearable="false" @update:model-value="changeEndDate" /></label></div><label class="check"><input v-model="form.allDay" type="checkbox">全天</label><div v-if="!form.allDay" class="form-grid"><label>开始时间<DateTimePicker mode="time" :model-value="form.startTime" placeholder="选择开始时间" :clearable="false" @update:model-value="changeStartTime" /></label><label>结束时间<DateTimePicker v-model="form.endTime" mode="time" placeholder="选择结束时间" :clearable="false" /></label></div><p v-if="!form.allDay" class="time-hint">调整开始时间时，会自动保留日程时长。</p><label>描述<textarea v-model="form.description" rows="3" placeholder="添加描述…"></textarea></label><div class="form-grid"><label>优先级<select v-model="form.priority"><option value="urgent">紧急</option><option value="important">重要</option><option value="minor">次要</option></select></label><fieldset><legend>颜色</legend><div class="color-grid"><button v-for="color in EVENT_COLORS" :key="color" type="button" :class="{ active: form.color === color }" :style="{ background: color }" @click="form.color = color"></button></div></fieldset></div><ReminderEditor v-model="form.reminder" :has-anchor="!form.allDay && Boolean(form.startTime)" /><p v-if="formError" class="form-error">{{ formError }}</p><footer><button type="button" @click="modal = false">取消</button><button class="primary" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button></footer></form></div>
    <div v-if="overflow.visible" class="calendar-overflow" :style="{ left: overflow.x + 'px', top: overflow.y + 'px' }"><header><b>{{ overflow.date }}</b><button @click="overflow.visible = false"><X :size="15" /></button></header><button v-for="item in overflow.items" :key="item.kind + '-' + item.id" :class="{ completed: item.completed }" :data-status="item.completed ? 'completed' : 'active'" :style="{ '--item-color': item.color }" @click="openItem(item); overflow.visible = false"><i></i><span>{{ item.title }}</span><time>{{ item.allDay ? '全天' : item.startTime + (item.endTime ? `–${item.endTime}` : '') }}</time></button></div>
    <div v-if="context.visible" class="calendar-context" :style="{ left: context.x + 'px', top: context.y + 'px' }"><button @click="toggleContext">{{ context.item?.completed ? '取消完成' : '标记完成' }}</button><button @click="openContextItem">查看详情</button><button v-if="context.item?.kind === 'event'" class="danger" @click="deleteContext"><Trash2 :size="14" />删除日程</button></div>
  </section>
</template>

<style scoped>
.calendar-page{width:100%;min-width:0;height:100%;display:flex;flex-direction:column;background:var(--bg);color:var(--text);overflow:hidden}.calendar-toolbar{box-sizing:border-box;width:100%;min-width:0;height:72px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;border-bottom:1px solid var(--line);background:var(--panel);flex:none}.calendar-heading{display:flex;align-items:center;gap:10px}.calendar-heading h1{font-size:26px;line-height:1;margin:0;letter-spacing:.02em}.calendar-actions,.calendar-step,.calendar-view-switch>button{display:flex;align-items:center}.calendar-actions{gap:9px}.calendar-toolbar button{height:38px;border:1px solid var(--line);background:var(--bg);color:var(--text);border-radius:10px;padding:0 12px;cursor:pointer}.calendar-toolbar button:hover{background:var(--hover)}.calendar-step{gap:0}.calendar-step button{width:36px;padding:0;border-radius:0}.calendar-step button:first-child{border-radius:10px 0 0 10px}.calendar-step button:last-child{border-left:0;border-radius:0 10px 10px 0}.calendar-actions .today{font-weight:600}.calendar-actions .add-event{width:42px;padding:0;display:grid;place-items:center}.calendar-view-switch{position:relative}.calendar-view-switch>button{gap:7px;min-width:74px;justify-content:center}.calendar-view-menu{position:absolute;right:0;top:44px;z-index:40;width:116px;background:var(--panel);border:1px solid var(--line);box-shadow:0 12px 34px #0006;border-radius:10px;padding:5px}.calendar-view-menu button{display:flex;align-items:center;gap:6px;width:100%;height:34px;border:0}.calendar-view-menu button span,.calendar-view-menu button svg{width:14px}.calendar-view-menu .active{color:var(--accent)}.calendar-state,.calendar-empty{display:flex;align-items:center;justify-content:center;gap:10px;height:100%;color:var(--muted)}.calendar-state.error{color:#dc2626}
.calendar-month{box-sizing:border-box;width:100%;max-width:100%;flex:1;min-height:0;display:flex;flex-direction:column;overflow:auto;background:var(--panel)}.month-weekdays{height:44px;min-width:840px;display:grid;grid-template-columns:repeat(7,minmax(120px,1fr));flex:none;border-bottom:1px solid var(--line)}.month-weekdays div{display:grid;place-items:center;color:var(--muted);font-size:13px;font-weight:600}.month-weeks{min-width:840px;min-height:690px;flex:1;display:grid;grid-template-rows:repeat(6,minmax(112px,1fr))}.month-week{position:relative;min-height:112px}.month-week-cells{position:absolute;inset:0;display:grid;grid-template-columns:repeat(7,minmax(120px,1fr))}.month-cell{position:relative;min-width:0;border-right:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--panel);padding:8px 10px;overflow:hidden}.month-cell:first-child{border-left:1px solid var(--line)}.month-cell.muted{background:color-mix(in srgb,var(--panel),var(--bg) 38%);color:var(--muted)}.month-cell.today{background:color-mix(in srgb,var(--accent),var(--panel) 93%)}.month-cell.selected{box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--accent),transparent 45%)}.cell-head{height:24px;display:flex;align-items:flex-start;justify-content:space-between;gap:8px;pointer-events:none}.cell-head b{width:25px;height:25px;display:grid;place-items:center;border-radius:50%;font-size:15px}.month-cell.today .cell-head b{background:var(--accent);color:#fff}.cell-head small{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:11px}.cell-head small.holiday{color:#18c997;font-weight:700}.month-week-events{position:absolute;z-index:3;left:4px;right:4px;top:38px;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-auto-rows:23px;gap:3px 0;pointer-events:none}.month-item{height:23px;min-width:0;margin:0 2px;display:flex;align-items:center;border-radius:5px;background:color-mix(in srgb,var(--item-color) 45%,var(--panel));color:color-mix(in srgb,var(--item-color) 48%,var(--text));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--item-color) 42%,transparent);pointer-events:auto;overflow:hidden;transition:background .15s,color .15s,box-shadow .15s}.month-item.continues-before{margin-left:0;border-radius:0 5px 5px 0}.month-item.continues-after{margin-right:0;border-radius:5px 0 0 5px}.month-item.continues-before.continues-after{border-radius:0}.month-item.todo{box-shadow:inset 3px 0 0 color-mix(in srgb,var(--item-color) 78%,var(--text))}.month-item.completed{background:color-mix(in srgb,var(--item-color) 14%,var(--panel));color:color-mix(in srgb,var(--item-color) 12%,var(--muted));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--item-color) 20%,var(--line))}.item-check{position:relative;width:25px;height:23px;display:grid;place-items:center;flex:none;border:0;background:transparent;color:inherit}.item-check::before{content:"";position:absolute;width:12px;height:12px;border:1.5px solid currentColor;border-radius:4px;opacity:.9}.item-check svg{position:relative;z-index:1}.month-item.completed .item-check{color:#fff}.month-item.completed .item-check::before{background:color-mix(in srgb,var(--item-color) 18%,var(--muted));border-color:transparent;opacity:1}.item-check:hover::before{box-shadow:0 0 0 3px color-mix(in srgb,currentColor,transparent 82%)}.item-main{height:23px;min-width:0;flex:1;display:flex;align-items:center;gap:5px;border:0;background:transparent;color:inherit;padding:0 6px 0 0;text-align:left;font:inherit;font-size:12px;font-weight:600}.item-main span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.item-main svg{flex:none}.item-main time{margin-left:auto;flex:none;font-size:11px;font-weight:500;opacity:.82}.month-item.completed .item-main span{text-decoration:none}.month-item.completed .item-main time{opacity:.72}.month-more{position:absolute;z-index:5;right:7px;bottom:5px;height:20px;border:0;border-radius:5px;background:var(--hover);color:var(--muted);font-size:11px}.calendar-week{flex:1;min-height:0;display:grid;grid-template-columns:repeat(7,minmax(120px,1fr));overflow:auto}.calendar-week article{border-right:1px solid var(--line);background:var(--panel);min-height:100%}.calendar-week article>header{height:70px;display:grid;place-items:center;border-bottom:1px solid var(--line);color:var(--muted)}.calendar-week article>header b{font-size:22px;color:var(--text)}.calendar-week article.today>header b{background:var(--accent);color:#fff;border-radius:50%;width:34px;height:34px;display:grid;place-items:center}.week-items{padding:8px;display:grid;align-content:start;gap:8px}.week-items button{border:0;border-left:3px solid var(--item-color);border-radius:7px;padding:9px;text-align:left;color:var(--text);display:grid;gap:4px;background:color-mix(in srgb,var(--item-color) 22%,var(--panel))}.week-item-title{min-width:0;display:flex;align-items:center;gap:5px}.week-item-title svg{flex:none;color:color-mix(in srgb,var(--item-color) 18%,var(--muted))}.week-item-title strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.week-items button.completed{border-left-color:color-mix(in srgb,var(--item-color) 25%,var(--line));background:color-mix(in srgb,var(--item-color) 10%,var(--panel));color:color-mix(in srgb,var(--item-color) 10%,var(--muted))}.week-items button.completed strong{text-decoration:none}.week-items small,.week-empty{color:var(--muted)}.week-items button.completed small{opacity:.72}.calendar-year{flex:1;overflow:auto;padding:18px;display:grid;grid-template-columns:repeat(4,minmax(190px,1fr));gap:14px}.calendar-year>button{border:1px solid var(--line);background:var(--panel);border-radius:10px;padding:13px;color:var(--text);text-align:left;cursor:pointer}.mini-week,.mini-grid{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;margin-top:10px}.mini-week i{font-style:normal;color:var(--muted);font-size:10px}.mini-grid i{font-style:normal;font-size:11px;padding:4px 0;border-radius:50%}.mini-grid i.busy{color:var(--accent);font-weight:700}.mini-grid i.today{background:var(--accent);color:#fff}.calendar-list{flex:1;overflow:auto;padding:20px;max-width:1000px;width:100%;box-sizing:border-box;margin:auto}.calendar-list>header{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px}.calendar-list>header div{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px;display:grid;gap:4px}.calendar-list>header b{font-size:22px}.calendar-list>header span{color:var(--muted)}.calendar-list>button{width:100%;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--text);padding:13px 9px;display:grid;grid-template-columns:14px 1fr auto;gap:12px;text-align:left}.calendar-list>button span:nth-child(2){display:grid;gap:4px}.calendar-list>button.completed{color:var(--muted);background:color-mix(in srgb,var(--muted) 5%,transparent)}.calendar-list>button.completed strong{text-decoration:none}.calendar-list>button.completed small,.calendar-list>button.completed em{opacity:.72}.calendar-list small{color:var(--muted)}.calendar-list em{font-style:normal;color:var(--muted);font-size:12px}.list-dot{width:9px;height:9px;border-radius:50%;margin-top:4px;display:grid;place-items:center;background:var(--item-color);color:#fff}.list-dot.completed{width:14px;height:14px;margin-top:1px;background:color-mix(in srgb,var(--item-color) 18%,var(--muted))}.calendar-empty{height:300px;flex-direction:column}
.calendar-modal-backdrop{position:fixed;inset:0;z-index:80;background:#0006;display:grid;place-items:center}.calendar-modal{width:min(540px,calc(100vw - 32px));max-height:calc(100vh - 50px);overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:13px;box-shadow:0 24px 70px #0005;padding:18px;display:grid;gap:14px}.calendar-modal header,.calendar-modal footer{display:flex;align-items:center;justify-content:space-between}.calendar-modal h2{font-size:18px;margin:0}.calendar-modal label{display:grid;gap:6px;font-size:13px}.calendar-modal input,.calendar-modal textarea,.calendar-modal select{box-sizing:border-box;width:100%;border:1px solid var(--line);background:var(--bg);color:var(--text);border-radius:7px;padding:8px;font:inherit}.calendar-modal header button,.calendar-modal footer button{border:1px solid var(--line);background:var(--bg);color:var(--text);border-radius:7px;padding:8px 13px}.calendar-modal .primary{background:var(--accent);border-color:var(--accent);color:#fff}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.calendar-modal .check{display:flex;align-items:center}.calendar-modal .check input{width:auto}.calendar-modal fieldset{border:0;padding:0;margin:0}.calendar-modal legend{font-size:13px;margin-bottom:8px}.color-grid{display:flex;flex-wrap:wrap;gap:6px}.color-grid button{width:22px;height:22px;border:2px solid transparent;border-radius:50%}.color-grid button.active{box-shadow:0 0 0 2px var(--panel),0 0 0 4px var(--accent)}.time-hint{margin:-8px 0 0;color:var(--muted);font-size:11px}.form-error{margin:0;color:#dc2626;font-size:12px}.calendar-context{position:fixed;z-index:100;min-width:150px;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:5px;box-shadow:0 12px 35px #0004;display:grid}.calendar-context button{border:0;background:transparent;color:var(--text);padding:8px 10px;text-align:left;border-radius:5px;display:flex;gap:7px}.calendar-context button:hover{background:var(--hover)}.calendar-context .danger{color:#dc2626}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.calendar-overflow{position:fixed;z-index:110;width:270px;max-height:250px;overflow:auto;padding:7px;background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:0 16px 45px #0006}.calendar-overflow header{display:flex;align-items:center;justify-content:space-between;padding:4px 6px 8px}.calendar-overflow header button{display:grid;place-items:center;width:26px;height:26px;border:0;background:transparent;color:var(--muted)}.calendar-overflow>button{width:100%;height:34px;display:grid;grid-template-columns:8px 1fr auto;align-items:center;gap:8px;border:0;border-radius:6px;background:transparent;color:var(--text);text-align:left}.calendar-overflow>button:hover{background:var(--hover)}.calendar-overflow>button.completed{color:color-mix(in srgb,var(--item-color) 10%,var(--muted));background:color-mix(in srgb,var(--item-color) 8%,var(--panel))}.calendar-overflow>button.completed i{opacity:.5}.calendar-overflow>button.completed time{opacity:.72}.calendar-overflow i{width:7px;height:7px;border-radius:50%;background:var(--item-color)}.calendar-overflow span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.calendar-overflow time{color:var(--muted);font-size:11px}
@media(max-width:900px){.calendar-toolbar{padding:0 10px}.calendar-heading h1{font-size:20px}.calendar-heading svg{display:none}.calendar-actions{gap:5px}.calendar-actions .today{display:none}.calendar-year{grid-template-columns:repeat(2,minmax(190px,1fr))}.calendar-week{grid-template-columns:repeat(7,150px)}}@media(max-width:620px){.calendar-step{display:none}.calendar-toolbar{height:62px}.calendar-heading h1{font-size:18px}.form-grid{grid-template-columns:1fr}}
</style>
