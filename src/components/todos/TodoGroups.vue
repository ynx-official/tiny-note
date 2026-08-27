<script setup lang="ts">
import { Bell, Check, CheckCircle2, ChevronDown, LoaderCircle } from 'lucide-vue-next'
import type { TodosWorkspace } from '../../composables/useTodosWorkspace'

const { workspace } = defineProps<{ workspace: TodosWorkspace }>()
const {
  t, loading, error, store, visible, groups, collapsedGroups, toggleGroup, groupLabel,
  selectedId, toggle, select, formatDue, isOverdue, reminderSummary, locale
} = workspace
</script>

<template>
  <div v-if="loading" class="todo-state"><LoaderCircle class="spin" :size="20" />{{ t('todoLoading') }}</div>
  <div v-else-if="error" class="todo-state error">{{ error }}<button @click="store.load()">{{ t('refresh') }}</button></div>
  <div v-else-if="!visible.length" class="todo-empty"><CheckCircle2 :size="38" /><strong>{{ t('todoEmpty') }}</strong><span>{{ t('todoEmptyHint') }}</span></div>
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
</template>
