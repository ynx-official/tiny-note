import { apiFetch } from './apiClient'

export async function readLibraryContent(path: string, signal?: AbortSignal, maxBytes = 64 * 1024 * 1024): Promise<Uint8Array<ArrayBuffer>> {
  if (!/^\/knowledge-bases\/[^/?]+\/library\/content\?relativePath=/.test(path)) throw new Error('文件下载地址无效')
  const response = await apiFetch(path, { signal })
  if (Number(response.headers.get('Content-Length')) > maxBytes) {
    await response.body?.cancel()
    throw new Error('文件超过 64 MB 限制，无法在桌面内读取')
  }
  if (!response.body) throw new Error('文件内容为空')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) throw new Error('文件超过 64 MB 限制，无法在桌面内读取')
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally { reader.releaseLock() }
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
  return result
}
