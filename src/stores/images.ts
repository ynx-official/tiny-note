import { defineStore } from 'pinia'
import { invoke } from '../services/tauri'
import { useTasksStore } from './tasks'
import { errorMessage, type ImageAsset, type ImageGeneration, type ModelProfile } from '../types/domain'

interface ImageGenerationRequest {
  prompt: string
  modelId: string
  size: string
  count: number
  mode?: string
  inputImages?: Array<{ name: string; mimeType: string; dataUrl: string }>
  maskImage?: { name: string; mimeType: string; dataUrl: string } | null
}

export const useImagesStore = defineStore('images', {
  state: () => ({
    models: [] as ModelProfile[],
    generations: [] as ImageGeneration[],
    loading: false,
    error: '',
    assetCache: {} as Record<string, ImageAsset>
  }),
  getters: {
    defaultModel: state => state.models.find(model => model.isImageDefault) || state.models[0] || null,
    readyModels: state => state.models.filter(model => model.apiKeyConfigured && model.imageEnabled)
  },
  actions: {
    async load() {
      this.loading = true
      try {
        const [models, generations] = await Promise.all([
          invoke('image_model_list'),
          invoke('image_generation_list', { limit: 100 })
        ])
        this.models = Array.isArray(models) ? models : []
        this.generations = Array.isArray(generations) ? generations : []
        this.error = ''
      } catch (error) {
        this.error = errorMessage(error, '生图数据读取失败')
      } finally {
        this.loading = false
      }
      return this.generations
    },
    async refreshHistory() {
      this.generations = (await invoke('image_generation_list', { limit: 100 })) || []
      return this.generations
    },
    async readAsset(assetId: string) {
      if (!assetId) return null
      if (this.assetCache[assetId]) return this.assetCache[assetId]
      const asset = await invoke('image_asset_read', { assetId })
      if (asset) this.assetCache = { ...this.assetCache, [assetId]: asset }
      return asset
    },
    async enqueue({ prompt, modelId, size, count, mode = 'generate', inputImages = [], maskImage = null }: ImageGenerationRequest) {
      const tasks = useTasksStore()
      return tasks.createImageGeneration({ requestKey: crypto.randomUUID(), imageModelProfileId: modelId, prompt, size, count, mode, inputImages, maskImage })
    },
    async deleteGeneration(generationId: string) {
      await invoke('image_generation_delete', { generationId })
      const generation = this.generations.find(item => item.id === generationId)
      const nextCache = { ...this.assetCache }
      generation?.assets?.forEach(asset => { delete nextCache[asset.id] })
      this.assetCache = nextCache
      this.generations = this.generations.filter(item => item.id !== generationId)
    }
  }
})
