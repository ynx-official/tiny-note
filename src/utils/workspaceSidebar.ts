import { onBeforeUnmount, ref } from 'vue'

export const WORKSPACE_SIDEBAR_DEFAULT_WIDTH = 360
export const WORKSPACE_SIDEBAR_MIN_WIDTH = 300
export const WORKSPACE_SIDEBAR_MAX_WIDTH = 460

const STORAGE_KEY = 'tiny-note-workspace-sidebar-width-v2'
interface SidebarOptions { defaultWidth: number; minWidth: number; maxWidth: number; storageKey: string }
const defaultOptions: SidebarOptions = { defaultWidth: WORKSPACE_SIDEBAR_DEFAULT_WIDTH, minWidth: WORKSPACE_SIDEBAR_MIN_WIDTH, maxWidth: WORKSPACE_SIDEBAR_MAX_WIDTH, storageKey: STORAGE_KEY }

export function clampWorkspaceSidebarWidth(width: number) {
  return Math.min(WORKSPACE_SIDEBAR_MAX_WIDTH, Math.max(WORKSPACE_SIDEBAR_MIN_WIDTH, width))
}

function storedWorkspaceSidebarWidth(options: SidebarOptions) {
  try {
    const stored = Number(globalThis.localStorage?.getItem(options.storageKey))
    return Number.isFinite(stored) && stored > 0
      ? Math.min(options.maxWidth, Math.max(options.minWidth, stored))
      : options.defaultWidth
  } catch {
    return options.defaultWidth
  }
}

export function useWorkspaceSidebar(options: SidebarOptions = defaultOptions) {
  const sidebarWidth = ref(storedWorkspaceSidebarWidth(options))
  const isResizing = ref(false)
  let stopResize: (() => void) | null = null

  function onResizeStart(event: MouseEvent) {
    event.preventDefault()
    stopResize?.()

    const documentRef = globalThis.document
    const startX = event.clientX
    const startWidth = sidebarWidth.value
    isResizing.value = true

    const onMove = (moveEvent: MouseEvent) => {
      sidebarWidth.value = Math.min(options.maxWidth, Math.max(options.minWidth, startWidth + moveEvent.clientX - startX))
    }
    const onEnd = () => {
      try { globalThis.localStorage?.setItem(options.storageKey, String(sidebarWidth.value)) } catch { /* Persistence is optional. */ }
      stopResize?.()
    }

    stopResize = () => {
      documentRef.removeEventListener('mousemove', onMove)
      documentRef.removeEventListener('mouseup', onEnd)
      documentRef.body.style.cursor = ''
      documentRef.body.style.userSelect = ''
      isResizing.value = false
      stopResize = null
    }

    documentRef.body.style.cursor = 'col-resize'
    documentRef.body.style.userSelect = 'none'
    documentRef.addEventListener('mousemove', onMove)
    documentRef.addEventListener('mouseup', onEnd)
  }

  onBeforeUnmount(() => stopResize?.())

  return { sidebarWidth, isResizing, onResizeStart }
}
