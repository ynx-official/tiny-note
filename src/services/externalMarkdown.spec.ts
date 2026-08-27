import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }))
vi.mock('./tauri', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }))

import { openPendingMarkdownFiles, startExternalMarkdownOpen } from './externalMarkdown'

afterEach(() => {
  delete window.__TAURI_INTERNALS__
  mocks.invoke.mockReset()
  mocks.listen.mockReset()
})

describe('openPendingMarkdownFiles', () => {
  it('binds readable Markdown files to their source and opens the last note', async () => {
    const quotedMetadata = [
      '> 文档状态：Review（解释视图）',
      '> 最后更新：2026-08-26',
      '> 适用对象：业务负责人、产品、设计、研发、测试及各岗位执行人员',
      '> 权威依据：[端到端流程](../flow.md)',
      '> 关联文档：[管理系统 PRD](../prd.md)'
    ].join('\n')
    const store = {
      openExternalMarkdown: vi.fn()
        .mockResolvedValueOnce({ id: 'note-1' })
        .mockResolvedValueOnce({ id: 'note-2' })
    }
    const router = { push: vi.fn().mockResolvedValue() }
    const notify = vi.fn()

    const count = await openPendingMarkdownFiles([
      { fileName: 'first.md', path: 'C:\\notes\\first.md', content: quotedMetadata, error: null },
      { fileName: 'second.markdown', path: 'C:\\notes\\second.markdown', content: 'Second', error: null }
    ], { store, router, notify })

    expect(count).toBe(2)
    expect(store.openExternalMarkdown).toHaveBeenNthCalledWith(1, expect.objectContaining({
      path: 'C:\\notes\\first.md',
      title: 'first',
      contentMarkdown: quotedMetadata
    }))
    const firstOpenInput = store.openExternalMarkdown.mock.calls[0][0]
    expect(firstOpenInput.contentHtml.match(/<br>/g)).toHaveLength(4)
    expect(firstOpenInput.contentHtml).toContain('href="../flow.md"')
    expect(router.push).toHaveBeenCalledWith({ path: '/notes', query: { note: 'note-2' } })
    expect(notify).toHaveBeenCalledWith('已打开 2 个 Markdown 源文件', { tone: 'success' })
  })

  it('reports unreadable files without creating a note', async () => {
    const store = { openExternalMarkdown: vi.fn() }
    const router = { push: vi.fn() }
    const notify = vi.fn()

    const count = await openPendingMarkdownFiles([
      { fileName: 'broken.md', path: 'C:\\notes\\broken.md', content: null, error: '文件不是 UTF-8 编码' }
    ], { store, router, notify })

    expect(count).toBe(0)
    expect(store.openExternalMarkdown).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('无法打开 broken.md：文件不是 UTF-8 编码', { tone: 'error' })
  })

  it('starts the file-open listener without loading the whole notes workspace', async () => {
    window.__TAURI_INTERNALS__ = {}
    mocks.listen.mockResolvedValue(vi.fn())
    mocks.invoke.mockImplementation((command: string) => command === 'app_take_pending_markdown_files' ? Promise.resolve([]) : Promise.resolve(null))

    await startExternalMarkdownOpen({
      pinia: createPinia(),
      router: { push: vi.fn() } as never
    })

    expect(mocks.listen).toHaveBeenCalledWith('tiny-note://open-markdown', expect.any(Function))
    expect(mocks.invoke.mock.calls.map(([command]) => command)).toEqual(['app_take_pending_markdown_files'])
  })
})
