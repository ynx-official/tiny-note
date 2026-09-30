import DiffMatchPatch from 'diff-match-patch'

/** Offsets are UTF-16 positions in Markdown, never rendered DOM positions. */
export interface MarkdownSelection { from: number; to: number; text: string; source?: string }

export function mapMarkdownSelection(canonical: string, source: string, from: number, to: number): MarkdownSelection {
  const dmp = new DiffMatchPatch()
  const diffs = dmp.diff_main(canonical, source)
  const start = dmp.diff_xIndex(diffs, from)
  const end = dmp.diff_xIndex(diffs, to)
  return { from: start, to: end, text: source.slice(start, end), source }
}

export function applyMarkdownProposal(source: string, replacement: string, mode: 'insert' | 'replace', selection: MarkdownSelection | null): string {
  if (!selection) {
    if (mode === 'insert') throw new Error('请先选择可靠的插入位置')
    return replacement
  }
  if (selection.source != null && selection.source !== source) throw new Error('文章已经发生变化，请重新生成修改建议。')
  let { from, to } = selection
  const valid = Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to >= from && to <= source.length
  if (!valid || source.slice(from, to) !== selection.text) {
    // Old proposals used ProseMirror positions. Only recover a unique exact match.
    from = selection.text ? source.indexOf(selection.text) : -1
    if (from < 0 || source.indexOf(selection.text, from + 1) >= 0) throw new Error('选区已失效，请重新选择并生成建议。')
    to = from + selection.text.length
  }
  return source.slice(0, mode === 'insert' ? to : from) + replacement + source.slice(to)
}
