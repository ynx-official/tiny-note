import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ authenticated: true, listener: null as (() => void) | null }))

vi.mock('../services/apiClient', () => ({
  getAuthSnapshot: () => ({ authenticated: auth.authenticated }),
  subscribeAuth: (listener: () => void) => { auth.listener = listener; return () => { auth.listener = null } }
}))

describe('router authentication invalidation', () => {
  beforeEach(() => {
    auth.authenticated = true
    auth.listener = null
  })

  it('returns an expired protected session to login', async () => {
    vi.resetModules()
    const router = (await import('./index')).default
    await router.push('/notes')
    await router.isReady()

    auth.authenticated = false
    expect(auth.listener).toBeTypeOf('function')
    auth.listener?.()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
    expect(router.currentRoute.value.query.redirect).toBe('/notes')
  })
})
