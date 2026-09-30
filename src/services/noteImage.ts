import { apiRequest } from './apiClient'

export async function resolveNoteImage(file: File): Promise<string> {
  try {
    const body = new FormData()
    body.append('file', file)
    const result = await apiRequest<{ fileUrl: string }>('/auth/file/upload/img', { method: 'POST', body })
    const url = new URL(result.fileUrl)
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid image URL')
    return url.href
  } catch {
    // Keep inserting usable local images when storage or the network is unavailable.
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(reader.error || new Error('读取图片失败'))
      reader.readAsDataURL(file)
    })
  }
}
