<script setup lang="ts">
import { CalendarClock, CheckCircle2, Circle as CircleIcon, List, ListTodo, Trash2, X } from 'lucide-vue-next'
import TodoQuickScheduler from '../TodoQuickScheduler.vue'
import type { TodosWorkspace } from '../../composables/useTodosWorkspace'

const { workspace } = defineProps<{ workspace: TodosWorkspace }>()
const { store, t, selected, select, form, saveState, saveLabel, locale, permissionWarning, saveError, toggle, remove } = workspace
</script>

<template>
  <aside class="todo-detail" :class="{ open: selected }">
    <template v-if="selected">
      <header><div><small>{{ t('todoDetail') }}</small><span class="save-status" :class="saveState">{{ saveLabel }}</span></div><button class="detail-close" :aria-label="t('close')" @click="select(null)"><X :size="19" /></button></header>
      <form class="todo-detail-form" @submit.prevent>
        <label class="detail-title"><span class="sr-only">{{ t('todoTitle') }}</span><textarea v-model="form.title" rows="2" :placeholder="t('todoTitle')"></textarea></label>
        <label class="detail-notes"><span>{{ t('todoNotes') }}</span><textarea v-model="form.notes" rows="6" :placeholder="t('todoNotesPlaceholder')"></textarea></label>
        <label class="detail-property"><span><List :size="16" />{{ t('todoListAssignment') }}</span><select v-model="form.listId"><option value="">{{ t('todoListNone') }}</option><option v-for="item in store.lists" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
        <div class="detail-property"><span><CalendarClock :size="16" />{{ t('todoSchedule') }}</span><TodoQuickScheduler v-model:start-at="form.startAt" v-model:due-at="form.dueAt" v-model:reminder="form.reminder" :locale="locale" /></div>
        <label class="detail-property"><span><CircleIcon :size="16" />{{ t('todoPriority') }}</span><select v-model="form.priority"><option value="none">{{ t('todoPriorityNone') }}</option><option value="low">{{ t('todoPriorityLow') }}</option><option value="medium">{{ t('todoPriorityMedium') }}</option><option value="high">{{ t('todoPriorityHigh') }}</option></select></label>
        <p v-if="selected.reminder && !selected.reminder.enabled" class="stopped">{{ t('todoReminderStopped') }}</p><p v-if="permissionWarning" class="permission-warning">{{ permissionWarning }}</p><p v-if="saveError" class="form-error" role="alert">{{ saveError }}</p>
      </form>
      <footer><button class="complete-action" @click="toggle(selected)"><CheckCircle2 :size="16" />{{ selected.completedAt ? t('todoRestore') : t('todoMarkCompleted') }}</button><button class="delete-action" @click="remove"><Trash2 :size="16" />{{ t('todoDeletePermanent') }}</button></footer>
    </template>
    <div v-else class="detail-placeholder"><ListTodo :size="42" /><strong>{{ t('todoSelect') }}</strong><span>{{ t('todoSelectHint') }}</span></div>
  </aside>
</template>
