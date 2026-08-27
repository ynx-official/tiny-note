const STORAGE_KEY = 'tiny-note-browser-state'

export type BrowserStateRecord = Record<string, unknown>

function isRecord(value: unknown): value is BrowserStateRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readBrowserState(storage: Pick<Storage, 'getItem'> = localStorage): BrowserStateRecord {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) || '{}')
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function writeBrowserState(state: BrowserStateRecord, storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(state))
}
