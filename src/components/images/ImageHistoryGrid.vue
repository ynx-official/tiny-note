<script setup lang="ts">
import { AlertCircle, Brush, Check, Clipboard, Copy, Download, ImagePlus, Images, LoaderCircle, MoreHorizontal, Pencil, RefreshCw, Trash2 } from 'lucide-vue-next'
import type { ImageGenerationWorkspace } from '../../composables/useImageGenerationWorkspace'

const { workspace } = defineProps<{ workspace: ImageGenerationWorkspace }>()
const { activeTasks, router, loading, error, refresh, generations, generationClass, generationAssetUrl, openImagePreview, useAssetAsInput, openInsert, isSavingAsset, imageSaveTitle, saveImage, generationModeLabel, copyPrompt, regenerate, menuGenerationId, removeGeneration } = workspace
</script>

<template>
  <div v-if="activeTasks.length" class="image-running-strip"><LoaderCircle class="spinning" :size="16" /><span>正在生成 {{ activeTasks.length }} 个任务，切换页面也不会中断。</span><button type="button" @click="router.push('/tasks')">查看任务中心</button></div>
  <div v-if="loading" class="image-state"><LoaderCircle class="spinning" :size="20" />正在读取生图历史…</div>
  <div v-else-if="error" class="image-state is-error"><AlertCircle :size="20" />{{ error }}<button type="button" @click="refresh">重试</button></div>
  <section v-else class="image-history-section">
    <div class="image-history-heading"><div><h2>最近生成</h2><span>{{ generations.length ? `${generations.length} 条记录` : '还没有生成记录' }}</span></div><button type="button" class="image-refresh-button" title="刷新历史" @click="refresh"><RefreshCw :size="14" /></button></div>
    <div v-if="!generations.length" class="image-empty"><div class="image-empty-icon"><ImagePlus :size="26" /></div><strong>从一句描述开始</strong><span>生成结果会自动保存在本地附件中，也可以随时插入笔记。</span></div>
    <div v-else class="image-history-grid">
      <article v-for="generation in generations" :key="generation.id" :data-generation-id="generation.id" class="image-history-card" :class="generationClass(generation)">
        <div class="image-card-grid" :class="`is-${generation.size || 'square'}`"><div v-for="asset in generation.assets" :key="asset.id" class="image-result-tile"><button v-if="generationAssetUrl(asset)" type="button" class="image-preview-trigger" title="点击查看大图" @click="openImagePreview(asset, generation)"><img :src="generationAssetUrl(asset)" :alt="generation.prompt" /></button><span v-else><LoaderCircle class="spinning" :size="18" /></span><div v-if="generationAssetUrl(asset)" class="image-tile-actions"><button type="button" title="编辑图片" @click="useAssetAsInput(asset, generation, 'edit')"><Pencil :size="14" /></button><button type="button" title="插入笔记" @click="openInsert(asset, generation)"><Check :size="14" /></button><button type="button" class="image-save-button" :disabled="isSavingAsset(asset.id)" :aria-busy="isSavingAsset(asset.id)" :title="imageSaveTitle(asset.id)" @click="saveImage(asset, generation)"><LoaderCircle v-if="isSavingAsset(asset.id)" class="spinning" :size="14" /><Download v-else :size="14" /><span>{{ isSavingAsset(asset.id) ? '保存中' : '保存' }}</span></button></div></div></div>
        <div class="image-card-body"><div class="image-card-meta"><span>{{ generationModeLabel(generation.mode) }} · {{ generation.size === 'landscape' ? '横向' : generation.size === 'portrait' ? '纵向' : '1:1' }} · {{ generation.count }} 张</span><span>{{ new Date(generation.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</span></div><p>{{ generation.prompt }}</p><div class="image-card-footer"><button type="button" @click="openInsert(generation.assets[0], generation)" :disabled="!generation.assets?.length"><Check :size="14" />插入笔记</button><button type="button" title="复制描述" @click="copyPrompt(generation)"><Clipboard :size="14" /></button><button type="button" title="重新生成" @click="regenerate(generation)"><RefreshCw :size="14" /></button><button type="button" title="更多操作" @click="menuGenerationId = menuGenerationId === generation.id ? '' : generation.id"><MoreHorizontal :size="14" /></button></div></div>
        <div v-if="menuGenerationId === generation.id" class="image-card-menu"><button type="button" @click="useAssetAsInput(generation.assets[0], generation, 'reference')"><Images :size="13" />作为参考图</button><button type="button" @click="useAssetAsInput(generation.assets[0], generation, 'edit')"><Pencil :size="13" />编辑这张图</button><button type="button" @click="useAssetAsInput(generation.assets[0], generation, 'inpaint')"><Brush :size="13" />局部重绘</button><button type="button" @click="copyPrompt(generation); menuGenerationId = ''"><Copy :size="13" />复制描述</button><button type="button" class="is-danger" @click="removeGeneration(generation); menuGenerationId = ''"><Trash2 :size="13" />删除记录</button></div>
      </article>
    </div>
  </section>
</template>
