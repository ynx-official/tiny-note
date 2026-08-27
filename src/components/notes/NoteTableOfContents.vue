<script setup lang="ts">
import type { NotesWorkspace } from '../../composables/useNotesWorkspace'

const props = defineProps<{ workspace: NotesWorkspace }>()
const workspace = props.workspace
const { tocVisible, showDeleted, sidebarWidth, closeToc, tocHeadings, scrollToHeading } = workspace
</script>

<template>
    <aside v-if="tocVisible && !showDeleted" class="toc-overlay" :style="{ width: sidebarWidth + 'px' }" aria-label="目录">
      <div class="toc-header"><strong>目录</strong><button class="toc-close" title="关闭目录" aria-label="关闭目录" @click="closeToc">×</button></div>
      <div class="toc-list">
        <button v-for="heading in tocHeadings" :key="`${heading.index}-${heading.text}`" class="toc-item" :class="`toc-level-${heading.level}`" @click="scrollToHeading(heading.index)">
          <span class="toc-item-prefix">H{{ heading.level }}</span><span class="toc-item-text">{{ heading.text }}</span>
        </button>
        <div v-if="!tocHeadings.length" class="toc-empty"><div class="toc-empty-icon">☷</div><p>暂无标题</p><small>使用标题样式后会显示在这里</small></div>
      </div>
    </aside>
</template>
