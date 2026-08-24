import { webcrypto } from 'node:crypto'

export function ensureWebCrypto(runtime = globalThis) {
  if (typeof runtime.crypto?.getRandomValues === 'function') return runtime.crypto
  Object.defineProperty(runtime, 'crypto', {
    configurable: true,
    value: webcrypto
  })
  return runtime.crypto
}
