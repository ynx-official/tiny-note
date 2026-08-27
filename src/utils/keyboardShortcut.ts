export const DEFAULT_EDITOR_MODE_SHORTCUT = 'Mod+Slash'
export const EDITOR_MODE_SHORTCUT_STORAGE_KEY = 'tiny-note-editor-mode-shortcut'

const modifierCodes = new Set([
  'AltLeft', 'AltRight', 'ControlLeft', 'ControlRight',
  'MetaLeft', 'MetaRight', 'ShiftLeft', 'ShiftRight'
])

const displayCodes: Record<string, string> = {
  Slash: '/', Backslash: '\\', Comma: ',', Period: '.', Semicolon: ';',
  Quote: "'", BracketLeft: '[', BracketRight: ']', Backquote: '`',
  Minus: '-', Equal: '=', Space: 'Space', Enter: 'Enter', Escape: 'Esc',
  Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Home: 'Home', End: 'End',
  PageUp: 'Page Up', PageDown: 'Page Down', ArrowUp: '↑', ArrowDown: '↓',
  ArrowLeft: '←', ArrowRight: '→'
}

export function isMacPlatform() {
  if (typeof globalThis.navigator === 'undefined') return false
  const navigatorWithHints = globalThis.navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = navigatorWithHints.userAgentData?.platform || globalThis.navigator.platform || ''
  return /mac|iphone|ipad|ipod/i.test(platform)
}

interface ParsedShortcut { alt: boolean; shift: boolean; code: string }

function normalizeCode(value: unknown = '') {
  const code = String(value).trim()
  if (!code || modifierCodes.has(code)) return ''
  if (/^Key[A-Z]$/.test(code) || /^Digit\d$/.test(code) || /^F(?:[1-9]|1\d|2[0-4])$/.test(code)) return code
  if (/^[A-Z]$/i.test(code)) return `Key${code.toUpperCase()}`
  if (/^\d$/.test(code)) return `Digit${code}`
  if (code === '/') return 'Slash'
  if (code === '?') return 'Slash'
  if (code === '+') return 'Equal'
  if (Object.hasOwn(displayCodes, code)) return code
  if (/^(?:Numpad|Intl)[A-Za-z0-9]+$/.test(code)) return code
  return ''
}

function parseShortcut(value: unknown): ParsedShortcut | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  const tokens = raw.split('+').map(token => token.trim()).filter(Boolean)
  let hasMod = false
  let alt = false
  let shift = false
  let code = ''

  for (const token of tokens) {
    if (/^(?:mod|ctrl|control|cmd|command|meta|⌘)$/i.test(token)) hasMod = true
    else if (/^(?:alt|option|⌥)$/i.test(token)) alt = true
    else if (/^shift$/i.test(token)) shift = true
    else if (!code) code = normalizeCode(token)
    else return null
  }

  return hasMod && code ? { alt, shift, code } : null
}

function serializeShortcut(shortcut: ParsedShortcut | null) {
  if (!shortcut) return ''
  return ['Mod', shortcut.alt && 'Alt', shortcut.shift && 'Shift', shortcut.code].filter(Boolean).join('+')
}

export function normalizeShortcut(value: unknown, fallback = DEFAULT_EDITOR_MODE_SHORTCUT) {
  return serializeShortcut(parseShortcut(value)) || fallback
}

export function shortcutFromKeyboardEvent(event: KeyboardEvent) {
  if (!event || event.repeat || event.isComposing || ['Process', 'Dead', 'Unidentified'].includes(event.key)) return ''
  if (event.getModifierState?.('AltGraph')) return ''
  const mac = isMacPlatform()
  const primary = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  if (!primary) return ''
  const code = normalizeCode(event.code)
  if (!code) return ''
  return serializeShortcut({ alt: Boolean(event.altKey), shift: Boolean(event.shiftKey), code })
}

export function matchesKeyboardShortcut(event: KeyboardEvent, shortcut: string) {
  const expected = parseShortcut(shortcut)
  if (!expected || !event || event.isComposing || event.defaultPrevented) return false
  if (event.getModifierState?.('AltGraph')) return false
  const mac = isMacPlatform()
  const primaryMatches = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  return Boolean(primaryMatches &&
    Boolean(event.altKey) === expected.alt &&
    Boolean(event.shiftKey) === expected.shift &&
    normalizeCode(event.code) === expected.code)
}

export function shortcutDisplayParts(shortcut: string) {
  const parsed = (parseShortcut(shortcut) || parseShortcut(DEFAULT_EDITOR_MODE_SHORTCUT))!
  const key = parsed.code.startsWith('Key')
    ? parsed.code.slice(3)
    : parsed.code.startsWith('Digit')
      ? parsed.code.slice(5)
      : (displayCodes[parsed.code] || parsed.code.replace(/^Numpad/, 'Num '))
  return [isMacPlatform() ? '⌘' : 'Ctrl', parsed.alt && (isMacPlatform() ? '⌥' : 'Alt'), parsed.shift && 'Shift', key].filter((part): part is string => typeof part === 'string' && Boolean(part))
}
