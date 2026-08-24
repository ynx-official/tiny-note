import { reactive } from 'vue'

export const promptDialogState = reactive({
  visible: false,
  title: '',
  value: '',
  placeholder: '',
  inputType: 'text'
})

const queue = []
let activeResolve = null

function showNextPrompt() {
  if (activeResolve || queue.length === 0) return
  const request = queue.shift()
  activeResolve = request.resolve
  promptDialogState.title = request.title
  promptDialogState.value = request.defaultValue
  promptDialogState.placeholder = request.options.placeholder || ''
  promptDialogState.inputType = request.options.inputType || 'text'
  promptDialogState.visible = true
}

export function requestPrompt(title, defaultValue = '', options = {}) {
  return new Promise(resolve => {
    queue.push({ title, defaultValue: defaultValue ?? '', options, resolve })
    showNextPrompt()
  })
}

export function resolvePrompt(value) {
  if (!activeResolve) return
  const resolve = activeResolve
  activeResolve = null
  promptDialogState.visible = false
  resolve(value)
  globalThis.queueMicrotask(showNextPrompt)
}

export function cancelPrompt() {
  resolvePrompt(null)
}
