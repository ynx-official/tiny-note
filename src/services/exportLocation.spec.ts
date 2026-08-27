import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ open: vi.fn(), invoke: vi.fn(), download: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: mocks.open }))
vi.mock('./tauri', () => ({ invoke: mocks.invoke }))
vi.mock('../utils/noteExport', () => ({ downloadBlob: mocks.download }))

import {
  cancelExportLocationRequest,
  chooseExportLocation,
  exportLocationState,
  saveExportBlob
} from './exportLocation'

describe('export file location', () => {
  beforeEach(() => {
    mocks.open.mockReset()
    mocks.invoke.mockReset()
    mocks.download.mockReset()
    cancelExportLocationRequest()
    window.__TAURI_INTERNALS__ = {}
  })

  it('asks for a directory once and persists it when remember is checked', async () => {
    mocks.open.mockResolvedValue('D:\\Exports')
    mocks.invoke.mockResolvedValue({ path: 'D:\\Exports\\文章.html', fileName: '文章.html' })
    const appStore = { settings: { theme: 'light', exportDirectory: '' }, saveSettings: vi.fn(async settings => settings) }

    const pending = saveExportBlob(new globalThis.Blob(['hello']), '文章.html', { appStore })
    expect(exportLocationState.visible).toBe(true)
    exportLocationState.remember = true
    await chooseExportLocation()

    await expect(pending).resolves.toMatchObject({ fileName: '文章.html' })
    expect(appStore.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ exportDirectory: 'D:\\Exports' }))
    expect(mocks.invoke).toHaveBeenCalledWith('export_write_file', expect.objectContaining({
      request: expect.objectContaining({ directory: 'D:\\Exports', fileName: '文章.html' })
    }))
  })

  it('uses the saved directory without opening the location dialog', async () => {
    mocks.invoke.mockResolvedValue({ path: 'D:\\Exports\\文章 (2).pdf', fileName: '文章 (2).pdf' })
    const appStore = { settings: { exportDirectory: 'D:\\Exports' }, saveSettings: vi.fn() }

    const result = await saveExportBlob(new globalThis.Blob(['%PDF']), '文章.pdf', { appStore })

    expect(result.fileName).toBe('文章 (2).pdf')
    expect(exportLocationState.visible).toBe(false)
    expect(mocks.open).not.toHaveBeenCalled()
    expect(appStore.saveSettings).not.toHaveBeenCalled()
  })

  it('returns a cancellation result without writing a file', async () => {
    const pending = saveExportBlob(new globalThis.Blob(['hello']), '文章.md', { appStore: { settings: {}, saveSettings: vi.fn() } })
    cancelExportLocationRequest()

    await expect(pending).resolves.toEqual({ cancelled: true })
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('falls back to a browser download outside Tauri', async () => {
    delete window.__TAURI_INTERNALS__
    const blob = new globalThis.Blob(['hello'])

    const result = await saveExportBlob(blob, '文章.md', { appStore: { settings: {} } })

    expect(mocks.download).toHaveBeenCalledWith(blob, '文章.md')
    expect(result).toEqual({ fileName: '文章.md', browserDownload: true })
  })
})
