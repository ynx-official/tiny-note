export {}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
    __TINY_NOTE_TRAY_PANEL__?: boolean
    __TINY_NOTE_BOOT_TIMINGS__?: Partial<Record<'boot' | 'static-shell' | 'shell-ready' | 'hydrating' | 'ready' | 'error', number>>
  }
}
