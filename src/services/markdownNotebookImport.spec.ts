import { describe, expect, it } from 'vitest'
import { buildMarkdownNotebookImportRequest, notebookCountForScan } from './markdownNotebookImport'

describe('Markdown notebook import mapping', () => {
  const scan = {
    selected: true,
    rootName: 'My Notes',
    notebookPaths: ['archive', 'archive/2025'],
    ignoredDirectoryCount: 2,
    errors: [],
    files: [{ relativePath: 'archive/2025/summary.md', contentMarkdown: '# Summary\n\n<script>alert(1)</script>', size: 36 }]
  }

  it('builds safe note representations while retaining Markdown source', () => {
    const request = buildMarkdownNotebookImportRequest(scan)
    expect(request.rootName).toBe('My Notes')
    expect(request.files[0].contentMarkdown).toContain('<script>')
    expect(request.files[0].contentHtml).not.toContain('<script>')
    expect(request.files[0].contentText).toContain('Summary')
  })

  it('counts the selected root notebook in addition to retained descendants', () => {
    expect(notebookCountForScan(scan)).toBe(3)
  })
})
