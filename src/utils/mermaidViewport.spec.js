import { describe, expect, it } from 'vitest'
import { createMermaidViewportKernel } from './mermaidViewport'

describe('shared Mermaid viewport kernel', () => {
  const viewport = createMermaidViewportKernel()

  it('uses the same natural width, fit floor, and manual zoom rules for app and exports', () => {
    expect(viewport.readNaturalWidth('<svg viewBox="0 0 1600 900"></svg>')).toBe(1600)
    expect(viewport.fitZoom(400, 1600)).toBe(25)
    expect(viewport.fitZoom(4, 1600)).toBe(1)
    expect(viewport.nextZoom(100, 1, { minimum: 75, step: 25 })).toBe(125)
    expect(viewport.nextZoom(80, -1, { minimum: 75, step: 15 })).toBe(75)
    expect(viewport.nextZoom(25, -1, { minimum: 75, step: 15 })).toBe(25)
  })

  it('keeps pointer-anchored zoom and panning inside scroll bounds', () => {
    const anchor = viewport.pointerAnchor({ left: 100, top: 50, width: 400, height: 200 }, 300, 100)
    expect(anchor).toEqual({ x: 0.5, y: 0.25, clientX: 300, clientY: 100 })
    expect(viewport.anchoredScroll({ scrollLeft: 200, scrollTop: 100 }, {
      before: { left: 100, top: 50, width: 400, height: 200 },
      after: { left: 80, top: 40, width: 500, height: 250 },
      anchor
    })).toEqual({ left: 230, top: 102.5 })
    expect(viewport.clampScroll({ scrollWidth: 900, scrollHeight: 500, clientWidth: 400, clientHeight: 240 }, 700, -20))
      .toEqual({ left: 500, top: 0 })
  })
})
