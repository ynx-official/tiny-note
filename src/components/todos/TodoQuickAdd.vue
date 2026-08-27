<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import TodoQuickScheduler from '../TodoQuickScheduler.vue'
import type { TodosWorkspace } from '../../composables/useTodosWorkspace'

const { workspace } = defineProps<{ workspace: TodosWorkspace }>()
const { t, canQuickAdd, quickAdd, quickTitle, quickInput, quickStartAt, quickDueAt, quickReminder, locale, quickSaving, quickError } = workspace
</script>

<template>
  <form v-if="canQuickAdd" class="todo-quick" @submit.prevent="quickAdd">
    <Plus :size="18" />
    <input ref="quickInput" v-model="quickTitle" :placeholder="t('todoQuickPlaceholder')" />
    <TodoQuickScheduler v-model:start-at="quickStartAt" v-model:due-at="quickDueAt" v-model:reminder="quickReminder" :locale="locale" compact />
    <button class="quick-submit" :disabled="!quickTitle.trim() || quickSaving">{{ quickSaving ? t('todoAdding') : t('add') }}</button>
  </form>
  <p v-if="quickError" class="quick-error" role="alert">{{ quickError }}</p>
</template>
