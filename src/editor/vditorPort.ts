import type { MarkdownSelection } from './markdownSelection'

export type NoteEditorMode = 'rich' | 'markdown'
export interface VditorPort {
  getMarkdown(): string
  getHTML(source?: string): string
  getText(source?: string): string
  getSelection(): MarkdownSelection | null
  setMarkdown(source: string, resetHistory?: boolean): void
  setMode(mode: NoteEditorMode): void
  setPreview(visible: boolean): void
  focus(): void
  setEditable(editable: boolean): void
  getScroller(): HTMLElement | null
  insertMarkdown(source: string): boolean
}
