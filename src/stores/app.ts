import { defineStore } from 'pinia'
import { invoke } from '../services/tauri'
import type { AppSettings, ModelProfile } from '../types/domain'
import {
  DEFAULT_EDITOR_MODE_SHORTCUT,
  EDITOR_MODE_SHORTCUT_STORAGE_KEY,
  normalizeShortcut
} from '../utils/keyboardShortcut'

const DEFAULT_SETTINGS: AppSettings = { theme: 'system', language: 'zh-CN', fimEnabled: false, exportDirectory: '' }
let initialization: Promise<void> | null = null
let stopSystemThemeListener: (() => void) | null = null

function readEditorModeShortcut(): string {
  try {
    return normalizeShortcut(localStorage.getItem(EDITOR_MODE_SHORTCUT_STORAGE_KEY))
  } catch {
    return DEFAULT_EDITOR_MODE_SHORTCUT
  }
}

function mediaQuery(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null
}

export function applyTheme(theme: AppSettings['theme'] = 'system'): 'light' | 'dark' {
  const query = mediaQuery()
  const resolved = theme === 'system' ? (query?.matches ? 'dark' : 'light') : theme
  window.document.documentElement.dataset.theme = resolved
  localStorage.setItem('tiny-note-theme', resolved)
  localStorage.setItem('tiny-note-theme-setting', theme)

  if (stopSystemThemeListener) {
    stopSystemThemeListener()
    stopSystemThemeListener = null
  }
  if (theme === 'system' && query) {
    const sync = (event: MediaQueryListEvent) => {
      const next = event.matches ? 'dark' : 'light'
      window.document.documentElement.dataset.theme = next
      localStorage.setItem('tiny-note-theme', next)
    }
    query.addEventListener?.('change', sync)
    stopSystemThemeListener = () => query.removeEventListener?.('change', sync)
  }
  return resolved
}

export function applyCachedTheme() {
  const cached = localStorage.getItem('tiny-note-theme')
  if (cached === 'dark' || cached === 'light') window.document.documentElement.dataset.theme = cached
}

export const useAppStore = defineStore('app', {
  state: () => ({
    settings: { ...DEFAULT_SETTINGS },
    editorModeShortcut: readEditorModeShortcut(),
    models: [] as ModelProfile[],
    initialized: false,
    settingsError: null,
    modelsError: null
  }),
  getters: {
    defaultModel: state => state.models.find(model => model.isDefault) || state.models[0] || null
  },
  actions: {
    setEditorModeShortcut(shortcut: string) {
      const normalized = normalizeShortcut(shortcut)
      this.editorModeShortcut = normalized
      try { localStorage.setItem(EDITOR_MODE_SHORTCUT_STORAGE_KEY, normalized) } catch { /* keep the in-memory preference */ }
      return normalized
    },
    resetEditorModeShortcut() {
      return this.setEditorModeShortcut(DEFAULT_EDITOR_MODE_SHORTCUT)
    },
    async initialize({ force = false }: { force?: boolean } = {}) {
      if (this.initialized && !force) return
      if (initialization && !force) return initialization
      initialization = (async () => {
        const [settingsResult, modelsResult] = await Promise.allSettled([
          invoke('settings_get'),
          invoke('model_list')
        ])
        if (settingsResult.status === 'fulfilled') {
          this.settings = { ...DEFAULT_SETTINGS, ...settingsResult.value }
          this.settingsError = null
        } else {
          this.settingsError = settingsResult.reason
        }
        applyTheme(this.settings.theme)
        if (modelsResult.status === 'fulfilled') {
          this.models = modelsResult.value || []
          this.modelsError = null
        } else {
          this.modelsError = modelsResult.reason
        }
        this.initialized = true
      })()
      try {
        await initialization
      } finally {
        initialization = null
      }
    },
    async saveSettings(settings: AppSettings) {
      this.settings = { ...DEFAULT_SETTINGS, ...(await invoke('settings_update', { settings })) }
      applyTheme(this.settings.theme)
      return this.settings
    },
    async refreshModels() {
      this.models = (await invoke('model_list')) || []
      this.modelsError = null
      return this.models
    }
  }
})
