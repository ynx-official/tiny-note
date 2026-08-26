<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Bell, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Repeat2, Sun, X } from 'lucide-vue-next'
import DateTimePicker from './DateTimePicker.vue'
import { formatDate, lunarLabelForDate, monthCells } from '../utils/calendar'
import { localDateTimeValue, localDateValue, localTimeValue, roundedFutureDate } from '../utils/dateTime'

const props = defineProps({
  dueAt: { type: String, default: '' },
  reminder: { type: Object, default: null },
  locale: { type: String, default: 'zh-CN' },
  disabled: Boolean
})
const emit = defineEmits(['update:dueAt', 'update:reminder'])
const root = ref(null)
const trigger = ref(null)
const panel = ref(null)
const open = ref(false)
const activeTab = ref('date')
const cursor = ref(new Date())
const draftDue = ref('')
const draftReminder = ref(null)
const position = reactive({ left: '0px', top: '0px', width: '430px' })
const zh = computed(() => props.locale === 'zh-CN')
const text = computed(() => zh.value ? {
  none: '无时间', today: '今天', tomorrow: '明天', date: '日期', reminder: '提醒', nextWeek: '下周', time: '时间',
  noReminder: '不提醒', enableReminder: '启用提醒', at: '指定时间', before: '提前提醒', interval: '循环提醒',
  reminderTime: '提醒时间', firstReminder: '首次提醒（可选）', every: '每隔', minutes: '分钟', clear: '清除', confirm: '确定',
  beforeNeedsDue: '请先设置截止时间', previousMonth: '上个月', nextMonth: '下个月', close: '关闭时间设置'
} : {
  none: 'No date', today: 'Today', tomorrow: 'Tomorrow', date: 'Date', reminder: 'Reminder', nextWeek: 'Next week', time: 'Time',
  noReminder: 'No reminder', enableReminder: 'Enable reminder', at: 'At time', before: 'Before due', interval: 'Repeating alert',
  reminderTime: 'Reminder time', firstReminder: 'First alert (optional)', every: 'Every', minutes: 'minutes', clear: 'Clear', confirm: 'Done',
  beforeNeedsDue: 'Set a due time first', previousMonth: 'Previous month', nextMonth: 'Next month', close: 'Close schedule'
})
const weekdays = computed(() => zh.value ? ['日', '一', '二', '三', '四', '五', '六'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'])
const fallbackReminder = () => ({ enabled: false, mode: 'at', triggerAt: '', offsetMinutes: 10, intervalMinutes: 10 })
const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'))
const minutes = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'))

const cells = computed(() => monthCells(cursor.value.getFullYear(), cursor.value.getMonth()).map(cell => ({ ...cell, lunar: zh.value ? lunarLabelForDate(cell.date) : null })))
const dueDate = computed(() => draftDue.value.slice(0, 10))
const dueTime = computed(() => draftDue.value.split('T')[1] || '18:00')
const triggerLabel = computed(() => {
  if (!props.dueAt) return text.value.none
  const date = new Date(props.dueAt)
  if (Number.isNaN(date.getTime())) return text.value.none
  const value = localDateValue(date)
  const today = localDateValue()
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const prefix = value === today ? text.value.today : value === localDateValue(tomorrow) ? text.value.tomorrow : new Intl.DateTimeFormat(props.locale, { month: 'numeric', day: 'numeric' }).format(date)
  return `${prefix} ${localTimeValue(date)}`
})

function syncDraft() {
  draftDue.value = props.dueAt || ''
  draftReminder.value = { ...fallbackReminder(), ...(props.reminder || {}) }
  const date = draftDue.value ? new Date(draftDue.value) : new Date()
  if (!Number.isNaN(date.getTime())) cursor.value = date
}
function updatePosition() {
  if (!trigger.value) return
  const rect = trigger.value.getBoundingClientRect()
  const width = Math.min(430, window.innerWidth - 20)
  const height = Math.min(panel.value?.offsetHeight || 610, window.innerHeight - 20)
  position.width = `${width}px`
  position.left = `${Math.min(Math.max(10, rect.right - width), window.innerWidth - width - 10)}px`
  const below = window.innerHeight - rect.bottom
  const top = below >= height || below >= rect.top ? rect.bottom + 8 : rect.top - height - 8
  position.top = `${Math.min(Math.max(10, top), window.innerHeight - height - 10)}px`
}
async function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) { syncDraft(); activeTab.value = 'date'; await nextTick(); updatePosition() }
}
function close() { open.value = false }
function closeOutside(event) {
  if (!open.value || root.value?.contains(event.target) || panel.value?.contains(event.target) || event.target?.closest?.('.date-time-panel')) return
  close()
}
function handleKey(event) { if (event.key === 'Escape' && open.value) { event.stopPropagation(); close(); trigger.value?.focus() } }
function moveMonth(amount) { const date = new Date(cursor.value); date.setDate(1); date.setMonth(date.getMonth() + amount); cursor.value = date }
function chooseDate(value) { draftDue.value = `${value}T${dueTime.value}`; cursor.value = new Date(`${value}T12:00`) }
function choosePreset(days, time = '18:00') {
  const date = new Date(); date.setDate(date.getDate() + days)
  draftDue.value = `${localDateValue(date)}T${time}`
  cursor.value = date
}
function changeTime(part, value) {
  const date = dueDate.value || localDateValue()
  const [hour, minute] = dueTime.value.split(':')
  draftDue.value = `${date}T${part === 'hour' ? value : hour}:${part === 'minute' ? value : minute}`
}
function patchReminder(field, value) { draftReminder.value = { ...fallbackReminder(), ...draftReminder.value, [field]: value } }
function toggleReminder() {
  const enabled = !draftReminder.value?.enabled
  const next = { ...fallbackReminder(), ...draftReminder.value, enabled }
  if (enabled && next.mode === 'at' && !next.triggerAt) next.triggerAt = draftDue.value || localDateTimeValue(roundedFutureDate(30, 5))
  draftReminder.value = next
}
function setReminderMode(mode) {
  const next = { ...fallbackReminder(), ...draftReminder.value, enabled: true, mode }
  if (mode === 'at' && !next.triggerAt) next.triggerAt = draftDue.value || localDateTimeValue(roundedFutureDate(30, 5))
  draftReminder.value = next
}
function clearSchedule() { draftDue.value = ''; draftReminder.value = fallbackReminder() }
function commit() {
  emit('update:dueAt', draftDue.value)
  emit('update:reminder', { ...fallbackReminder(), ...draftReminder.value })
  close()
  trigger.value?.focus()
}

watch(() => [props.dueAt, props.reminder], () => { if (!open.value) syncDraft() }, { deep: true })
onMounted(() => {
  document.addEventListener('pointerdown', closeOutside)
  window.addEventListener('keydown', handleKey, true)
  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeOutside)
  window.removeEventListener('keydown', handleKey, true)
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
})
</script>

<template>
  <div ref="root" class="quick-scheduler">
    <button ref="trigger" type="button" class="schedule-pill" :disabled="disabled" :aria-expanded="open" aria-haspopup="dialog" @click="toggle">
      <CalendarDays :size="16" /><span>{{ triggerLabel }}</span><ChevronDown :size="15" />
    </button>
    <Teleport to="body">
      <section v-if="open" ref="panel" class="quick-schedule-panel" :style="position" role="dialog" :aria-label="text.date">
        <header class="schedule-tabs">
          <button type="button" :class="{ active: activeTab === 'date' }" @click="activeTab = 'date'"><CalendarDays :size="15" />{{ text.date }}</button>
          <button type="button" :class="{ active: activeTab === 'reminder' }" @click="activeTab = 'reminder'"><Bell :size="15" />{{ text.reminder }}</button>
          <button type="button" class="panel-close" :aria-label="text.close" @click="close"><X :size="16" /></button>
        </header>

        <div v-if="activeTab === 'date'" class="schedule-date-panel">
          <div class="date-presets">
            <button type="button" @click="choosePreset(0)"><Sun :size="18" /><span>{{ text.today }}</span></button>
            <button type="button" @click="choosePreset(1, '09:00')"><CalendarDays :size="18" /><span>{{ text.tomorrow }}</span></button>
            <button type="button" @click="choosePreset(7, '09:00')"><CalendarDays :size="18" /><span>{{ text.nextWeek }}</span></button>
            <button type="button" @click="draftDue = ''"><X :size="18" /><span>{{ text.none }}</span></button>
          </div>
          <div class="schedule-month">
            <strong>{{ zh ? `${cursor.getFullYear()}年 ${cursor.getMonth() + 1}月` : new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(cursor) }}</strong>
            <span></span>
            <button type="button" :aria-label="text.previousMonth" @click="moveMonth(-1)"><ChevronLeft :size="17" /></button>
            <button type="button" :aria-label="text.nextMonth" @click="moveMonth(1)"><ChevronRight :size="17" /></button>
          </div>
          <div class="schedule-weekdays"><span v-for="(day, index) in weekdays" :key="`${day}-${index}`">{{ day }}</span></div>
          <div class="schedule-days">
            <button v-for="cell in cells" :key="cell.date" type="button" :class="{ muted: !cell.isCurrentMonth, today: cell.isToday, selected: dueDate === cell.date }" :aria-label="cell.date" @click="chooseDate(cell.date)">
              <b>{{ cell.day }}</b><small v-if="cell.lunar" :class="{ holiday: cell.lunar.holiday }">{{ cell.lunar.text }}</small><Check v-if="dueDate === cell.date" :size="10" />
            </button>
          </div>
          <div class="schedule-time-row">
            <span><Clock3 :size="16" />{{ text.time }}</span>
            <select :value="dueTime.split(':')[0]" :aria-label="text.time" @change="changeTime('hour', $event.target.value)"><option v-for="hour in hours" :key="hour">{{ hour }}</option></select>
            <b>:</b>
            <select :value="dueTime.split(':')[1]" :aria-label="text.minutes" @change="changeTime('minute', $event.target.value)"><option v-for="minute in minutes" :key="minute">{{ minute }}</option></select>
          </div>
        </div>

        <div v-else class="schedule-reminder-panel">
          <div class="reminder-toggle-row">
            <span><Bell :size="17" /><strong>{{ text.enableReminder }}</strong><small>{{ draftReminder?.enabled ? text.reminder : text.noReminder }}</small></span>
            <button type="button" class="schedule-switch" role="switch" :aria-checked="draftReminder?.enabled" @click="toggleReminder"><i></i></button>
          </div>
          <template v-if="draftReminder?.enabled">
            <div class="quick-reminder-modes">
              <button type="button" :class="{ active: draftReminder.mode === 'at' }" @click="setReminderMode('at')">{{ text.at }}</button>
              <button type="button" :class="{ active: draftReminder.mode === 'before' }" :disabled="!draftDue" @click="setReminderMode('before')">{{ text.before }}</button>
              <button type="button" :class="{ active: draftReminder.mode === 'interval' }" @click="setReminderMode('interval')">{{ text.interval }}</button>
            </div>
            <div v-if="draftReminder.mode === 'at'" class="quick-reminder-editor">
              <label>{{ text.reminderTime }}</label><DateTimePicker :model-value="draftReminder.triggerAt" :locale="locale" @update:model-value="patchReminder('triggerAt', $event)" />
            </div>
            <div v-else-if="draftReminder.mode === 'before'" class="quick-reminder-editor">
              <label>{{ text.before }}</label>
              <div class="quick-reminder-presets"><button v-for="value in [5,10,30,60]" :key="value" type="button" :class="{ active: Number(draftReminder.offsetMinutes) === value }" @click="patchReminder('offsetMinutes', value)">{{ value }} {{ text.minutes }}</button></div>
              <small v-if="!draftDue" class="schedule-warning">{{ text.beforeNeedsDue }}</small>
            </div>
            <div v-else class="quick-reminder-editor">
              <label><Repeat2 :size="14" />{{ text.every }}</label>
              <div class="quick-reminder-presets"><button v-for="value in [5,10,30,60]" :key="value" type="button" :class="{ active: Number(draftReminder.intervalMinutes) === value }" @click="patchReminder('intervalMinutes', value)">{{ value }} {{ text.minutes }}</button></div>
              <label>{{ text.firstReminder }}</label><DateTimePicker :model-value="draftReminder.triggerAt" :locale="locale" @update:model-value="patchReminder('triggerAt', $event)" />
            </div>
          </template>
        </div>

        <footer><button type="button" class="schedule-clear" @click="clearSchedule">{{ text.clear }}</button><button type="button" class="schedule-confirm" @click="commit">{{ text.confirm }}</button></footer>
      </section>
    </Teleport>
  </div>
</template>

<style scoped>
.quick-scheduler{flex:none}.schedule-pill{height:36px;max-width:190px;display:flex;align-items:center;gap:6px;border:0;border-radius:8px;background:color-mix(in srgb,var(--accent),transparent 90%);color:var(--accent);padding:0 9px;font:inherit;font-size:12px;cursor:pointer}.schedule-pill span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.quick-schedule-panel{position:fixed;z-index:420;box-sizing:border-box;max-height:calc(100vh - 20px);overflow:auto;border:1px solid var(--line);border-radius:16px;background:var(--panel);color:var(--text);box-shadow:0 24px 70px #0007;padding:12px}.schedule-tabs{display:grid;grid-template-columns:1fr 1fr 34px;gap:4px;padding:3px;border-radius:10px;background:var(--bg)}.schedule-tabs button{height:36px;border:0;border-radius:8px;background:transparent;color:var(--muted);display:flex;align-items:center;justify-content:center;gap:6px;font:inherit}.schedule-tabs button.active{background:var(--panel);color:var(--text);box-shadow:0 1px 4px #0002;font-weight:650}.schedule-tabs .panel-close{width:34px}.date-presets{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 4px}.date-presets button{border:0;background:transparent;color:var(--muted);display:grid;justify-items:center;gap:5px;font:inherit;font-size:11px}.date-presets button:hover{color:var(--accent)}.schedule-month{display:grid;grid-template-columns:auto 1fr 32px 32px;align-items:center;margin:8px 4px}.schedule-month strong{font-size:17px}.schedule-month button{width:30px;height:30px;display:grid;place-items:center;border:0;border-radius:7px;background:transparent;color:var(--text)}.schedule-month button:hover{background:var(--hover)}.schedule-weekdays,.schedule-days{display:grid;grid-template-columns:repeat(7,1fr);text-align:center}.schedule-weekdays span{padding:5px;color:var(--muted);font-size:10px}.schedule-days button{position:relative;min-height:48px;border:0;border-radius:9px;background:transparent;color:var(--text);display:grid;place-content:center;gap:1px;font:inherit}.schedule-days button:hover{background:var(--hover)}.schedule-days button.muted{color:color-mix(in srgb,var(--muted),transparent 38%)}.schedule-days button.today b{color:var(--accent)}.schedule-days button.selected{background:var(--accent);color:#fff}.schedule-days b{font-size:13px}.schedule-days small{font-size:8px;color:var(--muted);white-space:nowrap}.schedule-days small.holiday{color:#19bd91}.schedule-days button.selected small{color:#eaf0ff}.schedule-days svg{position:absolute;right:3px;bottom:3px}.schedule-time-row{display:flex;align-items:center;gap:7px;margin-top:10px;padding:11px 7px;border-top:1px solid var(--line)}.schedule-time-row>span{display:flex;align-items:center;gap:7px;margin-right:auto;color:var(--muted)}.schedule-time-row select{border:1px solid var(--line);border-radius:7px;background:var(--bg);color:var(--text);padding:6px 8px;font:inherit}.schedule-reminder-panel{min-height:380px;padding:15px 5px}.reminder-toggle-row{display:flex;align-items:center;justify-content:space-between;padding:12px;border:1px solid var(--line);border-radius:11px}.reminder-toggle-row>span{display:grid;grid-template-columns:24px 1fr;align-items:center}.reminder-toggle-row svg{grid-row:1/3}.reminder-toggle-row small{color:var(--muted)}.schedule-switch{position:relative;width:38px;height:22px;border:0;background:transparent}.schedule-switch i{display:block;width:38px;height:22px;border-radius:12px;background:var(--line);transition:.18s}.schedule-switch i::after{content:"";position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.18s}.schedule-switch[aria-checked=true] i{background:var(--accent)}.schedule-switch[aria-checked=true] i::after{transform:translateX(16px)}.quick-reminder-modes{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:14px;padding:3px;background:var(--bg);border-radius:9px}.quick-reminder-modes button{border:0;border-radius:7px;background:transparent;color:var(--muted);padding:8px 4px;font:inherit;font-size:12px}.quick-reminder-modes button.active{background:var(--panel);color:var(--accent);font-weight:650}.quick-reminder-modes button:disabled{opacity:.35}.quick-reminder-editor{display:grid;gap:10px;margin-top:16px}.quick-reminder-editor>label{display:flex;align-items:center;gap:5px;color:var(--muted);font-size:12px}.quick-reminder-presets{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.quick-reminder-presets button{border:1px solid var(--line);border-radius:7px;background:var(--bg);color:var(--muted);padding:7px 2px;font:inherit;font-size:11px}.quick-reminder-presets button.active{border-color:var(--accent);color:var(--accent);background:color-mix(in srgb,var(--accent),transparent 90%)}.schedule-warning{color:#dc2626}.quick-schedule-panel>footer{display:flex;gap:10px;margin-top:10px}.quick-schedule-panel>footer button{height:42px;flex:1;border-radius:9px;font:inherit;font-weight:650}.schedule-clear{border:1px solid var(--line);background:transparent;color:var(--text)}.schedule-confirm{border:1px solid var(--accent);background:var(--accent);color:#fff}@media(max-width:520px){.quick-schedule-panel{border-radius:14px}.schedule-days button{min-height:43px}.date-presets{gap:2px}.quick-reminder-presets{grid-template-columns:repeat(2,1fr)}}
</style>
