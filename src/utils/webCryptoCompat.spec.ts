import { describe, expect, it, vi } from 'vitest'
import { ensureWebCrypto } from '../../scripts/webCryptoCompat'

describe('Vite Web Crypto compatibility', () => {
  it('installs getRandomValues when the startup runtime exposes an incomplete crypto object', () => {
    const runtime = { crypto: {} }

    const crypto = ensureWebCrypto(runtime)

    expect(crypto.getRandomValues).toBeTypeOf('function')
    expect(runtime.crypto).toBe(crypto)
  })

  it('preserves a complete runtime crypto implementation', () => {
    const existing = { getRandomValues: vi.fn() }
    const runtime = { crypto: existing }

    expect(ensureWebCrypto(runtime)).toBe(existing)
  })
})
