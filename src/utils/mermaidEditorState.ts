const pendingDiagramSources = new WeakMap<object, string>()

export function markMermaidDiagramForEditing(editor: object | null | undefined, source: string) {
  if (editor && typeof editor === 'object') pendingDiagramSources.set(editor, String(source || ''))
}

export function consumeMermaidDiagramForEditing(editor: object | null | undefined, source: string) {
  if (!editor || typeof editor !== 'object') return false
  const pendingSource = pendingDiagramSources.get(editor)
  if (pendingSource !== String(source || '')) return false
  pendingDiagramSources.delete(editor)
  return true
}
