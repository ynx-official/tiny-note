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

  it('keeps the workspace shell and opens account login when a protected session expires', async () => {
    vi.resetModules()
    const router = (await import('./index')).default
    await router.push('/notes')
    await router.isReady()

    auth.authenticated = false
    expect(auth.listener).toBeTypeOf('function')
    auth.listener?.()
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/home'))
    expect(router.currentRoute.value.query.login).toBe('1')
    expect(router.currentRoute.value.query.redirect).toBe('/notes')
  }, 15_000)

  it('lets a signed-out user enter home but gates cloud routes through the account drawer', async () => {
    auth.authenticated = false
    vi.resetModules()
    const router = (await import('./index')).default

    await router.push('/home')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/home')
    expect(router.currentRoute.value.query.login).toBeUndefined()

    await router.push('/notes')
    expect(router.currentRoute.value.path).toBe('/home')
    expect(router.currentRoute.value.query).toMatchObject({ login: '1', redirect: '/notes' })
  })

  it('keeps the legacy login URL as an account-drawer entry point', async () => {
    auth.authenticated = false
    vi.resetModules()
    const router = (await import('./index')).default
    await router.push('/login?redirect=/library')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/home')
    expect(router.currentRoute.value.query).toMatchObject({ login: '1', redirect: '/library' })
  })
})
