export function createMermaidViewportKernel() {
  interface Stage { scrollLeft: number; scrollTop: number; scrollWidth: number; scrollHeight: number; clientWidth: number; clientHeight: number }
  interface PanSession { scrollLeft: number; scrollTop: number; clientX: number; clientY: number }
  const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))

  const readNaturalWidth = (svgText: string) => {
    const viewBox = String(svgText || '').match(/\bviewBox=["']\s*[-+\d.e]+[ ,]+[-+\d.e]+[ ,]+([-+\d.e]+)[ ,]+[-+\d.e]+\s*["']/i)
    const width = Number(viewBox?.[1])
    if (Number.isFinite(width) && width > 0) return width
    const widthAttribute = String(svgText || '').match(/<svg\b[^>]*\bwidth=["']([\d.]+)(?:px)?["']/i)
    const fallback = Number(widthAttribute?.[1])
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0
  }

  const fitZoom = (availableWidth: number, naturalWidth: number) => availableWidth && naturalWidth
    ? Math.min(100, Math.max(1, Math.floor(availableWidth / naturalWidth * 100)))
    : 100

  const nextZoom = (current: number, direction: number, { minimum = 1, maximum = 250, step = 10 }: { minimum?: number; maximum?: number; step?: number } = {}) => {
    if (direction < 0 && current <= minimum) return current
    return direction > 0
      ? Math.min(maximum, current + step)
      : Math.max(minimum, current - step)
  }

  const pointerAnchor = (rect: DOMRect, clientX: number, clientY: number) => ({
    x: rect.width ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0.5,
    y: rect.height ? clamp((clientY - rect.top) / rect.height, 0, 1) : 0.5,
    clientX,
    clientY
  })

  const anchoredScroll = (stage: Stage, { after, anchor }: { before?: unknown; after: DOMRect; anchor: { x: number; y: number; clientX: number; clientY: number } }) => ({
    left: stage.scrollLeft + after.left + after.width * anchor.x - anchor.clientX,
    top: stage.scrollTop + after.top + after.height * anchor.y - anchor.clientY
  })

  const clampScroll = (stage: Stage, left: number, top: number) => ({
    left: clamp(left, 0, Math.max(0, stage.scrollWidth - stage.clientWidth)),
    top: clamp(top, 0, Math.max(0, stage.scrollHeight - stage.clientHeight))
  })

  const panScroll = (session: PanSession, clientX: number, clientY: number) => ({
    left: session.scrollLeft - (clientX - session.clientX),
    top: session.scrollTop - (clientY - session.clientY)
  })

  return { anchoredScroll, clamp, clampScroll, fitZoom, nextZoom, panScroll, pointerAnchor, readNaturalWidth }
}
