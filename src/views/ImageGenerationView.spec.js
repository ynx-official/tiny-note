import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), push: vi.fn() }))
vi.mock('../services/tauri', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/core', () => ({ Channel: class Channel { onmessage = null } }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push: mocks.push }) }))

import ImageGenerationView from './ImageGenerationView.vue'

const generation = {
  id: 'generation-1',
  taskId: 'task-1',
  prompt: '雨后的城市书店，暖黄色灯光',
  mode: 'generate',
  imageModelProfileId: 'image-model',
  size: 'landscape',
  count: 1,
  status: 'succeeded',
  createdAt: '2026-08-24T08:00:00Z',
  completedAt: '2026-08-24T08:01:00Z',
  assets: [{ id: 'asset-1', generationId: 'generation-1', mimeType: 'image/png', byteSize: 68, width: 1024, height: 1024, createdAt: '2026-08-24T08:01:00Z' }]
}

describe('ImageGenerationView history reuse', () => {
  beforeEach(() => {
    const pinia = createPinia()
    setActivePinia(pinia)
    mocks.invoke.mockReset()
    mocks.push.mockReset()
    mocks.invoke.mockImplementation(async command => {
      if (command === 'image_model_list') return [{ id: 'image-model', name: '图片模型', imageEnabled: true, apiKeyConfigured: true, isImageDefault: true }]
      if (command === 'image_generation_list') return [generation]
      if (command === 'image_asset_read') return { ...generation.assets[0], dataUri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' }
      return null
    })
  })

  it('lets every image editing mode select a previous generation as its input', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mount(ImageGenerationView, { global: { plugins: [pinia] } })
    await vi.waitFor(() => expect(wrapper.text()).toContain(generation.prompt))
    await vi.waitFor(() => expect(wrapper.find('.image-preview-trigger').exists()).toBe(true))

    await wrapper.get('.image-preview-trigger').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.image-preview-modal').exists()).toBe(true))
    expect(wrapper.get('.image-preview-stage img').attributes('src')).toContain('data:image/png;base64,')
    await wrapper.get('[aria-label="关闭图片预览"]').trigger('click')
    expect(wrapper.find('.image-preview-modal').exists()).toBe(false)

    for (const label of ['参考图生图', '图片编辑', '局部重绘']) {
      const modeButton = wrapper.findAll('.image-mode-tabs button').find(button => button.text().includes(label))
      await modeButton.trigger('click')
      expect(wrapper.text()).toContain('从最近生成选择')
    }

    const editButton = wrapper.findAll('.image-mode-tabs button').find(button => button.text().includes('图片编辑'))
    await editButton.trigger('click')
    const historyButton = wrapper.findAll('.image-input-actions button').find(button => button.text().includes('从最近生成选择'))
    await historyButton.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.image-history-picker-grid').exists()).toBe(true))

    await wrapper.get('.image-history-picker-grid > button').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.image-source-preview').exists()).toBe(true))
    expect(wrapper.get('.image-source-preview').text()).toContain('生成结果-asset-')
    expect(wrapper.find('.image-history-picker-modal').exists()).toBe(false)
  })
})
