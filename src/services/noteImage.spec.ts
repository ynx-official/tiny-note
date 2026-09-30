import { beforeEach, expect, it, vi } from 'vitest'
import { resolveNoteImage } from './noteImage'

const request = vi.hoisted(() => vi.fn())
vi.mock('./apiClient', () => ({ apiRequest: request }))
beforeEach(() => { request.mockReset() })

it('uploads the original file and uses the OSS URL', async () => {
  const file = new File(['image'], 'photo.png', { type: 'image/png' })
  request.mockResolvedValue({ fileUrl: 'https://oss.example/photo.png' })
  expect(await resolveNoteImage(file)).toBe('https://oss.example/photo.png')
  const [path, options] = request.mock.calls[0]!
  expect(path).toBe('/auth/file/upload/img')
  expect(options.body.get('file')).toBe(file)
})

it.each(['network', 'business', 'invalid-url'])('falls back to Base64 on %s failure', async failure => {
  if (failure === 'invalid-url') request.mockResolvedValue({ fileUrl: 'javascript:alert(1)' })
  else request.mockRejectedValue(new Error(failure))
  expect(await resolveNoteImage(new File(['image'], 'photo.png', { type: 'image/png' })))
    .toBe('data:image/png;base64,aW1hZ2U=')
})
