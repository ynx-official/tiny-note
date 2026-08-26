import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Paragraph from '@tiptap/extension-paragraph'
import Heading from '@tiptap/extension-heading'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import { Markdown } from '@tiptap/markdown'
import { Extension, Node } from '@tiptap/core'
import { safeColorValue } from '../utils/noteMarkdown'

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function safeAlign(value) {
  return /^(left|center|right|justify)$/.test(value || '') ? value : ''
}

function renderInlineNode(node) {
  if (node.type === 'hardBreak') return '<br>'
  if (node.type === 'image') {
    const src = escapeHtml(node.attrs?.src || '')
    const alt = escapeHtml(node.attrs?.alt || '')
    const title = node.attrs?.title ? ` title="${escapeHtml(node.attrs.title)}"` : ''
    return src ? `<img src="${src}" alt="${alt}"${title}>` : ''
  }
  let output = escapeHtml(node.text || '')
  for (const mark of node.marks || []) {
    if (mark.type === 'bold') output = `<strong>${output}</strong>`
    else if (mark.type === 'italic') output = `<em>${output}</em>`
    else if (mark.type === 'strike') output = `<s>${output}</s>`
    else if (mark.type === 'code') output = `<code>${output}</code>`
    else if (mark.type === 'underline') output = `<u>${output}</u>`
    else if (mark.type === 'subscript') output = `<sub>${output}</sub>`
    else if (mark.type === 'superscript') output = `<sup>${output}</sup>`
    else if (mark.type === 'highlight') {
      const color = safeColorValue(mark.attrs?.color)
      output = color
        ? `<mark data-color="${escapeHtml(color)}" style="background-color: ${escapeHtml(color)}">${output}</mark>`
        : `<mark>${output}</mark>`
    } else if (mark.type === 'textStyle') {
      const color = safeColorValue(mark.attrs?.color)
      if (color) output = `<span style="color: ${escapeHtml(color)}">${output}</span>`
    } else if (mark.type === 'link') {
      const href = escapeHtml(mark.attrs?.href || '')
      const title = mark.attrs?.title ? ` title="${escapeHtml(mark.attrs.title)}"` : ''
      if (href) output = `<a href="${href}"${title}>${output}</a>`
    }
  }
  return output
}

function renderInlineHtml(content = []) {
  return content.map(renderInlineNode).join('')
}

function renderBlockHtml(node) {
  if (node.type === 'paragraph') {
    const align = safeAlign(node.attrs?.textAlign)
    const style = align ? ` style="text-align: ${align}"` : ''
    return `<p${style}>${renderInlineHtml(node.content)}</p>`
  }
  if (node.type === 'heading') {
    const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1))
    const align = safeAlign(node.attrs?.textAlign)
    const style = align ? ` style="text-align: ${align}"` : ''
    return `<h${level}${style}>${renderInlineHtml(node.content)}</h${level}>`
  }
  return renderInlineHtml(node.content)
}

function hasComplexCells(node) {
  return (node.content || []).some(row => (row.content || []).some(cell =>
    Number(cell.attrs?.colspan || 1) > 1 ||
    Number(cell.attrs?.rowspan || 1) > 1 ||
    (Array.isArray(cell.attrs?.colwidth) && cell.attrs.colwidth.length > 0)
  ))
}

function renderComplexTable(node) {
  const rows = (node.content || []).map(row => {
    const cells = (row.content || []).map(cell => {
      const tag = cell.type === 'tableHeader' ? 'th' : 'td'
      const attributes = []
      if (Number(cell.attrs?.colspan || 1) > 1) attributes.push(`colspan="${Number(cell.attrs.colspan)}"`)
      if (Number(cell.attrs?.rowspan || 1) > 1) attributes.push(`rowspan="${Number(cell.attrs.rowspan)}"`)
      if (Array.isArray(cell.attrs?.colwidth) && cell.attrs.colwidth.length) attributes.push(`colwidth="${cell.attrs.colwidth.map(Number).join(',')}"`)
      const suffix = attributes.length ? ` ${attributes.join(' ')}` : ''
      return `<${tag}${suffix}>${(cell.content || []).map(renderBlockHtml).join('')}</${tag}>`
    }).join('')
    return `<tr>${cells}</tr>`
  }).join('')
  return `<table><tbody>${rows}</tbody></table>`
}

const MarkdownParagraph = Paragraph.extend({
  renderMarkdown(node, helpers, context) {
    const align = safeAlign(node.attrs?.textAlign)
    if (align) return `<p style="text-align: ${align}">${renderInlineHtml(node.content)}</p>`
    return Paragraph.config.renderMarkdown(node, helpers, context)
  }
})

const MarkdownHeading = Heading.extend({
  renderMarkdown(node, helpers, context) {
    const align = safeAlign(node.attrs?.textAlign)
    if (align) {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1))
      return `<h${level} style="text-align: ${align}">${renderInlineHtml(node.content)}</h${level}>`
    }
    return Heading.config.renderMarkdown(node, helpers, context)
  }
})

// Friday models the first editor block as a dedicated title node instead of a
// regular heading. This keeps title keyboard behavior and metadata extraction
// independent from the body heading controls.
const NoteTitle = Node.create({
  name: 'noteTitle',
  group: 'block',
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{ tag: 'h1[data-note-title]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['h1', { ...HTMLAttributes, 'data-note-title': 'true' }, 0]
  },

  renderMarkdown(node, helpers) {
    if (!node.content) return ''
    return `# ${helpers.renderChildren(node.content)}`
  }
})

// Keep the shortcut priority separate from the node priority. Raising the node
// itself would make noteTitle ProseMirror's default block and create titles in
// empty table cells; only the Enter handler needs to run before the base keymap.
const NoteTitleKeyboard = Extension.create({
  name: 'noteTitleKeyboard',
  priority: 1100,
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        if (!this.editor.isActive('noteTitle')) return false

        const { doc, selection } = this.editor.state
        const { $from } = selection
        const blockIndex = $from.index(0)
        const nextBlock = blockIndex + 1 < doc.childCount ? doc.child(blockIndex + 1) : null
        const canReuseEmptyParagraph = selection.empty
          && $from.parentOffset === $from.parent.content.size
          && nextBlock?.type.name === 'paragraph'
          && nextBlock.content.size === 0

        if (canReuseEmptyParagraph) {
          return this.editor.chain().focus().setTextSelection($from.after(1) + 1).run()
        }

        return this.editor.chain().splitBlock().setNode('paragraph').run()
      }
    }
  }
})

const MarkdownTextStyle = TextStyle.extend({
  renderMarkdown(node, helpers) {
    const color = safeColorValue(node.attrs?.color)
    return color
      ? `<span style="color: ${escapeHtml(color)}">${helpers.renderChildren(node)}</span>`
      : helpers.renderChildren(node)
  }
})

const MarkdownHighlight = Highlight.extend({
  renderMarkdown(node, helpers) {
    const color = safeColorValue(node.attrs?.color)
    return color
      ? `<mark data-color="${escapeHtml(color)}" style="background-color: ${escapeHtml(color)}">${helpers.renderChildren(node)}</mark>`
      : `==${helpers.renderChildren(node)}==`
  }
})

const MarkdownSubscript = Subscript.extend({
  renderMarkdown: (node, helpers) => `<sub>${helpers.renderChildren(node)}</sub>`
})

const MarkdownSuperscript = Superscript.extend({
  renderMarkdown: (node, helpers) => `<sup>${helpers.renderChildren(node)}</sup>`
})

const MarkdownTable = Table.extend({
  renderMarkdown(node, helpers) {
    if (hasComplexCells(node)) return renderComplexTable(node)
    return Table.config.renderMarkdown(node, helpers)
  }
})

export function createNoteExtensions({ lowlight, codeBlockNodeView, placeholder, resizableTables = true } = {}) {
  const extensions = [
    StarterKit.configure({
      codeBlock: lowlight ? false : {},
      heading: false,
      paragraph: false,
      link: false,
      underline: false
    }),
    MarkdownParagraph,
    NoteTitle,
    NoteTitleKeyboard,
    MarkdownHeading,
    Underline,
    Link.configure({ openOnClick: false }),
    MarkdownHighlight.configure({ multicolor: true }),
    Image.configure({ allowBase64: true }),
    MarkdownTable.configure({ resizable: resizableTables }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    MarkdownSubscript,
    MarkdownSuperscript,
    MarkdownTextStyle,
    Color,
    TextAlign.configure({ types: ['noteTitle', 'heading', 'paragraph'] }),
    Markdown.configure({ markedOptions: { gfm: true } })
  ]

  if (lowlight) {
    let codeBlock = CodeBlockLowlight.configure({ lowlight })
    if (codeBlockNodeView) codeBlock = codeBlock.extend({ addNodeView: () => codeBlockNodeView })
    extensions.push(codeBlock)
  }
  if (placeholder) extensions.push(Placeholder.configure({ placeholder }))
  return extensions
}
