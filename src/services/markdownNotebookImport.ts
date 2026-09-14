import type { MarkdownNotebookImportRequest, MarkdownNotebookScan } from '../types/domain'
import { markdownToEditorHtml, sanitizeEditorHtml, textFromEditorHtml } from '../utils/noteMarkdown'

export function notebookCountForScan(scan: MarkdownNotebookScan): number {
  return scan.files.length ? scan.notebookPaths.length + 1 : 0
}

export function buildMarkdownNotebookImportRequest(scan: MarkdownNotebookScan): MarkdownNotebookImportRequest {
  return {
    rootName: scan.rootName,
    files: scan.files.map(file => {
      const contentHtml = sanitizeEditorHtml(markdownToEditorHtml(file.contentMarkdown))
      return {
        relativePath: file.relativePath,
        contentMarkdown: file.contentMarkdown,
        contentHtml,
        contentText: textFromEditorHtml(contentHtml)
      }
    })
  }
}
