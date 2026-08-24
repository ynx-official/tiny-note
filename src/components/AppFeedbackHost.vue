<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-vue-next'
import { useTasksStore } from '../stores/tasks'
import {
  cancelAppDialog,
  confirmAppDialog,
  dismissToast,
  feedbackState,
  runToastAction
} from '../services/appFeedback'

const tasks = useTasksStore()
const confirmButton = ref(null)
const toneIcons = { success: CheckCircle2, warning: TriangleAlert, error: AlertCircle, info: Info }
const allToasts = computed(() => [
  ...feedbackState.toasts.map(item => ({ ...item, source: 'app' })),
  ...tasks.notices.map(item => ({ ...item, source: 'task', tone: item.tone || 'info' }))
])

watch(() => feedbackState.dialog.visible, async visible => {
  if (!visible) return
  await nextTick()
  confirmButton.value?.focus()
})

function dismiss(item) {
  if (item.source === 'task') tasks.dismissNotice(item.id)
  else dismissToast(item.id)
}

function activate(item) {
  if (item.source === 'task') {
    tasks.dismissNotice(item.id)
    return
  }
  runToastAction(item)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="app-feedback-fade">
      <div v-if="feedbackState.dialog.visible" class="app-feedback-overlay">
        <section class="app-feedback-dialog" :class="`is-${feedbackState.dialog.tone}`" role="alertdialog" aria-modal="true" aria-labelledby="app-feedback-title" aria-describedby="app-feedback-message" @keydown.esc.prevent="cancelAppDialog">
          <div class="app-feedback-content">
            <span class="app-feedback-dialog-icon" aria-hidden="true"><AlertCircle v-if="feedbackState.dialog.tone === 'danger'" :size="20" /><Info v-else :size="20" /></span>
            <div>
              <strong id="app-feedback-title">{{ feedbackState.dialog.title }}</strong>
              <p id="app-feedback-message">{{ feedbackState.dialog.message }}</p>
            </div>
          </div>
          <footer class="app-feedback-actions">
            <button type="button" class="app-feedback-secondary" @click="cancelAppDialog">{{ feedbackState.dialog.cancelLabel }}</button>
            <button ref="confirmButton" type="button" class="app-feedback-primary" @click="confirmAppDialog">{{ feedbackState.dialog.confirmLabel }}</button>
          </footer>
        </section>
      </div>
    </Transition>
    <div class="app-toast-region" aria-live="polite" aria-relevant="additions">
      <TransitionGroup name="app-toast">
        <article v-for="item in allToasts" :key="`${item.source}-${item.id}`" class="app-toast" :class="`is-${item.tone}`" role="status">
          <component :is="toneIcons[item.tone] || Info" :size="17" class="app-toast-icon" />
          <span>{{ item.message }}</span>
          <button v-if="item.actionLabel" type="button" class="app-toast-action" @click="activate(item)">{{ item.actionLabel }}</button>
          <button type="button" class="app-toast-close" aria-label="关闭提示" @click="dismiss(item)"><X :size="14" /></button>
        </article>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
