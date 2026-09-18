import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ImagePreviewStage from './ImagePreviewStage.vue'

describe('image preview navigation', () => {
  afterEach(() => vi.restoreAllMocks())
  async function setup() {
    const wrapper = mount(ImagePreviewStage, { props: { src: 'data:image/png;base64,AA==', alt: '预览图片' } })
    const stage = wrapper.get('.image-preview-stage')
    vi.spyOn(stage.element, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 832, height: 632 } as DOMRect)
    const image = wrapper.get('img')
    Object.defineProperties(image.element, { naturalWidth: { value: 1600 }, naturalHeight: { value: 1200 } })
    await image.trigger('load')
    return { wrapper, stage, image }
  }
  it('fits initially, zooms using controls and resets after panning', async () => {
    const { wrapper, stage, image } = await setup()
    expect(wrapper.text()).toContain('50%')
    await wrapper.get('[aria-label="放大图片"]').trigger('click')
    expect(wrapper.text()).toContain('60%')
    await stage.trigger('pointerdown', { pointerId: 1, button: 0, clientX: 100, clientY: 100 })
    await stage.trigger('pointermove', { pointerId: 1, buttons: 1, clientX: 150, clientY: 130 })
    expect(image.attributes('style')).toContain('50px')
    await stage.trigger('pointerup', { pointerId: 1 })
    expect(stage.classes()).not.toContain('is-dragging')
    await wrapper.get('[aria-label="适合窗口"]').trigger('click')
    expect(wrapper.text()).toContain('50%')
    expect(image.attributes('style')).toContain('translate(0px, 0px)')
    wrapper.unmount()
  })
  it('keeps the image point under the cursor fixed while wheel zooming', async () => {
    const { wrapper, stage, image } = await setup()
    stage.element.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 516, clientY: 316, bubbles: true, cancelable: true }))
    await nextTick()
    expect(wrapper.text()).toContain('60%')
    expect(image.attributes('style')).toContain('translate(-20px, 0px)')
    wrapper.unmount()
  })
  it('supports original size and keyboard zoom, with bounded zoom', async () => {
    const { wrapper, stage } = await setup()
    await wrapper.get('[aria-label="原始尺寸"]').trigger('click')
    expect(wrapper.text()).toContain('100%')
    await stage.trigger('keydown', { key: '-' })
    expect(wrapper.text()).toContain('83%')
    for (let i = 0; i < 30; i++) await wrapper.get('[aria-label="放大图片"]').trigger('click')
    expect(wrapper.text()).toContain('800%')
    expect(wrapper.get('[aria-label="放大图片"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
  it('ends dragging on cancellation and ignores unrelated pointers', async () => {
    const { wrapper, stage, image } = await setup()
    const before = image.attributes('style')
    await stage.trigger('pointerdown', { pointerId: 1, button: 0, clientX: 100, clientY: 100 })
    await stage.trigger('pointermove', { pointerId: 2, buttons: 1, clientX: 200, clientY: 100 })
    expect(image.attributes('style')).toBe(before)
    await stage.trigger('pointercancel', { pointerId: 1 })
    await stage.trigger('pointermove', { pointerId: 1, buttons: 1, clientX: 200, clientY: 100 })
    expect(image.attributes('style')).toBe(before)
    wrapper.unmount()
  })
})
