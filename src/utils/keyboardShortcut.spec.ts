import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_EDITOR_MODE_SHORTCUT,
  matchesKeyboardShortcut,
  normalizeShortcut,
  shortcutDisplayParts,
  shortcutFromKeyboardEvent
} from './keyboardShortcut'

describe('keyboard shortcut helpers', () => {
  it('normalizes the default Ctrl+/ chord to a layout-stable key code', () => {
    expect(DEFAULT_EDITOR_MODE_SHORTCUT).toBe('Mod+Slash')
    expect(normalizeShortcut('Ctrl+/')).toBe('Mod+Slash')
    expect(shortcutDisplayParts('Mod+Slash')).toEqual(['Ctrl', '/'])
  })

  it('records modifier chords and rejects unmodified typing', () => {
    expect(shortcutFromKeyboardEvent({ ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, code: 'KeyM', key: 'm' })).toBe('Mod+Shift+KeyM')
    expect(shortcutFromKeyboardEvent({ ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, code: 'KeyM', key: 'm' })).toBe('')
    expect(shortcutFromKeyboardEvent({ ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, code: 'ControlLeft', key: 'Control' })).toBe('')
  })

  it('matches exact modifiers without treating extra Shift as the same shortcut', () => {
    expect(matchesKeyboardShortcut({ ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, code: 'Slash', key: '/' }, 'Mod+Slash')).toBe(true)
    expect(matchesKeyboardShortcut({ ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, code: 'Slash', key: '?' }, 'Mod+Slash')).toBe(false)
  })

  it('uses Command as Mod and displays the macOS key label on Apple platforms', () => {
    const platform = vi.spyOn(globalThis.navigator, 'platform', 'get').mockReturnValue('MacIntel')
    expect(shortcutDisplayParts('Mod+Slash')).toEqual(['⌘', '/'])
    expect(shortcutFromKeyboardEvent({ ctrlKey: false, shiftKey: false, altKey: false, metaKey: true, code: 'Slash', key: '/' })).toBe('Mod+Slash')
    expect(matchesKeyboardShortcut({ ctrlKey: false, shiftKey: false, altKey: false, metaKey: true, code: 'Slash', key: '/' }, 'Mod+Slash')).toBe(true)
    expect(matchesKeyboardShortcut({ ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, code: 'Slash', key: '/' }, 'Mod+Slash')).toBe(false)
    platform.mockRestore()
  })
})
