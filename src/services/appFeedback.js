import { reactive } from 'vue'

export const feedbackState = reactive({
  dialog: {
    visible: false,
    title: '',
    message: '',
    tone: 'default',
    confirmLabel: '确认',
    cancelLabel: '取消',
    busy: false
  },
  toasts: []
})

const dialogQueue = []
let activeDialogResolve = null

function showNextDialog() {
  if (activeDialogResolve || dialogQueue.length === 0) return
  const request = dialogQueue.shift()
  activeDialogResolve = request.resolve
  Object.assign(feedbackState.dialog, {
    visible: true,
    title: request.options.title || '请确认',
    message: request.options.message || '',
    tone: request.options.tone || 'default',
    confirmLabel: request.options.confirmLabel || '确认',
    cancelLabel: request.options.cancelLabel || '取消',
    busy: false
  })
}

export function requestConfirmation(options) {
  const normalized = typeof options === 'string' ? { message: options } : (options || {})
  return new Promise(resolve => {
    dialogQueue.push({ options: normalized, resolve })
    showNextDialog()
  })
}

function resolveDialog(value) {
  if (!activeDialogResolve) return
  const resolve = activeDialogResolve
  activeDialogResolve = null
  feedbackState.dialog.visible = false
  resolve(value)
  globalThis.queueMicrotask(showNextDialog)
}

export function confirmAppDialog() { resolveDialog(true) }
export function cancelAppDialog() { resolveDialog(false) }

export function dismissToast(id) {
  const index = feedbackState.toasts.findIndex(item => item.id === id)
  if (index >= 0) feedbackState.toasts.splice(index, 1)
}

export function showToast(message, options = {}) {
  const id = crypto.randomUUID()
  const toast = {
    id,
    message: String(message || ''),
    tone: options.tone || 'info',
    actionLabel: options.actionLabel || '',
    onAction: options.onAction || null,
    createdAt: Date.now()
  }
  feedbackState.toasts.push(toast)
  const duration = options.duration ?? 4000
  if (duration > 0) window.setTimeout(() => dismissToast(id), duration)
  return id
}

export function runToastAction(toast) {
  toast?.onAction?.()
  if (toast?.id) dismissToast(toast.id)
}
