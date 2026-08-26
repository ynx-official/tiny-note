import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MermaidDiagram from './MermaidDiagram.vue'

const initialResizeObserver = globalThis.ResizeObserver
const initialClientWidthDescriptor = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'clientWidth')

const rendererMocks = vi.hoisted(() => ({
  renderMermaidDiagram: vi.fn()
}))

vi.mock('../utils/mermaidRenderer', () => ({
  renderMermaidDiagram: rendererMocks.renderMermaidDiagram
}))

describe('MermaidDiagram', () => {
  beforeEach(() => {
    window.document.documentElement.dataset.theme = 'light'
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) }
    })
    rendererMocks.renderMermaidDiagram.mockResolvedValue({
      svg: '<svg viewBox="0 0 800 360"><text>审批完成</text></svg>'
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    if (initialResizeObserver) globalThis.ResizeObserver = initialResizeObserver
    else delete globalThis.ResizeObserver
    if (initialClientWidthDescriptor) Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', initialClientWidthDescriptor)
    else delete window.HTMLElement.prototype.clientWidth
    rendererMocks.renderMermaidDiagram.mockReset()
    window.document.body.innerHTML = ''
    delete window.document.documentElement.dataset.theme
  })

  it('renders a Mermaid flowchart with automatic fit and focused viewing controls', async () => {
    const source = 'flowchart LR\n  A[提交] --> B[审批]'
    const wrapper = mount(MermaidDiagram, {
      attachTo: window.document.body,
      props: { source }
    })
    await flushPromises()

    expect(rendererMocks.renderMermaidDiagram).toHaveBeenCalledWith(source, { theme: 'light' })
    expect(wrapper.get('.mermaid-diagram-svg').html()).toContain('审批完成')
    expect(wrapper.get('.mermaid-zoom-value').text()).toBe('100%')
    expect(wrapper.find('[aria-label="适合宽度"]').exists()).toBe(false)

    await wrapper.get('[aria-label="放大图表"]').trigger('click')
    await wrapper.get('[aria-label="放大图表"]').trigger('click')
    expect(wrapper.get('.mermaid-zoom-value').text()).toBe('150%')
    expect(wrapper.get('.mermaid-diagram-svg').attributes('style')).toContain('width: 1200px')

    await wrapper.get('.mermaid-diagram-stage').trigger('keydown', { key: '0' })
    expect(wrapper.get('.mermaid-zoom-value').text()).toBe('100%')

    await wrapper.get('[aria-label="全屏查看图表"]').trigger('click')
    expect(window.document.querySelector('.mermaid-fullscreen')).not.toBeNull()
    expect(window.document.querySelector('.mermaid-fullscreen [aria-label="适合宽度"]')).not.toBeNull()
    expect(window.document.querySelector('.mermaid-fullscreen .mermaid-zoom-value').textContent).toBe('100%')
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '+' }))
    await flushPromises()
    expect(window.document.querySelector('.mermaid-fullscreen .mermaid-zoom-value').textContent).toBe('125%')
    await window.document.querySelector('.mermaid-fullscreen [aria-label="复制图表源码"]').click()
    await flushPromises()
    expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(source)
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(window.document.querySelector('.mermaid-fullscreen')).toBeNull()
    expect(wrapper.get('.mermaid-zoom-value').text()).toBe('100%')

    wrapper.unmount()
  })

  it('expands an open diagram preview to the entire screen and exits one level at a time', async () => {
    const wrapper = mount(MermaidDiagram, {
      attachTo: window.document.body,
      props: { source: 'flowchart LR\nA --> B' }
    })
    await flushPromises()
    await wrapper.get('[aria-label="全屏查看图表"]').trigger('click')
    await flushPromises()

    const overlay = window.document.querySelector('.mermaid-fullscreen')
    const dialog = window.document.querySelector('.mermaid-fullscreen-dialog')
    const enter = window.document.querySelector('[aria-label="占满屏幕查看图表"]')
    expect(enter).not.toBeNull()

    enter.click()
    await flushPromises()
    expect(overlay.classList.contains('is-screen-fullscreen')).toBe(true)
    expect(dialog.classList.contains('is-screen-fullscreen')).toBe(true)
    expect(window.document.querySelector('[aria-label="退出屏幕全屏"]')).not.toBeNull()

    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    await flushPromises()
    expect(window.document.querySelector('.mermaid-fullscreen')).not.toBeNull()
    expect(overlay.classList.contains('is-screen-fullscreen')).toBe(false)

    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    await flushPromises()
    expect(window.document.querySelector('.mermaid-fullscreen')).toBeNull()
    wrapper.unmount()
  })

  it('prefers the native fullscreen API when the WebView provides it', async () => {
    const fullscreenElementDescriptor = Object.getOwnPropertyDescriptor(window.document, 'fullscreenElement')
    const exitFullscreenDescriptor = Object.getOwnPropertyDescriptor(window.document, 'exitFullscreen')
    let nativeFullscreenElement = null
    const wrapper = mount(MermaidDiagram, {
      attachTo: window.document.body,
      props: { source: 'flowchart LR\nA --> B' }
    })

    try {
      Object.defineProperty(window.document, 'fullscreenElement', {
        configurable: true,
        get: () => nativeFullscreenElement
      })
      Object.defineProperty(window.document, 'exitFullscreen', {
        configurable: true,
        value: vi.fn(async () => {
          nativeFullscreenElement = null
          window.document.dispatchEvent(new window.Event('fullscreenchange'))
        })
      })
      await flushPromises()
      await wrapper.get('[aria-label="全屏查看图表"]').trigger('click')
      await flushPromises()

      const dialog = window.document.querySelector('.mermaid-fullscreen-dialog')
      dialog.requestFullscreen = vi.fn(async () => {
        nativeFullscreenElement = dialog
        window.document.dispatchEvent(new window.Event('fullscreenchange'))
      })
      window.document.querySelector('[aria-label="占满屏幕查看图表"]').click()
      await flushPromises()

      expect(dialog.requestFullscreen).toHaveBeenCalledTimes(1)
      expect(window.document.fullscreenElement).toBe(dialog)
      window.document.querySelector('[aria-label="退出屏幕全屏"]').click()
      await flushPromises()
      expect(window.document.exitFullscreen).toHaveBeenCalledTimes(1)
      expect(window.document.fullscreenElement).toBeNull()
    } finally {
      wrapper.unmount()
      if (fullscreenElementDescriptor) Object.defineProperty(window.document, 'fullscreenElement', fullscreenElementDescriptor)
      else delete window.document.fullscreenElement
      if (exitFullscreenDescriptor) Object.defineProperty(window.document, 'exitFullscreen', exitFullscreenDescriptor)
      else delete window.document.exitFullscreen
    }
  })

  it('uses the dark Mermaid theme when the app is in dark mode', async () => {
    window.document.documentElement.dataset.theme = 'dark'
    const wrapper = mount(MermaidDiagram, { props: { source: 'flowchart TD\nA --> B' } })
    await flushPromises()

    expect(rendererMocks.renderMermaidDiagram).toHaveBeenCalledWith('flowchart TD\nA --> B', { theme: 'dark' })
    wrapper.unmount()
  })

  it('defaults wide diagrams to fit width and refits after the source changes', async () => {
    vi.useFakeTimers()
    let resolveFirstRender
    rendererMocks.renderMermaidDiagram.mockImplementationOnce(() => new Promise(resolve => {
      resolveFirstRender = resolve
    }))

    const wrapper = mount(MermaidDiagram, { props: { source: 'flowchart LR\nA --> B' } })
    const stage = wrapper.get('.mermaid-diagram-stage')
    Object.defineProperty(stage.element, 'clientWidth', { configurable: true, value: 400 })

    resolveFirstRender({ svg: '<svg viewBox="0 0 40000 360"><text>超宽流程</text></svg>' })
    await flushPromises()
    expect(wrapper.get('.mermaid-zoom-value').text()).toBe('1%')

    await wrapper.get('[aria-label="放大图表"]').trigger('click')
    expect(wrapper.get('.mermaid-zoom-value').text()).toBe('26%')

    await wrapper.setProps({ source: 'flowchart LR\nA --> C' })
    await vi.advanceTimersByTimeAsync(220)
    await flushPromises()
    expect(wrapper.get('.mermaid-zoom-value').text()).toBe('50%')

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('preserves auto-fit below the manual zoom floor and avoids wheel jumps', async () => {
    const originalResizeObserver = globalThis.ResizeObserver
    let resizeCallback
    globalThis.ResizeObserver = class {
      constructor(callback) { resizeCallback = callback }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    let resolveRender
    rendererMocks.renderMermaidDiagram.mockImplementationOnce(() => new Promise(resolve => {
      resolveRender = resolve
    }))
    const nowSpy = vi.spyOn(window.performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(200)

    const wrapper = mount(MermaidDiagram, { props: { source: 'flowchart LR\nA --> B' } })
    const stage = wrapper.get('.mermaid-diagram-stage')
    Object.defineProperty(stage.element, 'clientWidth', { configurable: true, value: 400 })
    resolveRender({ svg: '<svg viewBox="0 0 8000 360"><text>宽流程</text></svg>' })
    await flushPromises()
    expect(wrapper.get('.mermaid-zoom-value').text()).toBe('5%')

    await stage.trigger('keydown', { key: '-' })
    Object.defineProperty(stage.element, 'clientWidth', { configurable: true, value: 800 })
    resizeCallback()
    await flushPromises()
    expect(wrapper.get('.mermaid-zoom-value').text()).toBe('10%')

    Object.defineProperty(stage.element, 'clientWidth', { configurable: true, value: 400 })
    await stage.trigger('keydown', { key: '0' })
    const zoomInWheel = new window.WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      clientX: 200,
      clientY: 100,
      deltaY: -100
    })
    stage.element.dispatchEvent(zoomInWheel)
    await flushPromises()
    expect(wrapper.get('.mermaid-zoom-value').text()).toBe('20%')

    await stage.trigger('keydown', { key: '0' })
    const zoomOutWheel = new window.WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      clientX: 200,
      clientY: 100,
      deltaY: 100
    })
    stage.element.dispatchEvent(zoomOutWheel)
    await flushPromises()
    expect(wrapper.get('.mermaid-zoom-value').text()).toBe('5%')

    Object.defineProperty(stage.element, 'clientWidth', { configurable: true, value: 800 })
    resizeCallback()
    await flushPromises()
    expect(wrapper.get('.mermaid-zoom-value').text()).toBe('10%')

    await wrapper.get('[aria-label="放大图表"]').trigger('click')
    Object.defineProperty(stage.element, 'clientWidth', { configurable: true, value: 1200 })
    resizeCallback()
    await flushPromises()
    expect(wrapper.get('.mermaid-zoom-value').text()).toBe('35%')

    wrapper.unmount()
    nowSpy.mockRestore()
    if (originalResizeObserver) globalThis.ResizeObserver = originalResizeObserver
    else delete globalThis.ResizeObserver
  })

  it('does not let fullscreen resize observations overwrite inline fit', async () => {
    const originalResizeObserver = globalThis.ResizeObserver
    const clientWidthDescriptor = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'clientWidth')
    let resizeCallback
    globalThis.ResizeObserver = class {
      constructor(callback) { resizeCallback = callback }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        if (this.classList?.contains('mermaid-diagram-stage')) return 400
        if (this.classList?.contains('mermaid-fullscreen-stage')) return 800
        return clientWidthDescriptor?.get?.call(this) || 0
      }
    })

    const wrapper = mount(MermaidDiagram, {
      attachTo: window.document.body,
      props: { source: 'flowchart LR\nA --> B' }
    })
    await flushPromises()
    expect(wrapper.get('.mermaid-zoom-value').text()).toBe('50%')

    await wrapper.get('[aria-label="全屏查看图表"]').trigger('click')
    await flushPromises()
    resizeCallback()
    window.document.querySelector('[aria-label="关闭全屏图表"]').click()
    await flushPromises()
    expect(wrapper.get('.mermaid-zoom-value').text()).toBe('50%')

    wrapper.unmount()
    if (clientWidthDescriptor) Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', clientWidthDescriptor)
    else delete window.HTMLElement.prototype.clientWidth
    if (originalResizeObserver) globalThis.ResizeObserver = originalResizeObserver
    else delete globalThis.ResizeObserver
  })

  it('keeps fit-width overview zoom stable when it is below the manual minimum', async () => {
    const wrapper = mount(MermaidDiagram, { props: { source: 'flowchart LR\nA --> B' } })
    await flushPromises()
    const stage = wrapper.get('.mermaid-diagram-stage')
    Object.defineProperty(stage.element, 'clientWidth', { configurable: true, value: 400 })

    await stage.trigger('keydown', { key: '0' })
    expect(wrapper.get('.mermaid-zoom-value').text()).toBe('50%')
    await stage.trigger('keydown', { key: '-' })
    expect(wrapper.get('.mermaid-zoom-value').text()).toBe('50%')
    wrapper.unmount()
  })

  it('pans the fullscreen canvas while the primary pointer is held', async () => {
    const wrapper = mount(MermaidDiagram, {
      attachTo: window.document.body,
      props: { source: 'flowchart LR\nA --> B' }
    })
    await flushPromises()
    await wrapper.get('[aria-label="全屏查看图表"]').trigger('click')
    await flushPromises()

    const stage = window.document.querySelector('.mermaid-fullscreen-stage')
    Object.defineProperties(stage, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 600 },
      scrollWidth: { configurable: true, value: 1600 },
      scrollHeight: { configurable: true, value: 1000 }
    })
    stage.scrollLeft = 200
    stage.scrollTop = 140
    stage.setPointerCapture = vi.fn()
    stage.releasePointerCapture = vi.fn()
    const dispatchPointer = (type, values) => {
      const event = new window.Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])))
      stage.dispatchEvent(event)
      return event
    }

    const down = dispatchPointer('pointerdown', { button: 0, pointerId: 7, clientX: 100, clientY: 100 })
    dispatchPointer('pointermove', { pointerId: 7, clientX: 60, clientY: 130 })
    await flushPromises()

    expect(down.defaultPrevented).toBe(true)
    expect(stage.classList.contains('is-dragging')).toBe(true)
    expect(stage.setPointerCapture).toHaveBeenCalledWith(7)
    expect(stage.scrollLeft).toBe(240)
    expect(stage.scrollTop).toBe(110)

    dispatchPointer('pointerup', { pointerId: 7, clientX: 60, clientY: 130 })
    await flushPromises()
    expect(stage.classList.contains('is-dragging')).toBe(false)
    expect(stage.releasePointerCapture).toHaveBeenCalledWith(7)
    dispatchPointer('pointermove', { pointerId: 7, clientX: 20, clientY: 20 })
    expect(stage.scrollLeft).toBe(240)
    expect(stage.scrollTop).toBe(110)
    dispatchPointer('pointerdown', { button: 2, pointerId: 8, clientX: 100, clientY: 100 })
    expect(stage.setPointerCapture).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('zooms the fullscreen diagram around the pointer position with the wheel', async () => {
    const wrapper = mount(MermaidDiagram, {
      attachTo: window.document.body,
      props: { source: 'flowchart LR\nA --> B' }
    })
    await flushPromises()
    await wrapper.get('[aria-label="全屏查看图表"]').trigger('click')
    await flushPromises()

    const stage = window.document.querySelector('.mermaid-fullscreen-stage')
    const diagram = stage.querySelector('.mermaid-diagram-svg > svg')
    Object.defineProperties(stage, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 600 },
      scrollWidth: { configurable: true, value: 1600 },
      scrollHeight: { configurable: true, value: 1000 }
    })
    stage.scrollLeft = 200
    stage.scrollTop = 150
    diagram.getBoundingClientRect = vi.fn()
      .mockReturnValueOnce({ left: 100, top: 100, width: 800, height: 400, right: 900, bottom: 500 })
      .mockReturnValueOnce({ left: 80, top: 90, width: 920, height: 460, right: 1000, bottom: 550 })

    const wheel = new window.WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 500,
      clientY: 300,
      deltaY: -100
    })
    stage.dispatchEvent(wheel)
    await flushPromises()

    expect(wheel.defaultPrevented).toBe(true)
    expect(window.document.querySelector('.mermaid-fullscreen .mermaid-zoom-value').textContent).toBe('115%')
    expect(stage.scrollLeft).toBe(240)
    expect(stage.scrollTop).toBe(170)
    expect(stage.querySelector('.mermaid-fullscreen-svg').getAttribute('style')).toContain('transition: none')
    wrapper.unmount()
  })

  it('keeps a useful error state and lets the editor return to source', async () => {
    rendererMocks.renderMermaidDiagram.mockRejectedValueOnce(new Error('Parse error'))
    const wrapper = mount(MermaidDiagram, { props: { source: 'flowchart ???' } })
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('Mermaid 语法')
    await wrapper.get('.mermaid-show-source').trigger('click')
    expect(wrapper.emitted('show-source')).toHaveLength(1)
    wrapper.unmount()
  })

  it('explains that external diagram resources are blocked for privacy', async () => {
    const reason = new Error('为保护隐私，图表不允许加载图片或外部资源。请改用普通节点和文字标签。')
    reason.code = 'MERMAID_EXTERNAL_RESOURCE'
    rendererMocks.renderMermaidDiagram.mockRejectedValueOnce(reason)
    const wrapper = mount(MermaidDiagram, { props: { source: 'flowchart LR\nA@{ img: "https://tracker.invalid/pixel.png" }' } })
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('为保护隐私')
    expect(wrapper.get('[role="alert"]').text()).not.toContain('语法有误')
    wrapper.unmount()
  })

  it('removes a previous preview as soon as changed source becomes stale', async () => {
    vi.useFakeTimers()
    const wrapper = mount(MermaidDiagram, { props: { source: 'flowchart LR\nA --> B' } })
    await flushPromises()
    expect(wrapper.find('.mermaid-diagram-svg').exists()).toBe(true)

    rendererMocks.renderMermaidDiagram.mockRejectedValueOnce(new Error('Parse error'))
    await wrapper.setProps({ source: 'flowchart ???' })
    expect(wrapper.find('.mermaid-diagram-svg').exists()).toBe(false)
    expect(wrapper.get('[aria-label="全屏查看图表"]').attributes()).toHaveProperty('disabled')

    await vi.advanceTimersByTimeAsync(220)
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Mermaid 语法')
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('discards an older render that finishes during the source debounce window', async () => {
    vi.useFakeTimers()
    let resolveOlderRender
    rendererMocks.renderMermaidDiagram
      .mockImplementationOnce(() => new Promise(resolve => { resolveOlderRender = resolve }))
      .mockResolvedValueOnce({ svg: '<svg viewBox="0 0 400 200"><text>新结果</text></svg>' })

    const wrapper = mount(MermaidDiagram, { props: { source: 'flowchart LR\nold --> result' } })
    await wrapper.setProps({ source: 'flowchart LR\nnew --> result' })
    resolveOlderRender({ svg: '<svg viewBox="0 0 400 200"><text>旧结果</text></svg>' })
    await flushPromises()
    expect(wrapper.text()).not.toContain('旧结果')

    await vi.advanceTimersByTimeAsync(220)
    await flushPromises()
    expect(wrapper.get('.mermaid-diagram-svg').html()).toContain('新结果')
    wrapper.unmount()
    vi.useRealTimers()
  })
})
