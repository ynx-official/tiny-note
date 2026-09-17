<script setup lang="ts">
import { AlertCircle, ImagePlus, Images, LoaderCircle, RefreshCw, Sparkles, Undo2, Upload, X } from 'lucide-vue-next'
import type { ImageGenerationWorkspace } from '../../composables/useImageGenerationWorkspace'

const { workspace } = defineProps<{ workspace: ImageGenerationWorkspace }>()
const {
  modeOptions, mode, setMode, inputFile, inputLoading, handleInputFiles, handleInputPaste, currentMode, requiredImageCountText,
  reusableHistoryAssets, openHistoryPicker, inputImages, openInputPicker, removeInputImage,
  maskCanvas, startMask, paintMask, finishMask, maskTouched, maskBrushSize, resetMask,
  previousPrompt, undoPromptOptimization, optimizing, prompt, optimizePrompt, promptPlaceholder,
  submit, selectedModelId, models, sizeOptions, size, count, submitting, configuredModels, router
} = workspace
</script>

<template>
  <section class="image-compose-card" @paste="handleInputPaste">
    <nav class="image-mode-tabs" aria-label="图片创作模式"><button v-for="option in modeOptions" :key="option.value" type="button" :class="{ active: mode === option.value }" @click="setMode(option.value)"><component :is="option.icon" :size="15" /><span><strong>{{ option.label }}</strong><small>{{ option.description }}</small></span></button></nav>
    <input ref="inputFile" class="image-input-file" type="file" accept="image/png,image/jpeg,image/webp" :multiple="mode === 'reference'" @change="handleInputFiles" />
    <section v-if="mode !== 'generate'" class="image-input-workspace" tabindex="0" aria-label="图片输入区域，可粘贴图片" :aria-busy="inputLoading">
      <div class="image-input-heading">
        <div><strong>{{ currentMode.label }}</strong><span>{{ requiredImageCountText }}</span></div>
        <div class="image-input-actions">
          <button v-if="inputImages.length" type="button" :disabled="inputLoading || (mode === 'reference' && inputImages.length >= 4)" @click="openInputPicker"><Upload :size="14" />{{ mode === 'reference' ? '添加本地图片' : '更换本地图片' }}</button>
          <button type="button" :disabled="inputLoading || !reusableHistoryAssets.length || (mode === 'reference' && inputImages.length >= 4)" @click="openHistoryPicker"><Images :size="14" />从最近生成选择</button>
        </div>
      </div>
      <p class="image-input-paste-hint" aria-live="polite">{{ inputLoading ? '正在读取图片，请稍候…' : '也可以在此区域或描述框按 Ctrl / ⌘ + V 粘贴图片' }}</p>
      <button v-if="!inputImages.length" type="button" class="image-upload-empty" :disabled="inputLoading" @click="openInputPicker">
        <LoaderCircle v-if="inputLoading" class="spinning" :size="22" /><Upload v-else :size="22" />
        <strong>{{ inputLoading ? '正在读取图片…' : '选择本地图片' }}</strong>
        <small>PNG、JPEG 或 WebP · 每张不超过 20 MB</small>
      </button>
      <div v-else-if="mode === 'reference'" class="image-reference-list"><figure v-for="image in inputImages" :key="image.id"><img :src="image.dataUrl" :alt="image.name" /><button type="button" aria-label="移除参考图" @click="removeInputImage(image.id)"><X :size="13" /></button><figcaption>{{ image.name }}</figcaption></figure><button v-if="inputImages.length < 4" type="button" class="image-reference-add" :disabled="inputLoading" @click="openInputPicker"><Upload :size="18" /><span>添加参考图</span></button></div>
      <div v-else-if="mode === 'edit'" class="image-source-preview"><img :src="inputImages[0].dataUrl" :alt="inputImages[0].name" /><div><strong>{{ inputImages[0].name }}</strong><span>{{ inputImages[0].width }} × {{ inputImages[0].height }}</span><button type="button" @click="removeInputImage(inputImages[0].id)"><X :size="13" />移除原图</button></div></div>
      <div v-else class="image-mask-section"><div class="image-mask-stage" :style="{ aspectRatio: `${inputImages[0].width} / ${inputImages[0].height}` }"><img :src="inputImages[0].dataUrl" :alt="inputImages[0].name" /><canvas ref="maskCanvas" aria-label="局部重绘蒙版画布" @pointerdown.prevent="startMask" @pointermove.prevent="paintMask" @pointerup="finishMask" @pointercancel="finishMask" @pointerleave="finishMask"></canvas><span v-if="!maskTouched">在图片上涂抹需要重绘的区域</span></div><aside class="image-mask-tools"><div><strong>重绘画笔</strong><span>透明区域会交给模型重新生成</span></div><label><span>画笔大小</span><input v-model.number="maskBrushSize" type="range" min="16" max="140" step="4" /></label><button type="button" @click="resetMask"><RefreshCw :size="13" />清除涂抹</button><button type="button" :disabled="inputLoading" @click="openInputPicker"><Upload :size="13" />更换原图</button></aside></div>
    </section>
    <div class="image-compose-label"><Sparkles :size="15" /><span>{{ mode === 'generate' ? '描述你想生成的画面' : '描述你想要的变化' }}</span><small>支持中文或英文，越具体越容易得到稳定结果</small><div class="image-prompt-tools"><button v-if="previousPrompt" type="button" @click="undoPromptOptimization"><Undo2 :size="13" />撤销优化</button><button type="button" :disabled="optimizing || !prompt.trim()" @click="optimizePrompt"><LoaderCircle v-if="optimizing" class="spinning" :size="13" /><Sparkles v-else :size="13" />{{ optimizing ? '优化中' : '智能优化' }}</button></div></div>
    <textarea v-model="prompt" class="image-prompt-input" maxlength="4000" rows="4" :placeholder="promptPlaceholder" @keydown.meta.enter.prevent="submit" @keydown.ctrl.enter.prevent="submit"></textarea>
    <div class="image-compose-toolbar"><label class="image-control image-model-control"><span>图片模型</span><select v-model="selectedModelId"><option value="" disabled>选择模型</option><option v-for="model in models" :key="model.id" :value="model.id">{{ model.name }}{{ model.apiKeyConfigured ? '' : '（未配置）' }}</option></select></label><div class="image-control"><span>比例</span><div class="image-segmented"><button v-for="option in sizeOptions" :key="option.value" type="button" :class="{ active: size === option.value }" :title="option.description" @click="size = option.value">{{ option.label }}</button></div></div><label class="image-control image-count-control"><span>张数</span><select v-model.number="count"><option v-for="value in 4" :key="value" :value="value">{{ value }} 张</option></select></label><button type="button" class="image-submit-button" :disabled="submitting || optimizing || inputLoading || !prompt.trim()" @click="submit"><LoaderCircle v-if="submitting" class="spinning" :size="16" /><ImagePlus v-else :size="16" />{{ submitting ? '已提交' : mode === 'generate' ? '开始生成' : '开始处理' }}<small>⌘↵</small></button></div>
    <div v-if="!models.length" class="image-config-hint"><AlertCircle :size="15" /><span>还没有可用于生图的模型。请先在已有模型配置中获取模型列表，并勾选“生图”。</span><button type="button" @click="router.push('/settings')">去设置</button></div>
    <div v-else-if="!configuredModels.length" class="image-config-hint"><AlertCircle :size="15" /><span>已勾选的生图模型还没有配置 API Key。</span><button type="button" @click="router.push('/settings')">去设置</button></div>
  </section>
</template>
