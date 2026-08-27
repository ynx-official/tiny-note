<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Bell, CalendarDays, CheckCircle2, Clock3, Edit3, Save, Trash2 } from 'lucide-vue-next'
import { EVENT_COLORS, useCalendarStore } from '../stores/calendar'
import { ensureReminderPermission, normalizedReminder, reminderSummary, toDateTimeLocal } from '../services/reminders'
import ReminderEditor from '../components/ReminderEditor.vue'
import DateTimePicker from '../components/DateTimePicker.vue'
import { compareLocalEventTimes, shiftEventStart } from '../utils/dateTime'
import { errorMessage, type CalendarEvent, type Reminder } from '../types/domain'

interface EventForm {
  title: string; startDate: string; endDate: string; startTime: string; endTime: string
  allDay: boolean; description: string; color: string; priority: string; completed: boolean
  reminder: Partial<Reminder> & { enabled: boolean; mode: string; triggerAt: string; offsetMinutes: number; intervalMinutes: number }
}

const route = useRoute()
const router = useRouter()
const store = useCalendarStore()
const editing = ref(false)
const saving = ref(false)
const error = ref('')
const event = computed(() => store.byId(String(route.params.id || '')))
const form = reactive<EventForm>({ title: '', startDate: '', endDate: '', startTime: '', endTime: '', allDay: false, description: '', color: EVENT_COLORS[0], priority: 'important', completed: false, reminder: { enabled: false, mode: 'at', triggerAt: '', offsetMinutes: 10, intervalMinutes: 10 } })

function fill(item: CalendarEvent) {
  Object.assign(form, {
    title: item.title, startDate: item.startDate, endDate: item.endDate, startTime: item.startTime, endTime: item.endTime,
    allDay: item.allDay, description: item.description, color: item.color, priority: item.priority, completed: item.completed,
    reminder: item.reminder
      ? { enabled: item.reminder.enabled, mode: item.reminder.mode, triggerAt: toDateTimeLocal(item.reminder.triggerAt), offsetMinutes: item.reminder.offsetMinutes || 10, intervalMinutes: item.reminder.intervalMinutes || 10 }
      : { enabled: false, mode: 'at', triggerAt: '', offsetMinutes: 10, intervalMinutes: 10 }
  })
}
watch(event, item => { if (item) fill(item) }, { immediate: true })
function changeStartDate(value: string) { const end = shiftEventStart(form, value, form.startTime); form.startDate = value; Object.assign(form, end) }
function changeEndDate(value: string) { form.endDate = value; if (!form.startDate || value < form.startDate) form.startDate = value }
function changeStartTime(value: string) { const end = shiftEventStart(form, form.startDate, value); form.startTime = value; Object.assign(form, end) }
async function save() {
  try {
    saving.value = true
    error.value = ''
    if (!form.startDate || !form.endDate) throw new Error('请选择开始和结束日期')
    if (!form.allDay && (!form.startTime || !form.endTime || compareLocalEventTimes(form) <= 0)) throw new Error('结束时间需要晚于开始时间')
    const reminder = normalizedReminder(form.reminder, { hasAnchor: !form.allDay && Boolean(form.startTime) })
    if (reminder && !(await ensureReminderPermission())) throw new Error('未获得系统通知权限')
    const current = event.value
    if (!current) throw new Error('日程不存在')
    await store.update(current.id, { ...form, reminder })
    editing.value = false
  } catch (reason) { error.value = errorMessage(reason, String(reason)) } finally { saving.value = false }
}
async function toggle() { const current = event.value; if (current) await store.update(current.id, { ...current, completed: !current.completed, reminder: current.reminder?.enabled ? { ...current.reminder } : null }) }
async function remove() { const current = event.value; if (!current || !window.confirm('确定删除这个日程吗？')) return; await store.remove(current.id); router.push('/calendar') }
onMounted(() => { if (!store.events.length) store.load() })
</script>

<template>
  <section class="event-detail">
    <header>
      <button @click="router.push('/calendar')"><ArrowLeft :size="17" />返回日历</button>
      <div v-if="event" class="detail-actions"><button @click="toggle"><CheckCircle2 :size="16" />{{ event.completed ? '取消完成' : '标记完成' }}</button><button @click="editing = !editing"><Edit3 :size="16" />{{ editing ? '取消编辑' : '编辑' }}</button><button class="danger" @click="remove"><Trash2 :size="16" />删除</button></div>
    </header>
    <div v-if="!event" class="detail-empty"><CalendarDays :size="36" /><b>日程不存在</b></div>
    <template v-else-if="!editing">
      <main>
        <div class="detail-title"><i :style="{ background: event.color }"></i><div><small>日程安排</small><h1 :class="{ completed: event.completed }">{{ event.title }}</h1></div></div>
        <dl><div><dt><CalendarDays :size="16" />日期</dt><dd>{{ event.startDate }}<template v-if="event.endDate !== event.startDate"> — {{ event.endDate }}</template></dd></div><div><dt><Clock3 :size="16" />时间</dt><dd>{{ event.allDay ? '全天' : event.startTime + ' — ' + event.endTime }}</dd></div><div><dt><Bell :size="16" />提醒</dt><dd>{{ reminderSummary(event.reminder) }}</dd></div><div><dt>优先级</dt><dd>{{ event.priority === 'urgent' ? '紧急' : event.priority === 'minor' ? '次要' : '重要' }}</dd></div></dl>
        <article><h2>描述</h2><p>{{ event.description || '暂无描述' }}</p></article>
      </main>
    </template>
    <form v-else class="detail-form" @submit.prevent="save">
      <label>标题<input v-model="form.title"></label>
      <div class="grid"><label>开始日期<DateTimePicker mode="date" :model-value="form.startDate" :clearable="false" @update:model-value="changeStartDate" /></label><label>结束日期<DateTimePicker mode="date" :model-value="form.endDate" :clearable="false" @update:model-value="changeEndDate" /></label></div>
      <label class="check"><input v-model="form.allDay" type="checkbox">全天</label>
      <div v-if="!form.allDay" class="grid"><label>开始时间<DateTimePicker mode="time" :model-value="form.startTime" :clearable="false" @update:model-value="changeStartTime" /></label><label>结束时间<DateTimePicker v-model="form.endTime" mode="time" :clearable="false" /></label></div>
      <small v-if="!form.allDay" class="time-hint">调整开始时间时，会自动保留日程时长。</small>
      <label>描述<textarea v-model="form.description" rows="5"></textarea></label>
      <div class="grid"><label>优先级<select v-model="form.priority"><option value="urgent">紧急</option><option value="important">重要</option><option value="minor">次要</option></select></label><fieldset><legend>颜色</legend><div class="colors"><button v-for="color in EVENT_COLORS" :key="color" type="button" :class="{ active: form.color === color }" :style="{ background: color }" @click="form.color = color"></button></div></fieldset></div>
      <ReminderEditor v-model="form.reminder" :has-anchor="!form.allDay && Boolean(form.startTime)" />
      <p v-if="error" class="error">{{ error }}</p>
      <button class="save" :disabled="saving"><Save :size="16" />{{ saving ? '保存中…' : '保存修改' }}</button>
    </form>
  </section>
</template>

<style scoped>
.event-detail{height:100%;overflow:auto;background:var(--bg);color:var(--text)}.event-detail>header{height:60px;padding:0 22px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between}.event-detail button{display:flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:7px;background:var(--panel);color:var(--text);padding:8px 11px}.detail-actions{display:flex;gap:8px}.detail-actions .danger{color:#dc2626}.event-detail main,.detail-form{width:min(760px,calc(100% - 40px));margin:34px auto}.detail-title{display:flex;align-items:center;gap:14px}.detail-title i{width:7px;height:48px;border-radius:5px}.detail-title small{color:var(--muted)}.detail-title h1{margin:5px 0;font-size:28px}.completed{text-decoration:line-through;opacity:.6}dl{margin:30px 0;border:1px solid var(--line);border-radius:10px;background:var(--panel)}dl>div{display:grid;grid-template-columns:150px 1fr;padding:14px;border-bottom:1px solid var(--line)}dl>div:last-child{border:0}dt{display:flex;align-items:center;gap:8px;color:var(--muted)}dd{margin:0}.event-detail article{border-top:1px solid var(--line)}.event-detail article h2{font-size:15px}.event-detail article p{white-space:pre-wrap;color:var(--muted)}.detail-empty{height:70%;display:grid;place-content:center;justify-items:center;gap:12px;color:var(--muted)}.detail-form{display:grid;gap:15px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:22px;box-sizing:border-box}.detail-form label{display:grid;gap:6px;font-size:13px}.detail-form input,.detail-form textarea,.detail-form select{box-sizing:border-box;width:100%;border:1px solid var(--line);border-radius:7px;padding:9px;background:var(--bg);color:var(--text);font:inherit}.detail-form .check{display:flex;align-items:center}.detail-form .check input{width:auto}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}fieldset{border:0;padding:0;margin:0}legend{font-size:13px;margin-bottom:8px}.colors{display:flex;flex-wrap:wrap;gap:6px}.colors button{width:22px;height:22px;padding:0;border-radius:50%;border:2px solid transparent}.colors button.active{box-shadow:0 0 0 2px var(--panel),0 0 0 4px var(--accent)}.detail-form .save{justify-self:end;background:var(--accent);color:#fff}.time-hint{margin-top:-8px;color:var(--muted)}.error{color:#dc2626}@media(max-width:620px){.grid{grid-template-columns:1fr}.detail-actions button{font-size:0}.event-detail main,.detail-form{width:min(100% - 24px,760px)}}
</style>
