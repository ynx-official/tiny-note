import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('./tauri', () => mocks)

import {
  dismissExportSuccess,
  exportSuccessState,
  openExportedFile,
  revealExportedFile,
  showExportSuccess
} from './exportSuccess'

describe('export success actions', () => {
  beforeEach(() => {
    mocks.invoke.mockReset()
    dismissExportSuccess()
  })

  it('opens the exported file and dismisses the result dialog', async () => {
    showExportSuccess({ path: 'D:\\Exports\\文章.pdf', fileName: '文章.pdf' })

    await openExportedFile()

    expect(mocks.invoke).toHaveBeenCalledWith('export_open_file', { path: 'D:\\Exports\\文章.pdf' })
    expect(exportSuccessState.visible).toBe(false)
  })

  it('reveals the exported file in its containing folder', async () => {
    showExportSuccess({ path: 'D:\\Exports\\文章.html', fileName: '文章.html' })

    await revealExportedFile()

    expect(mocks.invoke).toHaveBeenCalledWith('export_reveal_file', { path: 'D:\\Exports\\文章.html' })
    expect(exportSuccessState.visible).toBe(false)
  })

  it('keeps the dialog visible and reports opener failures', async () => {
    mocks.invoke.mockRejectedValue(new Error('没有可用的默认应用'))
    showExportSuccess({ path: 'D:\\Exports\\文章.pdf', fileName: '文章.pdf' })

    await openExportedFile()

    expect(exportSuccessState.visible).toBe(true)
    expect(exportSuccessState.error).toContain('没有可用的默认应用')
  })
})
