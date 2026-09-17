import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import ImageGenerationView from './ImageGenerationView.vue'

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), toast: vi.fn() }))
vi.mock('../services/tauri', () => ({ invoke: mocks.invoke }))
vi.mock('../services/appFeedback', () => ({ showToast: mocks.toast, requestConfirmation: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push: vi.fn() }) }))

const png = () => new File(['image'], 'local.png', { type: 'image/png' })
const modes = ['参考图生图', '图片编辑', '局部重绘']
let wrapper: VueWrapper

async function openMode(label: string) {
  await wrapper.findAll('.image-mode-tabs button').find(button => button.text().includes(label))!.trigger('click')
}

function paste(files: File[], text = '') {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: {
    files, items: files.map(file => ({ kind: 'file', type: file.type, getAsFile: () => file })),
    getData: () => text
  } })
  wrapper.get('.image-prompt-input').element.dispatchEvent(event)
  return event
}

async function selectFiles(files: File[]) {
  const input = wrapper.get<HTMLInputElement>('.image-input-file')
  Object.defineProperty(input.element, 'files', { configurable: true, value: files })
  await input.trigger('change')
}

describe('image input sources', () => {
  beforeEach(() => {
    mocks.invoke.mockReset().mockImplementation(async command => {
      if (command === 'image_generation_list' || command === 'image_model_list') return []
      return null
    })
    mocks.toast.mockReset()
    vi.stubGlobal('Image', class {
      naturalWidth = 100; naturalHeight = 100; onload: (() => void) | null = null
      set src(_value: string) { queueMicrotask(() => this.onload?.()) }
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn() } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,aW1hZ2U=')
    wrapper = mount(ImageGenerationView, { global: { plugins: [createPinia()] } })
  })

  afterEach(() => { wrapper.unmount(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it.each(modes)('%s opens local selection from the primary area', async label => {
    await openMode(label)
    const click = vi.spyOn(wrapper.get<HTMLInputElement>('.image-input-file').element, 'click')
    expect(wrapper.get('.image-upload-empty').text()).toContain('选择本地图片')
    expect(wrapper.get('.image-input-workspace').text()).toContain('Ctrl / ⌘ + V')
    await wrapper.get('.image-upload-empty').trigger('click')
    expect(click).toHaveBeenCalledOnce()
  })

  it.each(modes)('%s accepts a local image', async label => {
    await openMode(label)
    await selectFiles([png()])
    await vi.waitFor(() => expect(wrapper.find('.image-input-workspace img').exists()).toBe(true))
    expect(wrapper.get('.image-input-workspace img').attributes('alt')).toBe('local.png')
    if (label === '局部重绘') expect(wrapper.find('canvas').exists()).toBe(true)
  })

  it.each(modes)('%s accepts a pasted image', async label => {
    await openMode(label)
    const event = paste([png()])
    expect(event.defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(wrapper.find('.image-input-workspace img').exists()).toBe(true))
  })

  it('leaves text paste and text-to-image mode untouched', async () => {
    expect(paste([png()]).defaultPrevented).toBe(false)
    await openMode('图片编辑')
    expect(paste([], '修改背景').defaultPrevented).toBe(false)
  })

  it('shares validation and the four-image limit between local and pasted images', async () => {
    await openMode('参考图生图')
    paste([new File(['bad'], 'bad.gif', { type: 'image/gif' })])
    await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('仅支持 PNG、JPEG 或 WebP 图片', { tone: 'error' }))
    await selectFiles([png(), png(), png()])
    await vi.waitFor(() => expect(wrapper.findAll('.image-reference-list figure')).toHaveLength(3))
    paste([png(), png()])
    await vi.waitFor(() => expect(wrapper.findAll('.image-reference-list figure')).toHaveLength(4))
  })

  it('replaces the editing image without requiring removal first', async () => {
    await openMode('图片编辑')
    await selectFiles([png()])
    await vi.waitFor(() => expect(wrapper.find('.image-source-preview').exists()).toBe(true))
    expect(wrapper.get('.image-input-actions').text()).toContain('更换本地图片')
    paste([new File(['replacement'], 'replacement.png', { type: 'image/png' })])
    await vi.waitFor(() => expect(wrapper.get('.image-source-preview img').attributes('alt')).toBe('replacement.png'))
  })
})
