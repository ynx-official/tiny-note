<script setup lang="ts">
import { AlertTriangle, Check, Copy, Expand, Maximize2, Minimize2, Minus, Plus, RefreshCw, Scan, Workflow, X } from 'lucide-vue-next'
import { useMermaidDiagram, type MermaidDiagramEmit, type MermaidDiagramProps } from '../composables/useMermaidDiagram'

const props = withDefaults(defineProps<MermaidDiagramProps>(), { source: '' })
const emit = defineEmits<MermaidDiagramEmit>()
const { svg, loading, error, zoom, fullscreenZoom, fullscreen, screenFullscreen, sourceCopied, inlineStage, fullscreenStage, fullscreenClose, fullscreenDialog, dragging, diagramKind, zoomStyle, empty, renderDiagram, zoomIn, zoomOut, fitWidth, openFullscreen, toggleScreenFullscreen, closeFullscreen, copySource, handleStageKeydown, handleWheel, startPan, movePan, finishPan } = useMermaidDiagram(props, emit)
</script>

<template>
  <figure class="mermaid-diagram" :class="{ 'is-loading': loading }" :aria-busy="loading" contenteditable="false">
    <figcaption class="mermaid-diagram-toolbar">
      <span class="mermaid-diagram-kind"><Workflow :size="14" />{{ diagramKind }}</span>
      <span v-if="loading" class="mermaid-render-status" aria-live="polite">渲染中…</span>
      <span v-else class="mermaid-zoom-value" aria-live="polite">{{ zoom }}%</span>
      <div class="mermaid-diagram-actions" role="toolbar" aria-label="图表视图">
        <button type="button" aria-label="缩小图表" title="缩小" :disabled="!svg || zoom <= 75" @click="zoomOut"><Minus :size="14" /></button>
        <button type="button" aria-label="放大图表" title="放大" :disabled="!svg || zoom >= 250" @click="zoomIn"><Plus :size="14" /></button>
        <button type="button" aria-label="全屏查看图表" title="全屏查看" :disabled="!svg || !!error" @click="openFullscreen"><Maximize2 :size="14" /></button>
        <slot name="actions"></slot>
      </div>
    </figcaption>

    <div v-if="!fullscreen" ref="inlineStage" class="mermaid-diagram-stage" role="group" tabindex="0" aria-label="图表画布，可用加号、减号和数字 0 调整缩放" aria-keyshortcuts="+ - 0" @keydown="handleStageKeydown" @wheel="handleWheel">
      <div v-if="svg" class="mermaid-diagram-svg" :style="zoomStyle" v-html="svg"></div>
      <div v-else-if="loading" class="mermaid-diagram-state" role="status"><RefreshCw :size="18" class="mermaid-spinner" />正在生成图表</div>
      <div v-else-if="empty" class="mermaid-diagram-state">输入 Mermaid 源码后即可预览</div>
      <div v-if="error" class="mermaid-diagram-error" role="alert">
        <AlertTriangle :size="17" />
        <span>{{ error }}</span>
        <button type="button" @click="renderDiagram"><RefreshCw :size="13" />重试</button>
        <button type="button" class="mermaid-show-source" @click="emit('show-source')">查看源码</button>
      </div>
    </div>
  </figure>

  <Teleport to="body">
    <div v-if="fullscreen" class="mermaid-fullscreen" :class="{ 'is-screen-fullscreen': screenFullscreen }" role="presentation" @mousedown.self="closeFullscreen">
      <section ref="fullscreenDialog" class="mermaid-fullscreen-dialog" :class="{ 'is-screen-fullscreen': screenFullscreen }" role="dialog" aria-modal="true" :aria-label="`${diagramKind}全屏预览`">
        <header>
          <span><Expand :size="15" />{{ diagramKind }}</span>
          <span class="mermaid-fullscreen-hint">按住左键拖动 · 滚轮指向缩放</span>
          <span class="mermaid-zoom-value" aria-live="polite">{{ fullscreenZoom }}%</span>
          <div role="toolbar" aria-label="全屏图表视图">
            <button type="button" aria-label="缩小图表" title="缩小" :disabled="fullscreenZoom <= 10" @click="zoomOut"><Minus :size="16" /></button>
            <button type="button" aria-label="适合宽度" title="适合宽度 (0)" @click="fitWidth"><Scan :size="16" /></button>
            <button type="button" aria-label="放大图表" title="放大" :disabled="fullscreenZoom >= 250" @click="zoomIn"><Plus :size="16" /></button>
            <button type="button" :aria-label="sourceCopied ? '图表源码已复制' : '复制图表源码'" :title="sourceCopied ? '已复制' : '复制源码'" @click="copySource"><Check v-if="sourceCopied" :size="16" /><Copy v-else :size="16" /></button>
            <button type="button" :aria-label="screenFullscreen ? '退出屏幕全屏' : '占满屏幕查看图表'" :title="screenFullscreen ? '退出屏幕全屏' : '屏幕全屏'" :aria-pressed="screenFullscreen" @click="toggleScreenFullscreen"><Minimize2 v-if="screenFullscreen" :size="16" /><Maximize2 v-else :size="16" /></button>
            <button ref="fullscreenClose" type="button" aria-label="关闭全屏图表" title="关闭 (Esc)" @click="closeFullscreen"><X :size="17" /></button>
          </div>
        </header>
        <div ref="fullscreenStage" class="mermaid-fullscreen-stage" :class="{ 'is-dragging': dragging }" role="group" tabindex="0" aria-label="全屏图表画布，按住鼠标左键拖动，滚轮围绕指针缩放，也可用加号、减号和数字 0 调整缩放" aria-keyshortcuts="+ - 0" @wheel="handleWheel" @pointerdown="startPan" @pointermove="movePan" @pointerup="finishPan" @pointercancel="finishPan" @lostpointercapture="finishPan">
          <div class="mermaid-diagram-svg mermaid-fullscreen-svg" :style="[zoomStyle, { transition: 'none' }]" v-html="svg"></div>
        </div>
        <span class="visually-hidden" role="status" aria-live="polite">{{ sourceCopied ? '图表源码已复制' : '' }}</span>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.mermaid-diagram {
  container-type:inline-size;
  margin:0;
  color:var(--text-primary);
  background:var(--bg-primary);
}

.mermaid-diagram-toolbar {
  min-height:38px;
  display:flex;
  align-items:center;
  gap:9px;
  padding:5px 8px 5px 12px;
  border-bottom:1px solid var(--line,var(--border-color));
  color:var(--text-secondary);
  background:var(--bg-secondary);
  font-size:11px;
}

.mermaid-diagram-kind { display:inline-flex; align-items:center; gap:6px; color:var(--text-primary); font-weight:600; }
.mermaid-diagram-kind svg { color:var(--accent-color); }
.mermaid-render-status,.mermaid-zoom-value { color:var(--text-tertiary); font-variant-numeric:tabular-nums; }
.mermaid-diagram-actions { display:flex; align-items:center; gap:2px; margin-left:auto; }
.mermaid-diagram-actions button,.mermaid-fullscreen-dialog header button {
  width:28px;
  height:28px;
  display:grid;
  place-items:center;
  padding:0;
  border-radius:6px;
  color:var(--text-secondary);
}
.mermaid-diagram-actions button:hover:not(:disabled),.mermaid-fullscreen-dialog header button:hover:not(:disabled) { color:var(--text-primary); background:var(--bg-hover); }
.mermaid-diagram-actions button:focus-visible,.mermaid-fullscreen-dialog header button:focus-visible,.mermaid-diagram-stage:focus-visible,.mermaid-fullscreen-stage:focus-visible { outline:2px solid var(--accent-color); outline-offset:-2px; }
.mermaid-diagram-actions button:disabled,.mermaid-fullscreen-dialog header button:disabled { cursor:not-allowed; opacity:.35; }

.mermaid-diagram-stage {
  position:relative;
  min-height:180px;
  overflow:auto;
  overscroll-behavior-x:contain;
  overscroll-behavior-y:auto;
  padding:22px;
  background:var(--bg-primary);
  scrollbar-width:thin;
  scrollbar-color:color-mix(in srgb,var(--text-tertiary) 38%,transparent) transparent;
}
.mermaid-diagram-svg { min-width:0; margin:0 auto; transition:width .16s ease; }
.mermaid-diagram-svg :deep(svg) { display:block; width:100%!important; max-width:none!important; height:auto!important; margin:0 auto; overflow:visible; }
.mermaid-diagram.is-loading .mermaid-diagram-svg { opacity:.48; }
.mermaid-diagram-state { min-height:136px; display:flex; align-items:center; justify-content:center; gap:8px; color:var(--text-tertiary); font-size:12px; }
.mermaid-spinner { animation:mermaid-spin .8s linear infinite; }
@keyframes mermaid-spin { to { transform:rotate(360deg); } }

.mermaid-diagram-error {
  position:relative;
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  gap:8px;
  margin-top:14px;
  padding:9px 10px;
  border:1px solid color-mix(in srgb,#e03131 36%,var(--line,var(--border-color)));
  border-radius:8px;
  color:#b42318;
  background:color-mix(in srgb,#e03131 7%,var(--bg-primary));
  font-size:11px;
}
.mermaid-diagram-error span { min-width:180px; flex:1; }
.mermaid-diagram-error button { display:inline-flex; align-items:center; gap:4px; min-height:26px; padding:0 7px; border-radius:6px; color:inherit; font-weight:600; }
.mermaid-diagram-error button:hover { background:color-mix(in srgb,#e03131 10%,transparent); }
[data-theme='dark'] .mermaid-diagram-error { color:#ffb4ab; }

.mermaid-fullscreen {
  position:fixed;
  z-index:3600;
  inset:0;
  display:grid;
  place-items:center;
  padding:24px;
  background:rgba(8,10,15,.72);
  backdrop-filter:blur(4px);
}
.mermaid-fullscreen-dialog {
  width:min(1400px,calc(100vw - 48px));
  height:min(920px,calc(100vh - 48px));
  display:flex;
  flex-direction:column;
  overflow:hidden;
  border:1px solid color-mix(in srgb,var(--line,var(--border-color)) 80%,transparent);
  border-radius:12px;
  color:var(--text-primary);
  background:var(--bg-primary);
  box-shadow:0 28px 80px rgba(0,0,0,.42);
}
.mermaid-fullscreen.is-screen-fullscreen { place-items:stretch; padding:0; background:var(--bg-primary); backdrop-filter:none; }
.mermaid-fullscreen-dialog.is-screen-fullscreen,
.mermaid-fullscreen-dialog:fullscreen {
  width:100vw;
  height:100vh;
  height:100dvh;
  max-width:none;
  max-height:none;
  border:0;
  border-radius:0;
  background:var(--bg-primary);
  box-shadow:none;
}
.mermaid-fullscreen-dialog > header { min-height:48px; display:flex; align-items:center; gap:10px; padding:8px 10px 8px 16px; border-bottom:1px solid var(--line,var(--border-color)); background:var(--bg-secondary); }
.mermaid-fullscreen-dialog > header > span:first-child { display:inline-flex; align-items:center; gap:7px; font-size:13px; font-weight:600; }
.mermaid-fullscreen-dialog > header > span:first-child svg { color:var(--accent-color); }
.mermaid-fullscreen-hint { color:var(--text-tertiary); font-size:10px; font-weight:400; }
.mermaid-fullscreen-dialog > header > div { display:flex; gap:3px; margin-left:auto; }
.mermaid-fullscreen-stage { min-height:0; flex:1; overflow:auto; padding:28px; overscroll-behavior:contain; cursor:grab; user-select:none; touch-action:none; }
.mermaid-fullscreen-stage.is-dragging { cursor:grabbing; }
.mermaid-fullscreen-svg { min-height:100%; display:flex; align-items:center; transition:none; }
.visually-hidden { position:absolute!important; width:1px!important; height:1px!important; padding:0!important; margin:-1px!important; overflow:hidden!important; clip:rect(0,0,0,0)!important; white-space:nowrap!important; border:0!important; }

@container (max-width:520px) {
  .mermaid-diagram-toolbar { padding-left:8px; gap:6px; }
  .mermaid-diagram-kind { font-size:0; gap:0; }
  .mermaid-diagram-kind svg { width:15px; height:15px; }
  .mermaid-diagram-stage { padding:14px; }
}

@media (prefers-reduced-motion:reduce) {
  .mermaid-diagram-svg { transition:none; }
  .mermaid-spinner { animation-duration:.01ms; }
}
</style>
