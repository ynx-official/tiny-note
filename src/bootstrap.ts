export type StartupState = 'boot' | 'shell-ready' | 'hydrating' | 'ready' | 'error'

interface BootstrapDependencies {
  mountShell: () => void
  hydrate: () => Promise<void>
  startDeferredServices?: () => unknown | Promise<unknown>
  documentElement?: HTMLElement
}

interface StartupProbeInternals {
  invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>
}

function reportStartupState(state: StartupState): void {
  const internals = window.__TAURI_INTERNALS__
  if (!internals || typeof internals !== 'object' || !('invoke' in internals) || typeof internals.invoke !== 'function') return
  void (internals as StartupProbeInternals).invoke('startup_probe', {
    state,
    browserTimestamp: performance.timeOrigin + performance.now()
  }).catch(() => {})
}

function setStartupState(element: HTMLElement, state: StartupState): void {
  element.dataset.startupState = state
  const now = performance.now()
  window.__TINY_NOTE_BOOT_TIMINGS__ ??= {}
  window.__TINY_NOTE_BOOT_TIMINGS__[state] = now
  performance.mark(`tiny-note:${state}`)
  if (state === 'shell-ready' || state === 'ready' || state === 'error') reportStartupState(state)
}

export function bootstrapMainWindow({
  mountShell,
  hydrate,
  startDeferredServices,
  documentElement = document.documentElement
}: BootstrapDependencies): Promise<void> {
  mountShell()
  setStartupState(documentElement, 'shell-ready')

  const hydration = Promise.resolve().then(async () => {
    setStartupState(documentElement, 'hydrating')
    try {
      await hydrate()
      setStartupState(documentElement, 'ready')
    } catch {
      setStartupState(documentElement, 'error')
    }
  })

  if (startDeferredServices) {
    void Promise.resolve().then(startDeferredServices).catch(() => {
      // Optional integrations must not replace the usable shell with a boot error.
    })
  }
  return hydration
}
