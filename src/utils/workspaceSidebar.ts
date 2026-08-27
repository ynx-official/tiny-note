import { onBeforeUnmount, ref } from 'vue'

export const WORKSPACE_SIDEBAR_DEFAULT_WIDTH = 360
export const WORKSPACE_SIDEBAR_MIN_WIDTH = 300
export const WORKSPACE_SIDEBAR_MAX_WIDTH = 460

const STORAGE_KEY = 'tiny-note-workspace-sidebar-width-v2'

export function clampWorkspaceSidebarWidth(width: number) {
  return Math.min(WORKSPACE_SIDEBAR_MAX_WIDTH, Math.max(WORKSPACE_SIDEBAR_MIN_WIDTH, width))
}

function storedWorkspaceSidebarWidth() {
  try {
    const stored = Number(globalThis.localStorage?.getItem(STORAGE_KEY))
    return Number.isFinite(stored) && stored > 0
      ? clampWorkspaceSidebarWidth(stored)
      : WORKSPACE_SIDEBAR_DEFAULT_WIDTH
  } catch {
    return WORKSPACE_SIDEBAR_DEFAULT_WIDTH
  }
}

export function useWorkspaceSidebar() {
  const sidebarWidth = ref(storedWorkspaceSidebarWidth())
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
      sidebarWidth.value = clampWorkspaceSidebarWidth(startWidth + moveEvent.clientX - startX)
    }
    const onEnd = () => {
      try { globalThis.localStorage?.setItem(STORAGE_KEY, String(sidebarWidth.value)) } catch { /* Persistence is optional. */ }
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
