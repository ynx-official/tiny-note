import DOMPurify from 'dompurify'
import { marked } from 'marked'

export const DEFAULT_NOTE_MODE = 'rich'

export const NOTE_MODES = Object.freeze([
  { id: 'rich', label: '即时编辑', description: '像 Notion 一样输入并立即呈现格式' },
  { id: 'markdown', label: 'Markdown', description: '编辑源码，可打开实时预览' },
  { id: 'read', label: '阅读', description: '隐藏编辑工具，专注阅读' }
])

const allowedTags = [
  'p', 'div', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'code', 'strong', 'b', 'em', 'i', 'u', 's', 'del',
  'mark', 'span', 'sub', 'sup', 'a', 'img', 'ul', 'ol', 'li', 'table',
  'thead', 'tbody', 'tr', 'th', 'td', 'colgroup', 'col', 'label', 'input'
]

const allowedAttributes = [
  'href', 'target', 'rel', 'src', 'alt', 'title', 'class', 'style', 'data-color', 'data-note-title',
  'data-type', 'data-checked', 'colspan', 'rowspan', 'colwidth', 'span', 'start',
  'type', 'checked', 'disabled'
]

const colorValuePattern = /^(?:#[\da-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+\-/]+\)|[a-z]+)$/i
const safeLinkProtocols = new Set(['http:', 'https:', 'mailto:', 'tel:'])
const safeImageProtocols = new Set(['http:', 'https:'])
const editorMarkedOptions = Object.freeze({ gfm: true, breaks: false })

const richClipboardPatterns = [
  /<strong\b|<b\b|<em\b|<i\b|<u\b|<s\b|<strike\b/i,
  /<h[1-6]\b[^>]*>/i,
  /<a\s+href=/i,
  /<img\s+src=/i,
  /<table\b/i,
  /<blockquote\b/i,
  /<pre\b|<code\b/i,
  /<ol\b|<ul\b/i,
  /style\s*=\s*["'][^"']*(?:color|font-weight|font-style|text-decoration|background)/i,
  /class\s*=\s*["'][^"']*(?:bold|italic|underline|highlight)/i
]

export function isRichClipboardHtml(html = '') {
  return richClipboardPatterns.some(pattern => pattern.test(String(html)))
}

export function preprocessMarkdownTables(text = '') {
  const lines = String(text).split('\n')
  const processedLines = []
  let inTable = false

  for (const line of lines) {
    const isTableLine = line.trim().startsWith('|')
    if (isTableLine) {
      if (!inTable && processedLines.at(-1)?.trim() === '') processedLines.pop()
      inTable = true
      processedLines.push(line)
      continue
    }
    if (inTable && line.trim() === '') inTable = false
    processedLines.push(line)
  }

  return processedLines.join('\n')
}

export function fixEmptyTableCells(html = '') {
  return String(html).replace(/<(td|th)(\s[^>]*)?>\s*<\/\1>/gi, (_match, tag, attributes = '') => `<${tag}${attributes}>&nbsp;</${tag}>`)
}

export function markdownToEditorHtml(text = '') {
  return fixEmptyTableCells(marked.parse(preprocessMarkdownTables(text), editorMarkedOptions))
}

export function safeColorValue(value) {
  const normalized = String(value || '').trim()
  return colorValuePattern.test(normalized) ? normalized : ''
}

function sanitizeStyle(style = '') {
  const declarations = []
  for (const declaration of style.split(';')) {
    const separator = declaration.indexOf(':')
    if (separator < 0) continue
    const property = declaration.slice(0, separator).trim().toLowerCase()
    const value = declaration.slice(separator + 1).trim()
    if ((property === 'color' || property === 'background-color') && safeColorValue(value)) {
      declarations.push(`${property}: ${value}`)
    }
    if (property === 'text-align' && /^(left|center|right|justify)$/.test(value)) {
      declarations.push(`${property}: ${value}`)
    }
  }
  return declarations.join('; ')
}

function isRelativeUrl(value) {
  return /^(?:#|\/|\.\/|\.\.\/)/.test(value) || !/^[a-z][a-z\d+.-]*:/i.test(value)
}

function isSafeUrl(value, image = false) {
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f\s]+/g, '')
  if (!normalized) return false
  if (isRelativeUrl(normalized)) return !normalized.toLowerCase().startsWith('data:')
  const protocol = normalized.match(/^([a-z][a-z\d+.-]*:)/i)?.[1]?.toLowerCase()
  return (image ? safeImageProtocols : safeLinkProtocols).has(protocol)
}

/**
 * Produces the only HTML representation that may be previewed or persisted.
 * Raw Markdown is stored separately, so unsupported tags can be discarded here safely.
 */
export function sanitizeEditorHtml(html = '') {
  const sanitized = DOMPurify.sanitize(String(html), {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: allowedAttributes,
    ALLOW_DATA_ATTR: false
  })
  const template = window.document.createElement('template')
  template.innerHTML = sanitized

  template.content.querySelectorAll('[style]').forEach(element => {
    const style = sanitizeStyle(element.getAttribute('style'))
    if (style) element.setAttribute('style', style)
    else element.removeAttribute('style')
  })
  template.content.querySelectorAll('[data-color]').forEach(element => {
    if (!safeColorValue(element.getAttribute('data-color') || '')) element.removeAttribute('data-color')
  })
  template.content.querySelectorAll('a[href]').forEach(link => {
    if (!isSafeUrl(link.getAttribute('href') || '')) link.removeAttribute('href')
  })
  template.content.querySelectorAll('img[src]').forEach(image => {
    if (!isSafeUrl(image.getAttribute('src') || '', true)) image.removeAttribute('src')
  })
  template.content.querySelectorAll('a[target="_blank"]').forEach(link => link.setAttribute('rel', 'noopener noreferrer'))

  return template.innerHTML
}

export function textFromEditorHtml(html = '') {
  const template = window.document.createElement('template')
  template.innerHTML = String(html)
  const blockTags = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'LI', 'TR'])
  const read = node => {
    if (node.nodeType === 3) return node.nodeValue || ''
    if (node.nodeName === 'BR') return '\n'
    const content = Array.from(node.childNodes || []).map(read).join('')
    return blockTags.has(node.nodeName) ? `${content}\n` : content
  }
  return read(template.content).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function clampSplitRatio(value) {
  return Math.min(70, Math.max(30, Number(value) || 50))
}

export function scrollProgress(scrollTop, scrollHeight, clientHeight) {
  const distance = Math.max(0, Number(scrollHeight) - Number(clientHeight))
  if (!distance) return 0
  return Math.min(1, Math.max(0, Number(scrollTop) / distance))
}

export function scrollOffset(progress, scrollHeight, clientHeight) {
  const distance = Math.max(0, Number(scrollHeight) - Number(clientHeight))
  return Math.min(1, Math.max(0, Number(progress) || 0)) * distance
}
