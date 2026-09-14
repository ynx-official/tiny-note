<script setup lang="ts">
import { AlertTriangle, FolderTree, X } from 'lucide-vue-next'
import type { MarkdownNotebookScan } from '../../types/domain'
import { notebookCountForScan } from '../../services/markdownNotebookImport'

defineProps<{ scan: MarkdownNotebookScan; busy: boolean }>()
defineEmits<{ cancel: []; confirm: [] }>()
</script>

<template>
  <Teleport to="body">
    <div class="app-feedback-overlay markdown-import-overlay">
      <section class="app-feedback-dialog markdown-import-dialog" role="dialog" aria-modal="true" aria-labelledby="markdown-import-title" @keydown.esc.prevent="!busy && $emit('cancel')">
        <header class="markdown-import-header">
          <div><FolderTree :size="19" /><strong id="markdown-import-title">导入 Markdown 笔记本</strong></div>
          <button type="button" aria-label="关闭" :disabled="busy" @click="$emit('cancel')"><X :size="18" /></button>
        </header>
        <div class="markdown-import-body">
          <p class="markdown-import-root">{{ scan.rootName }}</p>
          <dl class="markdown-import-stats">
            <div><dt>笔记本</dt><dd>{{ notebookCountForScan(scan) }}</dd></div>
            <div><dt>Markdown 笔记</dt><dd>{{ scan.files.length }}</dd></div>
            <div><dt>忽略目录</dt><dd>{{ scan.ignoredDirectoryCount }}</dd></div>
          </dl>
          <p class="markdown-import-hint">只导入 Markdown；不包含 Markdown 的附件目录不会创建笔记本。</p>
          <div v-if="scan.errors.length" class="markdown-import-errors" role="alert">
            <strong><AlertTriangle :size="15" />有 {{ scan.errors.length }} 项需要处理</strong>
            <ul><li v-for="(error, index) in scan.errors" :key="error.relativePath + index"><span>{{ error.relativePath || '所选目录' }}</span>{{ error.message }}</li></ul>
          </div>
        </div>
        <footer class="markdown-import-footer">
          <button type="button" class="app-feedback-secondary" :disabled="busy" @click="$emit('cancel')">取消</button>
          <button type="button" class="app-feedback-primary" :disabled="busy || Boolean(scan.errors.length)" @click="$emit('confirm')">{{ busy ? '正在导入…' : '开始导入' }}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
