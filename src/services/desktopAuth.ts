import { emitTo, listen } from '@tauri-apps/api/event'
import type { AuthInfo } from './apiClient'

const REQUEST = 'tiny-note://tray-auth-request'
const SESSION = 'tiny-note://tray-auth-session'
const INVALIDATE = 'tiny-note://tray-auth-expired'
interface Session { token: string; info: AuthInfo | null }
interface Options {
  read: () => Session
  apply: (session: Session) => void
  restore: () => Promise<boolean>
  invalidate: (token: string) => Promise<void>
  subscribe: (listener: () => void) => () => void
}

// Only the two bundled local WebViews participate. Never broadcast a token or
// copy it to browser storage: remember-me remains owned by the main window.
export async function connectDesktopAuth(role: 'main' | 'tray-panel', options: Options) {
  if (role === 'main') {
    const publish = () => emitTo('tray-panel', SESSION, options.read())
    await listen(REQUEST, async () => { await options.restore(); await publish() }, { target: 'main' })
    await listen<string>(INVALIDATE, event => options.invalidate(event.payload), { target: 'main' })
    options.subscribe(() => { void publish().catch(() => { /* tray may be closed */ }) })
    return
  }

  let resolveReady!: () => void
  let rejectReady!: (error: Error) => void
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  const unlisten = await listen<Session>(SESSION, event => {
    options.apply(event.payload)
    resolveReady()
  }, { target: 'tray-panel' })
  const timeout = window.setTimeout(() => rejectReady(new Error('无法同步登录状态，请打开主窗口后重试')), 5000)
  try {
    void emitTo('main', REQUEST).catch(rejectReady)
    await ready
  } catch (error) {
    unlisten()
    throw error
  } finally { window.clearTimeout(timeout) }
}

export async function invalidateMainSession(token: string) {
  await emitTo('main', INVALIDATE, token)
}
