export function createMermaidViewportKernel() {
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))

  const readNaturalWidth = svgText => {
    const viewBox = String(svgText || '').match(/\bviewBox=["']\s*[-+\d.e]+[ ,]+[-+\d.e]+[ ,]+([-+\d.e]+)[ ,]+[-+\d.e]+\s*["']/i)
    const width = Number(viewBox?.[1])
    if (Number.isFinite(width) && width > 0) return width
    const widthAttribute = String(svgText || '').match(/<svg\b[^>]*\bwidth=["']([\d.]+)(?:px)?["']/i)
    const fallback = Number(widthAttribute?.[1])
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0
  }

  const fitZoom = (availableWidth, naturalWidth) => availableWidth && naturalWidth
    ? Math.min(100, Math.max(1, Math.floor(availableWidth / naturalWidth * 100)))
    : 100

  const nextZoom = (current, direction, { minimum, maximum = 250, step } = {}) => {
    if (direction < 0 && current <= minimum) return current
    return direction > 0
      ? Math.min(maximum, current + step)
      : Math.max(minimum, current - step)
  }

  const pointerAnchor = (rect, clientX, clientY) => ({
    x: rect.width ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0.5,
    y: rect.height ? clamp((clientY - rect.top) / rect.height, 0, 1) : 0.5,
    clientX,
    clientY
  })

  const anchoredScroll = (stage, { after, anchor }) => ({
    left: stage.scrollLeft + after.left + after.width * anchor.x - anchor.clientX,
    top: stage.scrollTop + after.top + after.height * anchor.y - anchor.clientY
  })

  const clampScroll = (stage, left, top) => ({
    left: clamp(left, 0, Math.max(0, stage.scrollWidth - stage.clientWidth)),
    top: clamp(top, 0, Math.max(0, stage.scrollHeight - stage.clientHeight))
  })

  const panScroll = (session, clientX, clientY) => ({
    left: session.scrollLeft - (clientX - session.clientX),
    top: session.scrollTop - (clientY - session.clientY)
  })

  return { anchoredScroll, clamp, clampScroll, fitZoom, nextZoom, panScroll, pointerAnchor, readNaturalWidth }
}
