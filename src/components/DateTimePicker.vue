<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-vue-next'
import { localDateValue, localTimeValue, roundedFutureDate } from '../utils/dateTime'

const props = defineProps({
  modelValue: { type: String, default: '' },
  mode: { type: String, default: 'datetime', validator: value => ['date', 'time', 'datetime'].includes(value) },
  placeholder: { type: String, default: '选择日期和时间' },
  locale: { type: String, default: 'zh-CN' },
  minuteStep: { type: Number, default: 5 },
  clearable: { type: Boolean, default: true },
  disabled: Boolean
})
const emit = defineEmits(['update:modelValue', 'change'])
const root = ref(null)
const trigger = ref(null)
const panel = ref(null)
const open = ref(false)
const position = reactive({ left: '0px', top: '0px', width: '320px' })
const cursor = ref(new Date())
const zh = computed(() => props.locale === 'zh-CN')
const copy = computed(() => zh.value ? { today: '今天', tomorrow: '明天', nextWeek: '下周', previousMonth: '上个月', nextMonth: '下个月', time: '时间', hour: '小时', minute: '分钟', now: '现在', clear: '清空', done: '完成', dialog: '日期和时间选择器' } : { today: 'Today', tomorrow: 'Tomorrow', nextWeek: 'Next week', previousMonth: 'Previous month', nextMonth: 'Next month', time: 'Time', hour: 'Hour', minute: 'Minute', now: 'Now', clear: 'Clear', done: 'Done', dialog: 'Date and time picker' })
const weekdays = computed(() => zh.value ? ['一', '二', '三', '四', '五', '六', '日'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S'])
const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'))

const hasDate = computed(() => props.mode !== 'time')
const hasTime = computed(() => props.mode !== 'date')
const datePart = computed(() => {
  if (props.mode === 'time') return localDateValue()
  return (props.modelValue || '').slice(0, 10) || localDateValue()
})
const timePart = computed(() => {
  if (props.mode === 'date') return ''
  const value = props.mode === 'time' ? props.modelValue : (props.modelValue || '').split('T')[1]
  return /^\d{2}:\d{2}$/.test(value || '') ? value : localTimeValue(roundedFutureDate(30, props.minuteStep))
})
const selectedDate = computed(() => props.mode === 'time' ? '' : (props.modelValue || '').slice(0, 10))
const selectedHour = computed(() => timePart.value.slice(0, 2))
const selectedMinute = computed(() => timePart.value.slice(3, 5))
const minuteOptions = computed(() => {
  const values = Array.from({ length: Math.ceil(60 / props.minuteStep) }, (_, index) => String(index * props.minuteStep).padStart(2, '0')).filter(value => Number(value) < 60)
  if (selectedMinute.value && !values.includes(selectedMinute.value)) values.push(selectedMinute.value)
  return values.sort()
})
const displayValue = computed(() => {
  if (!props.modelValue) return props.placeholder
  if (props.mode === 'time') return props.modelValue
  const [year, month, day] = datePart.value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const dateText = zh.value ? month + '月' + day + '日 周' + '日一二三四五六'[date.getDay()] : new Intl.DateTimeFormat(props.locale, { month: 'short', day: 'numeric', weekday: 'short' }).format(date)
  return props.mode === 'date' ? dateText : dateText + '  ' + timePart.value
})
const monthCells = computed(() => {
  const year = cursor.value.getFullYear()
  const month = cursor.value.getMonth()
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - offset)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const value = localDateValue(date)
    return { value, day: date.getDate(), current: date.getMonth() === month, today: value === localDateValue(), selected: value === selectedDate.value }
  })
})

function commit(date = datePart.value, time = timePart.value) {
  const next = props.mode === 'date' ? date : props.mode === 'time' ? time : date + 'T' + time
  emit('update:modelValue', next)
  emit('change', next)
}
function chooseDate(value) { commit(value, timePart.value) }
function chooseTime(hour, minute) { commit(datePart.value, hour + ':' + minute) }
function setHour(event) { chooseTime(event.target.value, selectedMinute.value) }
function setMinute(event) { chooseTime(selectedHour.value, event.target.value) }
function chooseToday(offset = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  chooseDate(localDateValue(date))
  cursor.value = date
}
function chooseNow() {
  const date = roundedFutureDate(0, props.minuteStep)
  if (props.mode === 'time') commit('', localTimeValue(date))
  else commit(localDateValue(date), localTimeValue(date))
  cursor.value = date
}
function clear() { emit('update:modelValue', ''); emit('change', ''); open.value = false }
function moveMonth(amount) { const date = new Date(cursor.value); date.setDate(1); date.setMonth(date.getMonth() + amount); cursor.value = date }
function syncCursor() {
  const value = selectedDate.value
  if (!value) { cursor.value = new Date(); return }
  const [year, month, day] = value.split('-').map(Number)
  cursor.value = new Date(year, month - 1, day)
}
function updatePosition() {
  if (!trigger.value) return
  const rect = trigger.value.getBoundingClientRect()
  const width = Math.min(336, window.innerWidth - 20)
  const left = Math.min(Math.max(10, rect.left), window.innerWidth - width - 10)
  const estimatedHeight = hasDate.value ? 430 : 190
  const height = Math.min(panel.value?.offsetHeight || estimatedHeight, window.innerHeight - 20)
  const above = rect.top
  const below = window.innerHeight - rect.bottom
  position.width = width + 'px'
  position.left = left + 'px'
  const desiredTop = below >= height || below >= above ? rect.bottom + 7 : rect.top - height - 7
  position.top = Math.min(Math.max(10, desiredTop), window.innerHeight - height - 10) + 'px'
  position.bottom = 'auto'
}
async function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) { syncCursor(); await nextTick(); updatePosition() }
}
function closeOnOutside(event) {
  if (!open.value || root.value?.contains(event.target) || panel.value?.contains(event.target)) return
  open.value = false
}
function handleKey(event) { if (event.key === 'Escape') open.value = false }
watch(() => props.modelValue, () => { if (open.value) syncCursor() })
onMounted(() => {
  document.addEventListener('pointerdown', closeOnOutside)
  window.addEventListener('keydown', handleKey)
  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeOnOutside)
  window.removeEventListener('keydown', handleKey)
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
})
</script>

<template>
  <div ref="root" class="date-time-picker" :class="{ disabled, empty: !modelValue }">
    <div class="picker-control">
      <button ref="trigger" type="button" class="picker-trigger" :disabled="disabled" :aria-expanded="open" aria-haspopup="dialog" @click="toggle"><CalendarDays v-if="hasDate" :size="16" /><Clock3 v-else :size="16" /><span>{{ displayValue }}</span></button>
      <button v-if="clearable && modelValue" type="button" class="trigger-clear" :aria-label="copy.clear" @click="clear"><X :size="15" /></button>
    </div>
    <Teleport to="body">
      <div v-if="open" ref="panel" class="date-time-panel" :style="position" role="dialog" :aria-label="copy.dialog">
        <template v-if="hasDate">
          <div class="picker-presets">
            <button type="button" @click="chooseToday(0)">{{ copy.today }}</button>
            <button type="button" @click="chooseToday(1)">{{ copy.tomorrow }}</button>
            <button type="button" @click="chooseToday(7)">{{ copy.nextWeek }}</button>
          </div>
          <header class="picker-month">
            <button type="button" :aria-label="copy.previousMonth" @click="moveMonth(-1)"><ChevronLeft :size="17" /></button>
            <strong>{{ zh ? `${cursor.getFullYear()}年 ${cursor.getMonth() + 1}月` : new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(cursor) }}</strong>
            <button type="button" :aria-label="copy.nextMonth" @click="moveMonth(1)"><ChevronRight :size="17" /></button>
          </header>
          <div class="picker-week"><span v-for="day in weekdays" :key="day">{{ day }}</span></div>
          <div class="picker-days">
            <button v-for="cell in monthCells" :key="cell.value" type="button" :class="{ muted: !cell.current, today: cell.today, selected: cell.selected }" :aria-label="cell.value" @click="chooseDate(cell.value)">
              <span>{{ cell.day }}</span><Check v-if="cell.selected" :size="10" />
            </button>
          </div>
        </template>
        <div v-if="hasTime" class="picker-time">
          <span><Clock3 :size="15" />{{ copy.time }}</span>
          <label><select :value="selectedHour" :aria-label="copy.hour" @change="setHour"><option v-for="hour in hours" :key="hour" :value="hour">{{ hour }}</option></select><small v-if="zh">时</small></label>
          <b>:</b>
          <label><select :value="selectedMinute" :aria-label="copy.minute" @change="setMinute"><option v-for="minute in minuteOptions" :key="minute" :value="minute">{{ minute }}</option></select><small v-if="zh">分</small></label>
        </div>
        <div v-if="hasTime" class="time-presets">
          <button type="button" @click="chooseNow">{{ copy.now }}</button><button type="button" @click="chooseTime('09','00')">09:00</button><button type="button" @click="chooseTime('12','00')">12:00</button><button type="button" @click="chooseTime('18','00')">18:00</button>
        </div>
        <footer><button v-if="clearable" type="button" class="picker-clear" @click="clear">{{ copy.clear }}</button><button type="button" class="picker-done" @click="open = false">{{ copy.done }}</button></footer>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.date-time-picker{width:100%;min-width:0}.picker-control{position:relative}.picker-trigger{box-sizing:border-box;width:100%;min-height:38px;display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--text);padding:7px 34px 7px 9px;text-align:left;font:inherit;cursor:pointer}.picker-trigger:hover,.picker-trigger[aria-expanded=true]{border-color:color-mix(in srgb,var(--accent),var(--line) 35%);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent),transparent 88%)}.picker-trigger span{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.empty .picker-trigger span{color:var(--muted)}.trigger-clear{position:absolute;right:5px;top:50%;transform:translateY(-50%);width:28px;height:28px;display:grid;place-items:center;border:0;border-radius:6px;background:transparent;color:var(--muted)}.trigger-clear:hover{background:var(--hover);color:var(--text)}.disabled{opacity:.55}.date-time-panel{position:fixed;z-index:320;box-sizing:border-box;max-height:calc(100vh - 20px);overflow:auto;padding:12px;background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:12px;box-shadow:0 18px 55px #0005;font-size:13px}.date-time-panel button,.date-time-panel select{font:inherit}.picker-presets,.time-presets{display:flex;gap:6px}.picker-presets button,.time-presets button{flex:1;border:1px solid var(--line);border-radius:7px;background:var(--bg);color:var(--muted);padding:6px 5px;cursor:pointer}.picker-presets button:hover,.time-presets button:hover{color:var(--accent);border-color:var(--accent)}.picker-month{display:grid;grid-template-columns:32px 1fr 32px;align-items:center;text-align:center;margin:10px 0 6px}.picker-month button{width:30px;height:30px;display:grid;place-items:center;border:0;border-radius:6px;background:transparent;color:var(--text)}.picker-month button:hover{background:var(--hover)}.picker-week,.picker-days{display:grid;grid-template-columns:repeat(7,1fr);text-align:center}.picker-week span{padding:4px;color:var(--muted);font-size:11px}.picker-days button{position:relative;aspect-ratio:1;border:0;border-radius:7px;background:transparent;color:var(--text);display:grid;place-items:center;cursor:pointer}.picker-days button:hover{background:var(--hover)}.picker-days button.muted{color:color-mix(in srgb,var(--muted),transparent 35%)}.picker-days button.today span{color:var(--accent);font-weight:700}.picker-days button.selected{background:var(--accent);color:#fff}.picker-days button.selected span{color:#fff}.picker-days button svg{position:absolute;right:2px;bottom:2px}.picker-time{display:flex;align-items:center;gap:7px;margin-top:10px;padding:10px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.picker-time>span{display:flex;align-items:center;gap:5px;margin-right:auto;color:var(--muted)}.picker-time label{display:flex!important;align-items:center;gap:3px}.picker-time select{appearance:none;width:48px;border:1px solid var(--line);border-radius:7px;background:var(--bg);color:var(--text);padding:6px;text-align:center}.picker-time small{color:var(--muted)}.time-presets{margin-top:9px}.date-time-panel footer{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}.date-time-panel footer button{border:0;border-radius:7px;padding:7px 13px;cursor:pointer}.picker-clear{margin-right:auto;background:transparent;color:var(--muted)}.picker-done{background:var(--accent);color:#fff}@media(max-width:520px){.date-time-panel{max-height:calc(100vh - 20px);overflow:auto}.picker-days button{min-height:34px}.picker-time{padding-inline:2px}}
</style>
