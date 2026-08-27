import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { renderMermaidDiagram } from './mermaidRenderer'

const swimlaneSource = [
  'swimlane-beta LR',
  '  accTitle: 示例审批泳道',
  '  accDescr: 申请人提交申请，审批人审核并返回结果。',
  '  subgraph applicant [申请人]',
  '    submit[提交申请]',
  '    receive[接收结果]',
  '  end',
  '  subgraph reviewer [审批人]',
  '    review{是否批准}',
  '  end',
  '  submit --> review --> receive'
].join('\n')

const groupedFlowchartSource = [
  'flowchart LR',
  '  subgraph sales [业务员/销售]',
  '    register[来源登记] --> negotiate[洽谈建档/意向评定]',
  '  end',
  '  subgraph manager [客户经理]',
  '    receive[接收建档] --> survey[安排铁三角勘察]',
  '  end',
  '  negotiate -.交接.-> receive'
].join('\n')

describe('Mermaid runtime integration', () => {
  const SvgElement = window.SVGElement
  let originalGetComputedTextLength
  let originalGetBBox

  beforeAll(() => {
    originalGetComputedTextLength = SvgElement.prototype.getComputedTextLength
    originalGetBBox = SvgElement.prototype.getBBox
    SvgElement.prototype.getComputedTextLength = function getComputedTextLength() {
      return (this.textContent || '').length * 8
    }
    SvgElement.prototype.getBBox = function getBBox() {
      return { x: 0, y: 0, width: Math.max(1, (this.textContent || '').length * 8), height: 20 }
    }
  })

  afterAll(() => {
    if (originalGetComputedTextLength) SvgElement.prototype.getComputedTextLength = originalGetComputedTextLength
    else delete SvgElement.prototype.getComputedTextLength
    if (originalGetBBox) SvgElement.prototype.getBBox = originalGetBBox
    else delete SvgElement.prototype.getBBox
  })

  it('keeps native swimlane headings, edges, and accessible metadata', async () => {
    const { svg } = await renderMermaidDiagram(swimlaneSource, { theme: 'light' })
    const document = new window.DOMParser().parseFromString(svg, 'image/svg+xml')
    const visibleLabels = [...document.querySelectorAll('foreignObject, foreignobject, text')].map(node => node.textContent.trim())

    expect(svg).toContain('申请人')
    expect(visibleLabels).toEqual(expect.arrayContaining(['申请人', '审批人']))
    expect(document.documentElement.textContent).toContain('提交申请')
    expect(document.documentElement.textContent).toContain('是否批准')
    expect(document.querySelector('path[marker-end]')).not.toBeNull()
    expect(document.querySelector('title')?.textContent).toBe('示例审批泳道')
    expect(document.querySelector('desc')?.textContent).toContain('申请人提交申请')
    expect(document.documentElement.getAttribute('aria-labelledby')).toBeTruthy()
  }, 15000)

  it('keeps the generated theme stylesheet for grouped flowcharts', async () => {
    const { svg } = await renderMermaidDiagram(groupedFlowchartSource, { theme: 'light' })
    const document = new window.DOMParser().parseFromString(svg, 'image/svg+xml')
    const stylesheet = [...document.querySelectorAll('style')].map(node => node.textContent).join('\n')

    expect(stylesheet).toMatch(/\.node\s+rect[^}]*fill:\s*#fafaf9/i)
    expect(stylesheet).toMatch(/\.cluster\s+rect[^}]*fill:\s*#fafaf9/i)
    expect(stylesheet).toMatch(/\.flowchart-link[^}]*fill:\s*none/i)

    const darkResult = await renderMermaidDiagram(groupedFlowchartSource, { theme: 'dark' })
    const darkDocument = new window.DOMParser().parseFromString(darkResult.svg, 'image/svg+xml')
    const darkStylesheet = [...darkDocument.querySelectorAll('style')].map(node => node.textContent).join('\n')
    expect(darkStylesheet).toMatch(/\.node\s+rect[^}]*fill:\s*#242428/i)
    expect(darkStylesheet).toMatch(/\.cluster\s+rect[^}]*fill:\s*#222225/i)
  }, 15000)

  it('blocks image nodes before the Mermaid runtime can create an Image request', async () => {
    const OriginalImage = window.Image
    const ImageSpy = vi.fn(function ImageSpy() {
      throw new Error('Image construction must remain unreachable')
    })
    window.Image = ImageSpy
    try {
      await expect(renderMermaidDiagram('flowchart LR\nA@{ img: "https://tracker.invalid/pixel.png" }')).rejects.toMatchObject({
        code: 'MERMAID_EXTERNAL_RESOURCE'
      })
      expect(ImageSpy).not.toHaveBeenCalled()
    } finally {
      window.Image = OriginalImage
    }
  })
})
