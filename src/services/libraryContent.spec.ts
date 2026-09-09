import { beforeEach, expect, it, vi } from 'vitest'
import { readLibraryContent } from './libraryContent'
import { apiFetch } from './apiClient'
vi.mock('./apiClient', () => ({ apiFetch: vi.fn() }))
const path = '/knowledge-bases/kb/library/content?relativePath=file.pdf'
beforeEach(() => { vi.mocked(apiFetch).mockReset() })

it('reads authenticated bytes without changing the supplied abort signal', async () => {
  vi.mocked(apiFetch).mockResolvedValue(new Response(new Uint8Array([0, 255, 10])))
  const signal = new AbortController().signal
  expect(await readLibraryContent(path, signal)).toEqual(new Uint8Array([0, 255, 10]))
  expect(apiFetch).toHaveBeenCalledWith(path, { signal })
})
it('does not send credentials to arbitrary addresses', async () => {
  for (const address of ['https://example.com/file', '//example.com/file', '/auth/info']) {
    await expect(readLibraryContent(address)).rejects.toThrow('地址无效')
  }
  expect(apiFetch).not.toHaveBeenCalled()
})
it('rejects oversized responses even when Content-Length is absent or false', async () => {
  for (const headers of [{}, { 'Content-Length': '1' }, { 'Content-Length': '100' }]) {
    vi.mocked(apiFetch).mockResolvedValue(new Response(new Uint8Array(5), { headers }))
    await expect(readLibraryContent(path, undefined, 4)).rejects.toThrow('限制')
  }
})
it('preserves authorization and transport failures', async () => {
  vi.mocked(apiFetch).mockRejectedValue(new Error('没有权限'))
  await expect(readLibraryContent(path)).rejects.toThrow('没有权限')
})
