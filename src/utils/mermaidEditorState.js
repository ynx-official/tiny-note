const pendingDiagramSources = new WeakMap()

export function markMermaidDiagramForEditing(editor, source) {
  if (editor && typeof editor === 'object') pendingDiagramSources.set(editor, String(source || ''))
}

export function consumeMermaidDiagramForEditing(editor, source) {
  if (!editor || typeof editor !== 'object') return false
  const pendingSource = pendingDiagramSources.get(editor)
  if (pendingSource !== String(source || '')) return false
  pendingDiagramSources.delete(editor)
  return true
}
