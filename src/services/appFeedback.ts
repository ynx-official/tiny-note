import { reactive } from 'vue'

export type FeedbackTone = 'default' | 'success' | 'warning' | 'error' | 'info' | 'danger'
export interface Toast { id: string; message: string; tone: FeedbackTone; actionLabel: string; onAction: (() => void) | null; createdAt: number }
interface ConfirmationOptions { title?: string; message?: string; tone?: FeedbackTone; confirmLabel?: string; cancelLabel?: string }
interface DialogRequest { options: ConfirmationOptions; resolve(value: boolean): void }

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
  toasts: [] as Toast[]
})

const dialogQueue: DialogRequest[] = []
let activeDialogResolve: ((value: boolean) => void) | null = null

function showNextDialog() {
  if (activeDialogResolve || dialogQueue.length === 0) return
  const request = dialogQueue.shift()
  if (!request) return
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

export function requestConfirmation(options: string | ConfirmationOptions): Promise<boolean> {
  const normalized = typeof options === 'string' ? { message: options } : (options || {})
  return new Promise(resolve => {
    dialogQueue.push({ options: normalized, resolve })
    showNextDialog()
  })
}

function resolveDialog(value: boolean) {
  if (!activeDialogResolve) return
  const resolve = activeDialogResolve
  activeDialogResolve = null
  feedbackState.dialog.visible = false
  resolve(value)
  globalThis.queueMicrotask(showNextDialog)
}

export function confirmAppDialog() { resolveDialog(true) }
export function cancelAppDialog() { resolveDialog(false) }

export function dismissToast(id: string) {
  const index = feedbackState.toasts.findIndex(item => item.id === id)
  if (index >= 0) feedbackState.toasts.splice(index, 1)
}

export function showToast(message: unknown, options: { tone?: FeedbackTone; actionLabel?: string; onAction?: (() => void) | null; duration?: number } = {}) {
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

export function runToastAction(toast?: Toast) {
  toast?.onAction?.()
  if (toast?.id) dismissToast(toast.id)
}
