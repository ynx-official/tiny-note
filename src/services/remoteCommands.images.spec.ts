import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './apiClient'

const apiRequest = vi.hoisted(() => vi.fn())
vi.mock('./apiClient', async importOriginal => ({
  ...await importOriginal<typeof import('./apiClient')>(), apiRequest
}))

describe('remote image content', () => {
  afterEach(() => { vi.unstubAllGlobals(); apiRequest.mockReset() })

  it('uses authenticated API content without fetching the COS signed URL', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch: CORS'))
    vi.stubGlobal('fetch', fetch)
    const asset = { id: 'image/1', mimeType: 'image/png', dataUri: 'data:image/png;base64,aW1hZ2U=', downloadUrl: 'https://storage.example/private.png' }
    apiRequest.mockResolvedValue(asset)
    const { remoteInvoke } = await import('./remoteCommands')
    await expect(remoteInvoke('image_asset_read', { assetId: asset.id })).resolves.toEqual(asset)
    expect(apiRequest).toHaveBeenCalledWith('/image-assets/image%2F1')
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([null, { id: 'image-1', downloadUrl: 'https://storage.example/private.png' }])('reports unavailable content without a cross-origin fallback: %j', async asset => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    apiRequest.mockResolvedValue(asset)
    const { remoteInvoke } = await import('./remoteCommands')
    await expect(remoteInvoke('image_asset_read', { assetId: 'image-1' })).rejects.toThrow('图片内容不可用')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('preserves authentication and storage errors from the API', async () => {
    const error = new ApiError(401, '登录已失效', 401)
    apiRequest.mockRejectedValue(error)
    const { remoteInvoke } = await import('./remoteCommands')
    await expect(remoteInvoke('image_asset_read', { assetId: 'image-1' })).rejects.toBe(error)
  })
})
