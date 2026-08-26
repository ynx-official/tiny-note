import { reactive } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from './tauri'
import { downloadBlob } from '../utils/noteExport'

const MAX_EXPORT_BYTES = 64 * 1024 * 1024
let resolveRequest = null

export const exportLocationState = reactive({
  visible: false,
  remember: false,
  busy: false,
  error: ''
})

function isTauriRuntime() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)
}

export async function pickNativeExportDirectory(defaultPath = '') {
  const selected = await open({
    directory: true,
    multiple: false,
    defaultPath: defaultPath || undefined,
    title: '选择文章导出文件夹'
  })
  return typeof selected === 'string' ? selected : ''
}

function requestExportLocation() {
  if (resolveRequest) return Promise.reject(new Error('已有导出位置选择正在进行'))
  exportLocationState.visible = true
  exportLocationState.remember = false
  exportLocationState.busy = false
  exportLocationState.error = ''
  return new Promise(resolve => { resolveRequest = resolve })
}

function finishRequest(value) {
  const resolve = resolveRequest
  resolveRequest = null
  exportLocationState.visible = false
  exportLocationState.busy = false
  exportLocationState.error = ''
  resolve?.(value)
}

export function cancelExportLocationRequest() {
  finishRequest(null)
}

export async function chooseExportLocation() {
  if (!resolveRequest || exportLocationState.busy) return
  exportLocationState.busy = true
  exportLocationState.error = ''
  try {
    const directory = await pickNativeExportDirectory()
    if (directory) finishRequest({ directory, remember: exportLocationState.remember })
    else exportLocationState.busy = false
  } catch (error) {
    exportLocationState.busy = false
    exportLocationState.error = error?.message || '无法打开文件夹选择器'
  }
}

async function blobToBase64(blob) {
  if (blob.size > MAX_EXPORT_BYTES) {
    const error = new Error('导出文件超过 64 MB 限制')
    error.code = 'EXPORT_TOO_LARGE'
    throw error
  }
  const buffer = typeof blob.arrayBuffer === 'function'
    ? await blob.arrayBuffer()
    : await new Promise((resolve, reject) => {
        const reader = new globalThis.FileReader()
        reader.addEventListener('load', () => resolve(reader.result), { once: true })
        reader.addEventListener('error', () => reject(reader.error || new Error('无法读取导出文件')), { once: true })
        reader.readAsArrayBuffer(blob)
      })
  const bytes = new Uint8Array(buffer)
  const chunks = []
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)))
  }
  return globalThis.btoa(chunks.join(''))
}

export async function saveExportBlob(blob, fileName, { appStore } = {}) {
  if (!isTauriRuntime()) {
    downloadBlob(blob, fileName)
    return { fileName, browserDownload: true }
  }

  let directory = String(appStore?.settings?.exportDirectory || '').trim()
  if (!directory) {
    const selection = await requestExportLocation()
    if (!selection) return { cancelled: true }
    directory = selection.directory
    if (selection.remember && appStore?.saveSettings) {
      await appStore.saveSettings({ ...appStore.settings, exportDirectory: directory })
    }
  }

  return invoke('export_write_file', {
    request: {
      directory,
      fileName,
      contentBase64: await blobToBase64(blob)
    }
  })
}
