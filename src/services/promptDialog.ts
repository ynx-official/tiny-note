import { reactive } from 'vue'

interface PromptOptions { placeholder?: string; inputType?: string }
interface PromptRequest { title: string; defaultValue: string; options: PromptOptions; resolve(value: string | null): void }

export const promptDialogState = reactive({
  visible: false,
  title: '',
  value: '',
  placeholder: '',
  inputType: 'text'
})

const queue: PromptRequest[] = []
let activeResolve: ((value: string | null) => void) | null = null

function showNextPrompt() {
  if (activeResolve || queue.length === 0) return
  const request = queue.shift()
  if (!request) return
  activeResolve = request.resolve
  promptDialogState.title = request.title
  promptDialogState.value = request.defaultValue
  promptDialogState.placeholder = request.options.placeholder || ''
  promptDialogState.inputType = request.options.inputType || 'text'
  promptDialogState.visible = true
}

export function requestPrompt(title: string, defaultValue = '', options: PromptOptions = {}): Promise<string | null> {
  return new Promise(resolve => {
    queue.push({ title, defaultValue: defaultValue ?? '', options, resolve })
    showNextPrompt()
  })
}

export function resolvePrompt(value: string | null) {
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
