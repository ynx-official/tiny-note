import Vditor from 'vditor'

// Derived preview nodes are replaced by Vditor as the document changes. A weak
// cache preserves diagram source for recoloring without touching the edit DOM,
// serializing SVG labels as Markdown, or retaining closed notes in memory.
const sources = new WeakMap<Element, string>()
let installed = false

export function installVditorDiagramTheme() {
  if (installed) return
  installed = true
  const adapter = Vditor.adapterRender.mermaidRenderAdapter
  const getCode = adapter.getCode
  adapter.getCode = element => {
    const code = getCode(element)
    if (element.getAttribute('data-processed') !== 'true' && !element.querySelector('svg')) sources.set(element, code || '')
    return code
  }
}

export function refreshVditorDiagramTheme(host: HTMLElement, dark: boolean) {
  for (const element of host.querySelectorAll('.language-mermaid[data-processed="true"]')) {
    const source = sources.get(element)
    if (source === undefined) continue
    element.textContent = source
    element.removeAttribute('data-processed')
    // Rendering the whole editor also matches language-* classes in the
    // editable IR source. Restrict the native renderer to this preview block.
    if (element.parentElement) Vditor.mermaidRender(element.parentElement, '/vendor/vditor', dark ? 'dark' : 'classic')
  }
}
