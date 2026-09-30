import { Node } from '@tiptap/core'
import { sourceBlockStart, sourceBlockToken, sourceInlineStart, sourceInlineToken } from '../utils/sourceMarkdown'

function sourceNode(inline: boolean) {
  const name = inline ? 'sourceInline' : 'sourceBlock'
  const tag = inline ? 'span' : 'pre'
  return Node.create({
    name,
    group: inline ? 'inline' : 'block',
    inline,
    atom: true,
    selectable: true,
    addAttributes: () => ({
      source: { default: '', parseHTML: element => element.getAttribute('data-markdown-source'), rendered: false },
      kind: { default: '源码', parseHTML: element => element.getAttribute('data-source-kind') || '源码', rendered: false }
    }),
    parseHTML: () => [{ tag: `${tag}[data-markdown-source]`, priority: 100 }],
    renderHTML: ({ node }) => [tag, {
      'data-markdown-source': node.attrs.source,
      'data-source-kind': node.attrs.kind,
      title: `${node.attrs.kind}：保留原始语法，可在 Markdown 模式编辑`
    }, node.attrs.source],
    renderText: ({ node }) => node.attrs.source,
    markdownTokenizer: {
      name, level: inline ? 'inline' : 'block',
      start: inline ? sourceInlineStart : sourceBlockStart,
      tokenize: inline ? sourceInlineToken : sourceBlockToken
    },
    parseMarkdown: (token, helpers) => helpers.createNode(name, { source: token.raw, kind: token.kind }),
    renderMarkdown: node => node.attrs?.source || ''
  })
}

export const SourceBlock = sourceNode(false)
export const SourceInline = sourceNode(true)
