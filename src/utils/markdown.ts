import DOMPurify from 'dompurify'
import { Marked, Renderer } from 'marked'

function escapeHtml(value: unknown) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const renderer = new Renderer()

renderer.blockquote = function ({ tokens }) {
  return `<blockquote class="markdown-blockquote">\n${this.parser.parse(tokens)}</blockquote>\n`
}

renderer.code = ({ text, lang }) => {
  const language = String(lang || '').trim().split(/\s+/)[0].replace(/[^\w+-]/g, '')
  const label = language || 'auto'
  return `<div class="markdown-code-block"><div class="markdown-code-header"><span>${escapeHtml(label)}</span><button type="button" class="markdown-code-copy" title="复制代码" aria-label="复制代码">复制</button></div><pre><code class="language-${escapeHtml(language)}">${escapeHtml(text)}</code></pre></div>`
}

const markdown = new Marked({
  breaks: true,
  gfm: true,
  renderer
})

export function renderMarkdown(source: unknown) {
  const html = markdown.parse(String(source || ''))
  return DOMPurify.sanitize(String(html))
}
