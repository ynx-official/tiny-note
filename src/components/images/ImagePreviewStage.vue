<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Maximize, ZoomIn, ZoomOut } from 'lucide-vue-next'

defineProps<{ src: string; alt: string }>()
const stage = ref<HTMLElement | null>(null)
const width = ref(0), height = ref(0), zoom = ref(1), x = ref(0), y = ref(0)
const dragging = ref(false)
let fitting = true
let observer: ResizeObserver | undefined
let pan: { id: number; clientX: number; clientY: number; x: number; y: number } | null = null
const ready = computed(() => width.value > 0 && height.value > 0)
const imageStyle = computed(() => ({ width: `${width.value}px`, height: `${height.value}px`, transform: `translate(-50%, -50%) translate(${x.value}px, ${y.value}px) scale(${zoom.value})`, visibility: ready.value ? 'visible' as const : 'hidden' as const }))

function fit() {
  const rect = stage.value?.getBoundingClientRect()
  if (!rect || !ready.value) return
  zoom.value = Math.min(1, Math.max(1, rect.width - 32) / width.value, Math.max(1, rect.height - 32) / height.value)
  x.value = 0; y.value = 0; fitting = true
}
function loaded(event: Event) {
  const image = event.target as HTMLImageElement
  width.value = image.naturalWidth; height.value = image.naturalHeight
  fit()
}
function constrainPan() {
  const rect = stage.value?.getBoundingClientRect()
  if (!rect) return
  // Leave part of the image in reach even after dragging far beyond the edge.
  const limitX = Math.max(0, (rect.width + width.value * zoom.value) / 2 - 48)
  const limitY = Math.max(0, (rect.height + height.value * zoom.value) / 2 - 48)
  x.value = Math.max(-limitX, Math.min(limitX, x.value))
  y.value = Math.max(-limitY, Math.min(limitY, y.value))
}
function setZoom(value: number, anchorX = 0, anchorY = 0) {
  if (!ready.value) return
  const next = Math.max(.01, Math.min(8, value))
  const ratio = next / zoom.value
  x.value = anchorX - (anchorX - x.value) * ratio
  y.value = anchorY - (anchorY - y.value) * ratio
  zoom.value = next; fitting = false
  constrainPan()
}
function wheel(event: WheelEvent) {
  const rect = stage.value?.getBoundingClientRect()
  if (!rect || !event.deltaY) return
  setZoom(zoom.value * (event.deltaY < 0 ? 1.2 : 1 / 1.2), event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2)
}
function startPan(event: PointerEvent) {
  if (event.button !== 0 || event.isPrimary === false || !ready.value || pan) return
  event.preventDefault()
  stage.value?.focus({ preventScroll: true })
  pan = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: x.value, y: y.value }
  dragging.value = true; fitting = false
  stage.value?.setPointerCapture?.(event.pointerId)
}
function movePan(event: PointerEvent) {
  if (!pan || pan.id !== event.pointerId) return
  if (event.pointerType === 'mouse' && !(event.buttons & 1)) { endPan(event); return }
  x.value = pan.x + event.clientX - pan.clientX
  y.value = pan.y + event.clientY - pan.clientY
  constrainPan()
}
function endPan(event: PointerEvent) {
  if (!pan || pan.id !== event.pointerId) return
  pan = null; dragging.value = false
  if (stage.value?.hasPointerCapture?.(event.pointerId)) stage.value.releasePointerCapture(event.pointerId)
}
function keydown(event: KeyboardEvent) {
  if (event.key === '+' || event.key === '=') setZoom(zoom.value * 1.2)
  else if (event.key === '-') setZoom(zoom.value / 1.2)
  else if (event.key === '0') fit()
  else return
  event.preventDefault()
}
onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && stage.value) {
    observer = new ResizeObserver(() => { if (fitting) fit(); else constrainPan() })
    observer.observe(stage.value)
  }
})
onUnmounted(() => observer?.disconnect())
</script>

<template>
  <div class="image-preview-tools" role="toolbar" aria-label="图片缩放">
    <button type="button" aria-label="缩小图片" title="缩小 (-)" :disabled="!ready || zoom <= .01" @click="setZoom(zoom / 1.2)"><ZoomOut :size="16" /></button>
    <output aria-label="缩放比例">{{ Math.round(zoom * 100) }}%</output>
    <button type="button" aria-label="放大图片" title="放大 (+)" :disabled="!ready || zoom >= 8" @click="setZoom(zoom * 1.2)"><ZoomIn :size="16" /></button>
    <button type="button" aria-label="原始尺寸" :disabled="!ready" @click="setZoom(1)">1:1</button>
    <button type="button" aria-label="适合窗口" title="适合窗口 (0)" :disabled="!ready" @click="fit"><Maximize :size="15" />适合窗口</button>
    <span>滚轮缩放 · 按住左键拖动</span>
  </div>
  <div ref="stage" class="image-preview-stage" :class="{ 'is-dragging': dragging }" tabindex="0" aria-label="图片查看区域，滚轮缩放，拖动平移" @wheel.prevent="wheel" @pointerdown="startPan" @pointermove="movePan" @pointerup="endPan" @pointercancel="endPan" @lostpointercapture="endPan" @keydown="keydown" @dblclick="fit">
    <img :src="src" :alt="alt" :style="imageStyle" draggable="false" @load="loaded" @dragstart.prevent />
  </div>
</template>
