import { describe, expect, it, vi } from 'vitest'
import { bootstrapMainWindow } from './bootstrap'

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('main window bootstrap', () => {
  it('mounts the shell before settings and models hydration completes', async () => {
    const pending = deferred()
    const root = document.createElement('html')
    const mountShell = vi.fn()

    const hydration = bootstrapMainWindow({ mountShell, hydrate: () => pending.promise, documentElement: root })

    expect(mountShell).toHaveBeenCalledOnce()
    expect(root.dataset.startupState).toBe('shell-ready')
    await Promise.resolve()
    expect(root.dataset.startupState).toBe('hydrating')

    pending.resolve()
    await hydration
    expect(root.dataset.startupState).toBe('ready')
  })

  it('keeps the mounted shell when hydration fails', async () => {
    const root = document.createElement('html')
    const shell = document.createElement('div')

    await bootstrapMainWindow({
      mountShell: () => root.append(shell),
      hydrate: () => Promise.reject(new Error('IPC unavailable')),
      documentElement: root
    })

    expect(root.contains(shell)).toBe(true)
    expect(root.dataset.startupState).toBe('error')
  })
})
