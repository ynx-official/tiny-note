<script setup lang="ts">
import { ImagePlus, Settings } from 'lucide-vue-next'
import ImageComposePanel from '../components/images/ImageComposePanel.vue'
import ImageHistoryGrid from '../components/images/ImageHistoryGrid.vue'
import ImageDialogs from '../components/images/ImageDialogs.vue'
import { useImageGenerationWorkspace } from '../composables/useImageGenerationWorkspace'

const workspace = useImageGenerationWorkspace()
const router = workspace.router
const { appStore, images, notes, tasks, models, generations, loading, error, defaultModel, prompt, mode, size, count, selectedModelId, submitting, loadingAssets, pickerOpen, pickerSearch, pickerAsset, selectedNoteId, menuGenerationId, highlightedGenerationId, inputImages, inputFile, maskCanvas, maskTouched, maskBrushSize, drawingMask, optimizing, previousPrompt, historyPickerOpen, historyPickerLoading, previewItem, savingAssetIds, modeOptions, sizeOptions, configuredModels, visibleNotes, activeTasks, selectedModel, currentMode, promptPlaceholder, requiredImageCountText, reusableHistoryAssets, setDefaultModel, generationAssetUrl, openImagePreview, closeImagePreview, loadBrowserImage, readFile, normalizeToPng, setMode, openInputPicker, handleInputFiles, removeInputImage, openHistoryPicker, selectHistoryAsset, initializeMask, maskPoint, paintMask, startMask, finishMask, resetMask, compactOptimizedPrompt, previewOptimizedPrompt, imageOptimizationInstruction, optimizePrompt, undoPromptOptimization, ensureAssets, refresh, submit, useAssetAsInput, regenerate, copyPrompt, imageFileName, dataUriToBlob, isSavingAsset, imageSaveTitle, saveImage, escapeHtml, markdownLabel, openInsert, insertIntoNote, removeGeneration, handleTaskUpdate, handleImagePageKeydown, generationClass, generationModeLabel } = workspace
</script>

<template>
  <section class="image-page">
    <header class="image-page-header"><div><div class="image-kicker"><ImagePlus :size="14" />创作工具</div><h1>AI 图片创作</h1><p>从文字生成新画面，也可以参考、编辑或局部重绘已有图片。</p></div><button type="button" class="image-settings-link" @click="router.push('/settings')"><Settings :size="15" />图片模型设置</button></header>
    <ImageComposePanel :workspace="workspace" />
    <ImageHistoryGrid :workspace="workspace" />
    <ImageDialogs :workspace="workspace" />
  </section>
</template>
