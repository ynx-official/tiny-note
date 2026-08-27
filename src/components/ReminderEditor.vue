<script setup lang="ts">
import { computed } from 'vue'
import { Bell, BellOff, Repeat2, TimerReset } from 'lucide-vue-next'
import DateTimePicker from './DateTimePicker.vue'
import { localDateTimeValue, roundedFutureDate } from '../utils/dateTime'

interface ReminderDraft { enabled: boolean; mode: string; triggerAt: string; offsetMinutes: number; intervalMinutes: number }

const props = withDefaults(defineProps<{ modelValue?: ReminderDraft | null; hasAnchor?: boolean; locale?: string; disabled?: boolean }>(), { modelValue: null, hasAnchor: true, locale: 'zh-CN', disabled: false })
const emit = defineEmits(['update:modelValue'])
const inputValue = (event: Event) => (event.target as HTMLInputElement).value
const fallback = { enabled: false, mode: 'at', triggerAt: '', offsetMinutes: 10, intervalMinutes: 10 }
const value = computed({ get: () => props.modelValue || fallback, set: next => emit('update:modelValue', next) })
const beforePresets = [5, 10, 30, 60, 1440]
const intervalPresets = [5, 10, 30, 60]
const zh = computed(() => props.locale === 'zh-CN')
const copy = computed(() => zh.value ? {
  reminder: '提醒', on: '按计划发送通知', off: '关闭', enable: '启用提醒', at: '指定时间', before: '提前提醒', interval: '循环提醒',
  reminderTime: '提醒时间', atHint: '到达这个时间时提醒一次。', beforeHowLong: '提前多久', custom: '自定义', minute: '分钟',
  beforeHint: '根据开始或截止时间自动计算，无需再选日期。', beforeWarning: '请先设置具体的开始或截止时间。',
  intervalLabel: '提醒间隔', every: '每隔', first: '首次提醒（可选）', firstPlaceholder: '自动：从现在起一个间隔后',
  intervalHint: '留空会自动从当前时间加一个间隔开始，直到完成或手动停止。', hour: '1 小时', day: '1 天'
} : {
  reminder: 'Reminder', on: 'Notifications are scheduled', off: 'Off', enable: 'Enable reminder', at: 'At time', before: 'Before due', interval: 'Repeating',
  reminderTime: 'Reminder time', atHint: 'Send one notification at this time.', beforeHowLong: 'How long before', custom: 'Custom', minute: 'min',
  beforeHint: 'Calculated automatically from the start or due time.', beforeWarning: 'Set a specific start or due time first.',
  intervalLabel: 'Alert interval', every: 'Every', first: 'First alert (optional)', firstPlaceholder: 'Automatic: one interval from now',
  intervalHint: 'Leave empty to start one interval from now and continue until completed or stopped.', hour: '1 hour', day: '1 day'
})
function durationLabel(minutes: number) { return minutes === 1440 ? copy.value.day : minutes >= 60 ? copy.value.hour : `${minutes} ${copy.value.minute}` }
function patch(field: keyof ReminderDraft, next: string | number | boolean) { value.value = { ...fallback, ...value.value, [field]: next } as ReminderDraft }
function defaultTrigger() { return localDateTimeValue(roundedFutureDate(30, 5)) }
function toggle() {
  const enabled = !value.value.enabled
  value.value = { ...fallback, ...value.value, enabled, triggerAt: enabled && value.value?.mode === 'at' && !value.value?.triggerAt ? defaultTrigger() : value.value?.triggerAt || '' }
}
function setMode(mode: string) {
  const next = { ...fallback, ...value.value, mode }
  if (mode === 'at' && !next.triggerAt) next.triggerAt = defaultTrigger()
  value.value = next
}
</script>

<template>
  <section class="reminder-editor" :class="{ disabled }">
    <header>
      <div><component :is="value.enabled ? Bell : BellOff" :size="16" /><span><strong>{{ copy.reminder }}</strong><small>{{ value.enabled ? copy.on : copy.off }}</small></span></div>
      <button type="button" class="switch" role="switch" :aria-checked="value.enabled" :disabled="disabled" :aria-label="copy.enable" @click="toggle"><i></i></button>
    </header>
    <template v-if="value.enabled">
      <div class="reminder-modes" role="group" aria-label="提醒方式">
        <button type="button" :class="{ active: value.mode === 'at' }" @click="setMode('at')">{{ copy.at }}</button>
        <button type="button" :class="{ active: value.mode === 'before' }" :disabled="!hasAnchor" @click="setMode('before')">{{ copy.before }}</button>
        <button type="button" :class="{ active: value.mode === 'interval' }" @click="setMode('interval')">{{ copy.interval }}</button>
      </div>

      <div v-if="value.mode === 'at'" class="reminder-section">
        <label>{{ copy.reminderTime }}</label>
        <DateTimePicker :model-value="value.triggerAt" :locale="locale" :placeholder="copy.reminderTime" :disabled="disabled" @update:model-value="patch('triggerAt', $event)" />
        <small>{{ copy.atHint }}</small>
      </div>

      <div v-else-if="value.mode === 'before'" class="reminder-section">
        <label>{{ copy.beforeHowLong }}</label>
        <div class="reminder-presets">
          <button v-for="minutes in beforePresets" :key="minutes" type="button" :class="{ active: Number(value.offsetMinutes) === minutes }" @click="patch('offsetMinutes', minutes)">{{ durationLabel(minutes) }}</button>
        </div>
        <label class="custom-number"><span>{{ copy.custom }}</span><input type="number" min="1" max="10080" :value="value.offsetMinutes" :disabled="disabled || !hasAnchor" @input="patch('offsetMinutes', Number(inputValue($event)))"><span>{{ copy.minute }}</span></label>
        <small v-if="hasAnchor">{{ copy.beforeHint }}</small>
        <small v-else class="warning">{{ copy.beforeWarning }}</small>
      </div>

      <div v-else class="reminder-section">
        <label><Repeat2 :size="14" />{{ copy.intervalLabel }}</label>
        <div class="reminder-presets">
          <button v-for="minutes in intervalPresets" :key="minutes" type="button" :class="{ active: Number(value.intervalMinutes) === minutes }" @click="patch('intervalMinutes', minutes)">{{ durationLabel(minutes) }}</button>
        </div>
        <label class="custom-number"><span>{{ copy.every }}</span><input type="number" min="1" max="10080" :value="value.intervalMinutes" :disabled="disabled" @input="patch('intervalMinutes', Number(inputValue($event)))"><span>{{ copy.minute }}</span></label>
        <label class="first-label"><TimerReset :size="14" />{{ copy.first }}</label>
        <DateTimePicker :model-value="value.triggerAt" :locale="locale" :placeholder="copy.firstPlaceholder" :disabled="disabled" @update:model-value="patch('triggerAt', $event)" />
        <small>{{ copy.intervalHint }}</small>
      </div>
    </template>
  </section>
</template>

<style scoped>
.reminder-editor{display:grid;gap:12px;padding:13px;border:1px solid var(--line);border-radius:11px;background:color-mix(in srgb,var(--panel),var(--bg) 28%)}.reminder-editor>header{display:flex;align-items:center;justify-content:space-between}.reminder-editor>header>div{display:flex;align-items:center;gap:9px}.reminder-editor>header span{display:grid;gap:2px}.reminder-editor strong{font-size:13px}.reminder-editor small{color:var(--muted);font-size:11px}.switch{position:relative!important;display:block!important;width:36px;height:20px;padding:0;border:0;background:transparent}.switch i{display:block;width:36px;height:20px;border-radius:12px;background:var(--line);transition:.18s}.switch i::after{content:"";position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #0004;transition:.18s}.switch[aria-checked=true] i{background:var(--accent)}.switch[aria-checked=true] i::after{transform:translateX(16px)}.switch:focus-visible i{outline:2px solid var(--accent);outline-offset:2px}.reminder-modes{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;padding:3px;border-radius:8px;background:var(--bg)}.reminder-modes button{border:0;border-radius:6px;background:transparent;color:var(--muted);padding:7px 4px;font:inherit;font-size:12px;cursor:pointer}.reminder-modes button.active{background:var(--panel);color:var(--accent);box-shadow:0 1px 4px #0002;font-weight:600}.reminder-modes button:disabled{opacity:.38}.reminder-section{display:grid;gap:8px}.reminder-section>label{display:flex;align-items:center;gap:6px;color:var(--text);font-size:12px;font-weight:600}.reminder-presets{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.reminder-presets button{border:1px solid var(--line);border-radius:7px;background:var(--bg);color:var(--muted);padding:6px 3px;font:inherit;font-size:11px;white-space:nowrap}.reminder-presets button.active{border-color:var(--accent);background:color-mix(in srgb,var(--accent),transparent 88%);color:var(--accent)}.custom-number{display:grid!important;grid-template-columns:auto minmax(60px,90px) auto!important;justify-content:start!important;color:var(--muted)!important;font-weight:400!important}.custom-number input{box-sizing:border-box;width:100%;min-height:32px;border:1px solid var(--line);border-radius:7px;background:var(--bg);color:var(--text);padding:5px 8px;font:inherit}.first-label{margin-top:3px}.warning{color:#dc2626!important}.disabled{opacity:.6}@media(max-width:480px){.reminder-presets{grid-template-columns:repeat(2,1fr)}.reminder-modes button{font-size:11px}}
</style>
