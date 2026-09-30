import type { TokenizerAndRendererExtension } from 'marked'

export interface SourceToken { type: string; raw: string; kind: string }

export function sourceBlockToken(source: string): SourceToken | undefined {
  const patterns: [RegExp, string][] = [
    [/^(---|\+\+\+)\r?\n[\s\S]*?\r?\n\1(?=\r?\n|$)/, '元数据'],
    [/^\$\$[\s\S]+?\$\$(?=\s*(?:\n|$))/, '公式'],
    [/^\\\[[\s\S]+?\\\]/, '公式'],
    [/^\[\^[^\]\n]+\]:[^\n]*(?:\n(?: {2,}|\t)[^\n]*)*/, '脚注'],
    [/^<(details|summary|script|style|iframe|video|audio|figure|svg|math|form|kbd)\b[^>]*>[\s\S]*?<\/\1\s*>/i, 'HTML 源码'],
    [/^<!--[\s\S]*?-->/, 'HTML 注释']
  ]
  for (const [pattern, kind] of patterns) {
    const raw = source.match(pattern)?.[0]
    if (raw) return { type: 'sourceBlock', raw, kind }
  }
}

export function sourceInlineToken(source: string): SourceToken | undefined {
  const patterns: [RegExp, string][] = [
    [/^\$\$[\s\S]+?\$\$/, '公式'],
    [/^\$(?!\s|\$)(?:\\.|[^$\r\n])*?[^\s\\]\$(?!\$)/, '公式'],
    [/^\\\([\s\S]+?\\\)|^\\\[[\s\S]+?\\\]/, '公式'],
    [/^!?\[\[[^\]\n]+\]\]/, '双向链接'],
    [/^\[\^[^\]\n]+\]/, '脚注']
  ]
  for (const [pattern, kind] of patterns) {
    const raw = source.match(pattern)?.[0]
    if (raw) return { type: 'sourceInline', raw, kind }
  }
}

export const sourceBlockStart = (source: string) => source.search(/^(?:---|\+\+\+|\$\$|\\\[|\[\^|<(?:details|summary|script|style|iframe|video|audio|figure|svg|math|form|kbd|!--))/m)
export const sourceInlineStart = (source: string) => source.search(/\$|\\[([]|!?\[\[|\[\^/)

const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

export function sourceTokenHtml(source: string, kind: string, block: boolean) {
  const tag = block ? 'pre' : 'span'
  return `<${tag} data-markdown-source="${escape(source)}" data-source-kind="${escape(kind)}">${escape(source)}</${tag}>`
}

// The HTML fallback and TipTap use the same token boundaries. In particular,
// source text stays escaped and never becomes executable HTML or a URL.
export const sourceMarkedExtensions: TokenizerAndRendererExtension[] = [
  { name: 'sourceBlock', level: 'block', start: sourceBlockStart, tokenizer: sourceBlockToken,
    renderer: token => sourceTokenHtml(token.raw, String(token.kind), true) },
  { name: 'sourceInline', level: 'inline', start: sourceInlineStart, tokenizer: sourceInlineToken,
    renderer: token => sourceTokenHtml(token.raw, String(token.kind), false) }
]
