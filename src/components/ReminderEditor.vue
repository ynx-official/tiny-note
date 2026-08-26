<script setup>
import { computed } from 'vue'
import { Bell, BellOff } from 'lucide-vue-next'

const props = defineProps({ modelValue: { type: Object, default: null }, hasAnchor: { type: Boolean, default: true }, disabled: Boolean })
const emit = defineEmits(['update:modelValue'])
const value = computed({ get: () => props.modelValue || { enabled: false, mode: 'at', triggerAt: '', offsetMinutes: 10, intervalMinutes: 10 }, set: next => emit('update:modelValue', next) })
function patch(field, next) { value.value = { ...value.value, [field]: next } }
function toggle(event) { patch('enabled', event.target.checked) }
</script>

<template>
  <div class="reminder-editor" :class="{ disabled }">
    <label class="reminder-toggle"><input type="checkbox" :checked="value.enabled" :disabled="disabled" @change="toggle"><Bell v-if="value.enabled" :size="15" /><BellOff v-else :size="15" /><span>提醒</span></label>
    <template v-if="value.enabled">
      <select :value="value.mode" :disabled="disabled" @change="patch('mode', $event.target.value)">
        <option value="at">指定时间</option><option value="before" :disabled="!hasAnchor">提前分钟</option><option value="interval">循环提醒</option>
      </select>
      <input v-if="value.mode === 'at'" type="datetime-local" :value="value.triggerAt" :disabled="disabled" @input="patch('triggerAt', $event.target.value)">
      <label v-else-if="value.mode === 'before'" class="reminder-number"><input type="number" min="1" max="10080" :value="value.offsetMinutes" :disabled="disabled || !hasAnchor" @input="patch('offsetMinutes', Number($event.target.value))"><span>分钟前</span></label>
      <template v-else>
        <label class="reminder-number"><span>每隔</span><input type="number" min="1" max="10080" :value="value.intervalMinutes" :disabled="disabled" @input="patch('intervalMinutes', Number($event.target.value))"><span>分钟</span></label>
        <label class="reminder-first"><span>首次</span><input type="datetime-local" :value="value.triggerAt" :disabled="disabled" @input="patch('triggerAt', $event.target.value)"><small>留空则从当前时间加一个间隔开始</small></label>
      </template>
    </template>
  </div>
</template>

<style scoped>
.reminder-editor{display:grid;gap:10px;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}
.reminder-toggle,.reminder-number,.reminder-first{display:flex;align-items:center;gap:8px;color:var(--text)}.reminder-toggle{font-weight:600}.reminder-toggle input{accent-color:var(--accent)}
select,input{box-sizing:border-box;min-height:34px;border:1px solid var(--line);border-radius:7px;background:var(--bg);color:var(--text);padding:6px 9px;font:inherit}.reminder-number input{width:90px}.reminder-first{align-items:flex-start;flex-wrap:wrap}.reminder-first input{flex:1;min-width:190px}.reminder-first small{width:100%;padding-left:40px;color:var(--muted)}.disabled{opacity:.6}
</style>
