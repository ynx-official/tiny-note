import Image from '@tiptap/extension-image'
import { apiRequest, subscribeAuth } from '../services/apiClient'

const sharedObject = /^\/api\/(?:inkstone\/)?files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/

// Only the node-view DOM receives the expiring URL. ProseMirror attributes,
// Markdown serialization and exported source retain the stable object reference.
export const SharedImage = Image.extend({
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('img')
      let current = node
      let generation = 0
      let timer: ReturnType<typeof setTimeout> | undefined
      const render = async () => {
        const revision = ++generation
        clearTimeout(timer)
        const source = String(current.attrs.src || '')
        dom.alt = String(current.attrs.alt || '')
        dom.title = String(current.attrs.title || '')
        const match = sharedObject.exec(source)
        if (!match) { dom.src = source; return }
        dom.removeAttribute('src')
        try {
          const result = await apiRequest<{ url: string }>(`/objects/${match[1]}/download-url`)
          if (revision !== generation) return
          const resolved = new URL(result.url)
          if (!['http:', 'https:'].includes(resolved.protocol)) return
          dom.src = resolved.href
          timer = setTimeout(() => { void render() }, 240_000)
        } catch {
          if (revision === generation) dom.alt = `${String(current.attrs.alt || '附件')}（暂时无法加载）`
        }
      }
      const unsubscribe = subscribeAuth(() => { void render() })
      void render()
      return {
        dom,
        update(next) {
          if (next.type !== current.type) return false
          const changed = next.attrs.src !== current.attrs.src || next.attrs.alt !== current.attrs.alt || next.attrs.title !== current.attrs.title
          current = next
          if (changed) void render()
          return true
        },
        destroy() { generation++; clearTimeout(timer); unsubscribe() },
      }
    }
  },
})
