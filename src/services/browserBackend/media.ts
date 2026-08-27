import type { BrowserArgs, BrowserState } from './types'
import type { BrowserHandlerResult } from './planner'

const demoImageDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

export function handleMediaCommand(command: string, args: BrowserArgs, state: BrowserState, now: string): BrowserHandlerResult | null {
  if (command === 'image_model_list') return { result: state.models.filter(model => Boolean(model.imageEnabled)) }
  if (command === 'image_generate') {
    const request = args.request
    if (!String(request.prompt || '').trim()) throw new Error('图片描述不能为空')
    const mode = request.mode || 'generate'
    if (!['generate', 'reference', 'edit', 'inpaint'].includes(mode)) throw new Error('图片生成模式无效')
    if (mode === 'reference' && (!request.inputImages?.length || request.inputImages.length > 4)) throw new Error('参考图模式需要上传 1 至 4 张图片')
    if (['edit', 'inpaint'].includes(mode) && request.inputImages?.length !== 1) throw new Error('图片编辑需要上传 1 张原图')
    if (mode === 'inpaint' && !request.maskImage) throw new Error('局部重绘需要绘制蒙版')
    const generationId = crypto.randomUUID()
    const previewUri = mode === 'generate' ? demoImageDataUri : request.inputImages?.[0]?.dataUrl || demoImageDataUri
    const assets = Array.from({ length: Math.min(4, Math.max(1, Number(request.count) || 1)) }, () => ({ id: crypto.randomUUID(), generationId, relativePath: `generated-images/demo-${crypto.randomUUID()}.png`, mimeType: 'image/png', byteSize: 68, width: 1, height: 1, createdAt: now, dataUri: previewUri }))
    const generationAssets = assets.map(asset => ({ id: asset.id, generationId: asset.generationId, relativePath: asset.relativePath, mimeType: asset.mimeType, byteSize: asset.byteSize, width: asset.width, height: asset.height, createdAt: asset.createdAt }))
    state.imageGenerations.unshift({ id: generationId, taskId: request.requestId, prompt: String(request.prompt).trim(), imageModelProfileId: request.imageModelProfileId || '', size: request.size || 'square', count: assets.length, mode, status: 'succeeded', errorCode: null, errorMessage: null, createdAt: now, completedAt: now, assets: generationAssets })
    state.imageAssets.push(...assets)
    return { result: { generationId, assets, usage: null } }
  }
  if (command === 'image_cancel') return { result: null }
  if (command === 'image_generation_list') return { result: state.imageGenerations.slice(0, Math.min(500, args.limit || 100)).map(generation => ({ ...generation, assets: generation.assets || [] })) }
  if (command === 'image_asset_read') { const asset = state.imageAssets.find(value => value.id === args.assetId); return { result: asset ? { ...asset, dataUri: asset.dataUri || demoImageDataUri } : null } }
  if (command === 'image_generation_delete') { state.imageGenerations = state.imageGenerations.filter(value => value.id !== args.generationId); state.imageAssets = state.imageAssets.filter(value => value.generationId !== args.generationId); return { result: null } }
  return null
}
