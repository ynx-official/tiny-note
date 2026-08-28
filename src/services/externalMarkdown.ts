import { listen } from '@tauri-apps/api/event'
import { useNotesStore } from '../stores/notes'
import { markdownToEditorHtml, sanitizeEditorHtml, textFromEditorHtml } from '../utils/noteMarkdown'
import { showToast } from './appFeedback'
import { invoke } from './tauri'
import type { Pinia } from 'pinia'
import type { Router } from 'vue-router'
import type { ExternalMarkdownFile, Note } from '../types/domain'

const OPEN_MARKDOWN_EVENT = 'tiny-note://open-markdown'

function noteTitle(fileName: string) {
  return String(fileName || '').replace(/\.(?:md|markdown)$/i, '') || '导入笔记'
}

export async function openPendingMarkdownFiles(files: ExternalMarkdownFile[], { store, router, notify = showToast }: { store: ReturnType<typeof useNotesStore>; router: Router; notify?: typeof showToast }) {
  let opened = 0
  let lastNote: Note | null = null
  const failures: Array<{ fileName: string; message: string }> = []

  for (const file of files || []) {
    if (file.error || typeof file.content !== 'string') {
      failures.push({ fileName: file.fileName || 'Markdown 文件', message: file.error || '文件读取失败' })
      continue
    }

    try {
      const contentHtml = sanitizeEditorHtml(markdownToEditorHtml(file.content))
      lastNote = await store.openExternalMarkdown({
        path: file.path,
        title: noteTitle(file.fileName),
        contentHtml,
        contentText: textFromEditorHtml(contentHtml),
        contentMarkdown: file.content
      })
      opened += 1
    } catch (error) {
      failures.push({ fileName: file.fileName || 'Markdown 文件', message: error instanceof Error ? error.message : '打开失败' })
    }
  }

  if (failures.length === 1) {
    notify(`无法打开 ${failures[0].fileName}：${failures[0].message}`, { tone: 'error' })
  } else if (failures.length > 1) {
    const names = failures.slice(0, 3).map(item => item.fileName).join('、')
    const suffix = failures.length > 3 ? ` 等 ${failures.length} 个文件` : ''
    notify(`${failures.length} 个 Markdown 文件打开失败：${names}${suffix}`, { tone: 'error' })
  }

  if (lastNote) {
    await router.push({ path: '/notes', query: { note: lastNote.id } })
    notify(failures.length ? `已打开 ${opened} 个 Markdown 源文件，${failures.length} 个失败` : `已打开 ${opened} 个 Markdown 源文件`, { tone: 'success' })
  }
  return opened
}

export async function startExternalMarkdownOpen({ pinia, router }: { pinia: Pinia; router: Router }) {
  if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) return () => {}

  const store = useNotesStore(pinia)
  let drainChain = Promise.resolve()
  const drain = () => {
    drainChain = drainChain.then(async () => {
      const files = await invoke('app_take_pending_markdown_files')
      await openPendingMarkdownFiles(files, { store, router })
    }).catch(error => { showToast(error instanceof Error ? error.message : '打开 Markdown 文件失败', { tone: 'error' }) })
    return drainChain
  }

  const unlisten = await listen(OPEN_MARKDOWN_EVENT, drain)
  await drain()
  return unlisten
}
