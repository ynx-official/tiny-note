import { describe, expect, it, vi } from 'vitest'
import Vditor from 'vditor'
import { installVditorDiagramTheme, refreshVditorDiagramTheme } from './vditorDiagramTheme'

describe('Vditor diagram theme refresh', () => {
  it('re-renders only derived diagrams from the original source without touching editable code', () => {
    installVditorDiagramTheme()
    const host = document.createElement('div')
    host.innerHTML = '<pre contenteditable="true"><code class="language-mermaid">flowchart LR\nA --> B</code></pre><div contenteditable="false"><code class="language-mermaid">flowchart LR\nA --> B</code></div>'
    const diagram = host.querySelector('div code')!
    const source = Vditor.adapterRender.mermaidRenderAdapter.getCode(diagram)
    diagram.innerHTML = '<svg><text>A B</text></svg>'
    diagram.setAttribute('data-processed', 'true')
    // Native Vditor calls getCode even for already-rendered blocks.
    Vditor.adapterRender.mermaidRenderAdapter.getCode(diagram)
    const render = vi.spyOn(Vditor, 'mermaidRender').mockImplementation(() => {})
    try {
      refreshVditorDiagramTheme(host, true)
      expect(diagram.textContent).toBe(source)
      expect(diagram.hasAttribute('data-processed')).toBe(false)
      expect(host.querySelector('pre')!.textContent).toBe(source)
      expect(render).toHaveBeenCalledWith(diagram.parentElement, '/vendor/vditor', 'dark')
      expect(render.mock.calls[0][0].querySelector('[contenteditable="true"]')).toBeNull()
    } finally { render.mockRestore() }
  })
})
