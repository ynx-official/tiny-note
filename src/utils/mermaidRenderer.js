import DOMPurify from 'dompurify'

let mermaidModulePromise
let renderQueue = Promise.resolve()
let renderSequence = 0

const externalResourcePatterns = [
  /(?:^|[,{]\s*)["']?(?:img|image)["']?\s*:/im,
  /!\[[^\]\r\n]*\]\s*\(/m,
  /(?:url\s*\(|@import\b)/i,
  /<\s*(?:img|image|iframe|object|embed|script|link)\b/i,
  /\b(?:https?|ftp|file|data|blob|javascript):/i,
  /(?:^|[\s("'=])\/\/[a-z0-9]/im
]

const secureConfigKeys = [
  'secure',
  'securityLevel',
  'startOnLoad',
  'maxTextSize',
  'suppressErrorRendering',
  'maxEdges',
  'theme',
  'themeCSS',
  'themeVariables',
  'look',
  'layout',
  'fontFamily',
  'htmlLabels',
  'flowchart',
  'swimlane'
]

const themeVariables = {
  light: {
    background: '#ffffff',
    mainBkg: '#fafaf9',
    primaryColor: '#f6f5f4',
    primaryTextColor: '#1c1917',
    primaryBorderColor: '#c8c4be',
    secondaryColor: '#fef7d6',
    secondaryTextColor: '#37352f',
    secondaryBorderColor: '#d8c768',
    tertiaryColor: '#dcecfa',
    tertiaryTextColor: '#1c1917',
    tertiaryBorderColor: '#8eb6d8',
    lineColor: '#78716c',
    textColor: '#1c1917',
    nodeTextColor: '#1c1917',
    clusterBkg: '#fafaf9',
    clusterBorder: '#c8c4be',
    edgeLabelBackground: '#ffffff',
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Microsoft YaHei, sans-serif'
  },
  dark: {
    background: '#1a1a1c',
    mainBkg: '#242428',
    primaryColor: '#2a2a2e',
    primaryTextColor: '#ededed',
    primaryBorderColor: '#5b5b63',
    secondaryColor: '#373326',
    secondaryTextColor: '#f2f0e9',
    secondaryBorderColor: '#8d7d42',
    tertiaryColor: '#253746',
    tertiaryTextColor: '#ededed',
    tertiaryBorderColor: '#547da0',
    lineColor: '#a1a1aa',
    textColor: '#ededed',
    nodeTextColor: '#ededed',
    clusterBkg: '#222225',
    clusterBorder: '#52525b',
    edgeLabelBackground: '#1a1a1c',
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Microsoft YaHei, sans-serif'
  }
}

function createConfig(theme) {
  const normalizedTheme = theme === 'dark' ? 'dark' : 'light'
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    maxTextSize: 50000,
    maxEdges: 500,
    secure: secureConfigKeys,
    theme: 'base',
    look: 'classic',
    htmlLabels: false,
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Microsoft YaHei, sans-serif',
    themeVariables: themeVariables[normalizedTheme],
    flowchart: {
      useMaxWidth: false,
      nodeSpacing: 40,
      rankSpacing: 56,
      wrappingWidth: 200
    },
    swimlane: {
      useMaxWidth: false,
      lineHops: 'arc',
      ignoreCrossLaneEdges: true,
      optimizeRanksByCrossings: true,
      automaticLaneOrdering: false
    }
  }
}

function decodeCodePoint(_match, value) {
  const codePoint = Number.parseInt(value, 16)
  return String.fromCodePoint(Math.min(codePoint, 0x10ffff))
}

function decodeEscapedResourceTokens(source) {
  const decodedUnicode = source
    .replace(/\\U([0-9a-f]{8})/gi, decodeCodePoint)
    .replace(/\\u\{([0-9a-f]{1,6})\}/gi, decodeCodePoint)
    .replace(/\\u([0-9a-f]{4})/gi, decodeCodePoint)
    .replace(/\\x([0-9a-f]{2})/gi, decodeCodePoint)
  return decodedUnicode
    .replace(/\\([0-9a-f]{1,6})\s?/gi, decodeCodePoint)
    .replace(/\\\r?\n/g, '')
    .replace(/\\([^\r\n])/g, '$1')
    .replace(/\/\*[\s\S]*?\*\//g, '')
}

function externalResourceError() {
  const error = new Error('为保护隐私，图表不允许加载图片或外部资源。请改用普通节点和文字标签。')
  error.code = 'MERMAID_EXTERNAL_RESOURCE'
  return error
}

function validateMermaidSource(source) {
  const normalizedSource = decodeEscapedResourceTokens(source)
  if (externalResourcePatterns.some(pattern => pattern.test(normalizedSource))) throw externalResourceError()
}

function hasUnsafeCssResource(cssText) {
  const normalizedCss = decodeEscapedResourceTokens(String(cssText || ''))
  if (/(?:@import\b|@font-face\b|expression\s*\(|-moz-binding\s*:|behavior\s*:|\b(?:https?|ftp|file|data|blob|javascript):|(?:^|[\s("'=])\/\/[a-z0-9])/im.test(normalizedCss)) return true

  for (const match of normalizedCss.matchAll(/url\s*\(([^)]*)\)/gi)) {
    const target = match[1].trim().replace(/^(['"])([\s\S]*)\1$/, '$2').trim()
    if (!/^#[^\s'"()<>]+$/.test(target)) return true
  }
  return false
}

async function loadMermaid() {
  mermaidModulePromise ||= import('mermaid').then(module => module.default || module)
  return mermaidModulePromise
}

function sanitizeSvg(svg) {
  const rejectUnsafeInlineCss = (_node, data) => {
    if (data.attrName === 'style' && hasUnsafeCssResource(data.attrValue)) {
      data.keepAttr = false
    }
  }
  DOMPurify.addHook('uponSanitizeAttribute', rejectUnsafeInlineCss)
  let sanitized
  try {
    sanitized = DOMPurify.sanitize(String(svg || ''), {
      USE_PROFILES: { svg: true, svgFilters: true },
      ADD_TAGS: ['style', 'foreignobject', 'div', 'span', 'p', 'br'],
      HTML_INTEGRATION_POINTS: { foreignobject: true },
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'a', 'img'],
      FORBID_ATTR: ['onload', 'onclick', 'onerror', 'onmouseover', 'href', 'xlink:href', 'src', 'srcset', 'action', 'formaction', 'poster', 'data', 'background']
    })
  } finally {
    DOMPurify.removeHook('uponSanitizeAttribute', rejectUnsafeInlineCss)
  }
  sanitized = sanitized.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, block =>
    hasUnsafeCssResource(block) ? '' : block)
  if (!/^\s*<svg\b/i.test(sanitized)) throw new Error('Mermaid did not return a valid SVG diagram')
  return sanitized
}

async function performRender(source, theme) {
  const mermaid = await loadMermaid()
  mermaid.initialize(createConfig(theme))
  await mermaid.parse(source)
  const id = `tiny-note-mermaid-${Date.now().toString(36)}-${++renderSequence}`
  const result = await mermaid.render(id, source)
  return { svg: sanitizeSvg(result.svg) }
}

/**
 * Serializes initialize/parse/render because Mermaid configuration is global.
 * SVG is an ephemeral derivative; callers must persist only the Markdown source.
 */
export function renderMermaidDiagram(source, { theme = 'light' } = {}) {
  const diagramSource = String(source || '')
  if (!diagramSource.trim()) return Promise.reject(new Error('Mermaid source is empty'))
  try {
    validateMermaidSource(diagramSource)
  } catch (error) {
    return Promise.reject(error)
  }

  const run = () => performRender(diagramSource, theme)
  const result = renderQueue.then(run, run)
  renderQueue = result.then(() => undefined, () => undefined)
  return result
}
