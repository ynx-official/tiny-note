import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderMermaidDiagram } from './mermaidRenderer'

const mermaidMocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(),
  render: vi.fn()
}))

vi.mock('mermaid', () => ({
  default: {
    initialize: mermaidMocks.initialize,
    parse: mermaidMocks.parse,
    render: mermaidMocks.render
  }
}))

describe('renderMermaidDiagram', () => {
  beforeEach(() => {
    mermaidMocks.initialize.mockReset()
    mermaidMocks.parse.mockReset().mockResolvedValue({ diagramType: 'flowchart-v2' })
    mermaidMocks.render.mockReset().mockResolvedValue({
      svg: '<svg viewBox="0 0 100 80" onload="alert(1)"><style>@import url(https://tracker.invalid/style.css);</style><defs><marker id="arrow"></marker></defs><foreignObject><div onclick="alert(1)" style="background:url(https://tracker.invalid/pixel)"><span><p>申请人</p></span><script>alert(1)</script><img src="x" onerror="alert(1)"></div></foreignObject><path marker-end="url(#arrow)"></path><text>安全图表</text></svg>'
    })
  })

  it('validates and renders with strict locked-down Mermaid settings', async () => {
    const source = 'flowchart LR\nA --> B'
    const result = await renderMermaidDiagram(source, { theme: 'light' })

    expect(mermaidMocks.initialize).toHaveBeenCalledWith(expect.objectContaining({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      htmlLabels: false,
      flowchart: expect.objectContaining({ useMaxWidth: false }),
      swimlane: expect.objectContaining({ lineHops: 'arc' })
    }))
    expect(mermaidMocks.parse).toHaveBeenCalledWith(source)
    expect(mermaidMocks.render).toHaveBeenCalledWith(expect.stringMatching(/^tiny-note-mermaid-/), source)
    expect(result.svg).toContain('安全图表')
    expect(result.svg).toContain('申请人')
    expect(result.svg).toMatch(/<foreignObject\b/i)
    expect(result.svg).toContain('marker-end="url(#arrow)"')
    expect(result.svg).not.toContain('<script')
    expect(result.svg).not.toContain('onload')
    expect(result.svg).not.toContain('onclick')
    expect(result.svg).not.toContain('<img')
    expect(result.svg).not.toContain('tracker.invalid')
  })

  it('keeps Mermaid theme CSS and internal SVG fragment references', async () => {
    mermaidMocks.render.mockResolvedValueOnce({
      svg: '<svg viewBox="0 0 100 80"><style>.node rect{fill:#f6f5f4;stroke:#c8c4be}.cluster rect{fill:#fafaf9}.flowchart-link{fill:none;stroke:#78716c}.arrow{marker-end:url(#arrow)}</style><defs><marker id="arrow"></marker></defs><rect class="node"></rect><path class="arrow"></path></svg>'
    })

    const { svg } = await renderMermaidDiagram('flowchart LR\nA --> B')

    expect(svg).toContain('<style>')
    expect(svg).toContain('.node rect{fill:#f6f5f4')
    expect(svg).toContain('.cluster rect{fill:#fafaf9}')
    expect(svg).toContain('.flowchart-link{fill:none;stroke:#78716c}')
    expect(svg).toContain('marker-end:url(#arrow)')
  })

  it('removes external resources hidden with simple CSS escapes from generated SVG', async () => {
    mermaidMocks.render.mockResolvedValueOnce({
      svg: '<svg viewBox="0 0 100 80"><style>.node{fill:u\\rl(h\\ttps://tracker.invalid/pixel.png)}</style><rect class="node" style="fill:u\\rl(h\\ttps://tracker.invalid/pixel.png)"></rect><text>保留内容</text></svg>'
    })

    const { svg } = await renderMermaidDiagram('flowchart LR\nA --> B')

    expect(svg).toContain('保留内容')
    expect(svg).not.toContain('tracker.invalid')
    expect(svg).not.toContain('u\\rl')
  })

  it('does not render invalid Mermaid source', async () => {
    mermaidMocks.parse.mockRejectedValueOnce(new Error('Parse error'))

    await expect(renderMermaidDiagram('swimlane-beta ???', { theme: 'dark' })).rejects.toThrow('Parse error')
    expect(mermaidMocks.render).not.toHaveBeenCalled()
  })

  it.each([
    'flowchart LR\nA@{ img: "https://tracker.invalid/pixel.png" }',
    'flowchart LR\nA@{ \\u0069mg: "\\2f\\2ftracker.invalid/pixel.png" }',
    'flowchart LR\nA@{ "\\x69mg": "\\x68ttps\\x3a\\x2f\\x2ftracker.invalid/pixel.png" }',
    'flowchart LR\nA[![跟踪图](https://tracker.invalid/pixel.png)]',
    'flowchart LR\nclassDef tracked fill:url(https://tracker.invalid/pixel.png)',
    'flowchart LR\nclassDef tracked fill:u\\72l(\\2f\\2ftracker.invalid/pixel.png)',
    'flowchart LR\nclassDef tracked fill:u\\rl(h\\ttps://tracker.invalid/pixel.png)'
  ])('rejects external resources before Mermaid parses them', async source => {
    await expect(renderMermaidDiagram(source)).rejects.toMatchObject({ code: 'MERMAID_EXTERNAL_RESOURCE' })
    expect(mermaidMocks.parse).not.toHaveBeenCalled()
    expect(mermaidMocks.render).not.toHaveBeenCalled()
  })
})
