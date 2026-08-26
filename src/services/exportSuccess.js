import { reactive } from 'vue'
import { invoke } from './tauri'

export const exportSuccessState = reactive({
  visible: false,
  fileName: '',
  path: '',
  busy: false,
  error: ''
})

export function showExportSuccess(result = {}) {
  if (!result.path) return
  Object.assign(exportSuccessState, {
    visible: true,
    fileName: result.fileName || '',
    path: result.path,
    busy: false,
    error: ''
  })
}

export function dismissExportSuccess() {
  exportSuccessState.visible = false
  exportSuccessState.busy = false
  exportSuccessState.error = ''
}

async function runExportSuccessAction(action) {
  if (exportSuccessState.busy || !exportSuccessState.path) return
  exportSuccessState.busy = true
  exportSuccessState.error = ''
  try {
    await action(exportSuccessState.path)
    dismissExportSuccess()
  } catch (error) {
    exportSuccessState.error = error?.message || '无法打开导出文件'
  } finally {
    exportSuccessState.busy = false
  }
}

export function openExportedFile() {
  return runExportSuccessAction(path => invoke('export_open_file', { path }))
}

export function revealExportedFile() {
  return runExportSuccessAction(path => invoke('export_reveal_file', { path }))
}
