import { invoke as nativeInvoke } from '@tauri-apps/api/core'
import type { Note } from '../types/domain'

interface FileBinding { id: string; fingerprint: string; updatedAt: string }

export async function openExternalDocument(input: Partial<Note> & { path: string }): Promise<Note> {
  if (!window.__TAURI_INTERNALS__) throw new Error('外部 Markdown 仅支持桌面应用')
  const contentMarkdown = input.contentMarkdown || ''
  const binding = await nativeInvoke<FileBinding>('external_markdown_bind', {
    id: `external:${crypto.randomUUID()}`,
    title: input.title || 'Markdown 文件',
    input: { path: input.path, contentMarkdown }
  })
  return {
    id: binding.id, title: input.title || 'Markdown 文件', notebookId: null, knowledgeBaseId: null,
    contentMarkdown, contentHtml: input.contentHtml || '', contentText: input.contentText || '',
    pinned: false, deletedAt: null, createdAt: binding.updatedAt, updatedAt: binding.updatedAt,
    external: true, externalPath: input.path, externalFingerprint: binding.fingerprint
  }
}

export async function saveExternalDocument(note: Note, contentMarkdown: string): Promise<Note> {
  if (!window.__TAURI_INTERNALS__ || !note.external || !note.externalFingerprint) throw new Error('外部文件未授权，请重新打开')
  const binding = await nativeInvoke<FileBinding>('external_markdown_write', {
    id: note.id, content: contentMarkdown, expectedFingerprint: note.externalFingerprint
  })
  return { ...note, contentMarkdown, updatedAt: binding.updatedAt, externalFingerprint: binding.fingerprint }
}
