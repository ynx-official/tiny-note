import type Vditor from 'vditor'
import { mapMarkdownSelection, type MarkdownSelection } from './markdownSelection'

/** Work on a clone: inserting selection markers into the live editor would
 * pollute undo, trigger autosave, and interfere with Chinese composition. */
export function readVditorSelection(instance: Vditor, source: string): MarkdownSelection | null {
  const mode = instance.getCurrentMode()
  const root = instance.vditor[mode]?.element
  if (!root) return null
  const selection = window.getSelection()
  if (!selection?.rangeCount) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  const nodes: Node[] = [root]
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL)
  while (walker.nextNode()) nodes.push(walker.currentNode)
  const clone = root.cloneNode(true) as HTMLElement
  const copies: Node[] = [clone]
  const clonedWalker = document.createTreeWalker(clone, NodeFilter.SHOW_ALL)
  while (clonedWalker.nextNode()) copies.push(clonedWalker.currentNode)
  const copyRange = document.createRange()
  copyRange.setStart(copies[nodes.indexOf(range.startContainer)], range.startOffset)
  copyRange.setEnd(copies[nodes.indexOf(range.endContainer)], range.endOffset)
  const nonce = crypto.randomUUID().replaceAll('-', '')
  const start = `TNSTART${nonce}`
  const end = `TNEND${nonce}`
  const endRange = copyRange.cloneRange()
  endRange.collapse(false)
  endRange.insertNode(document.createTextNode(end))
  copyRange.collapse(true)
  copyRange.insertNode(document.createTextNode(start))
  const marked = mode === 'sv' ? (clone.textContent || '') : mode === 'ir'
    ? instance.vditor.lute.VditorIRDOM2Md(clone.innerHTML)
    : instance.vditor.lute.VditorDOM2Md(clone.innerHTML)
  const from = marked.indexOf(start)
  const endIndex = marked.indexOf(end)
  if (from < 0 || endIndex < from) return null
  const canonical = marked.replace(start, '').replace(end, '')
  return mapMarkdownSelection(canonical, source, from, endIndex - start.length)
}
