<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { Download, X } from 'lucide-vue-next'
import DOMPurify from 'dompurify'
import type { LibraryPreview } from '../../types/domain'
import { readLibraryContent } from '../../services/libraryContent'
import { saveExportBlob } from '../../services/exportLocation'
import { showExportSuccess } from '../../services/exportSuccess'
import { errorMessage } from '../../types/domain'

const props = defineProps<{ preview: LibraryPreview }>()
const emit = defineEmits<{ close: [] }>()
const PdfPreview = defineAsyncComponent(() => import('./PdfPreview.vue'))
const bytes = shallowRef<Uint8Array<ArrayBuffer> | null>(null)
const imageUrl = ref('')
const loading = ref(false)
const downloading = ref(false)
const error = ref('')
let request: AbortController | null = null
const html = computed(() => DOMPurify.sanitize(props.preview.content))
const labels: Record<string, string> = { text: '文本', html: '网页', pdf: 'PDF', image: '图片', binary: '文件' }
function release() { request?.abort(); if (imageUrl.value.startsWith('blob:')) URL.revokeObjectURL(imageUrl.value); imageUrl.value = '' }
watch(() => props.preview, async preview => {
  release()
  const current = new AbortController()
  request = current
  bytes.value = null
  error.value = ''
  loading.value = false
  if (preview.kind !== 'image' && preview.kind !== 'pdf') return
  if (!preview.downloadPath) { imageUrl.value = preview.content; return }
  loading.value = true
  try {
    const content = await readLibraryContent(preview.downloadPath, current.signal)
    if (current.signal.aborted) return
    bytes.value = content
    if (preview.kind === 'image') imageUrl.value = URL.createObjectURL(new Blob([content], { type: preview.mimeType }))
  } catch (cause) { if (!current.signal.aborted) error.value = errorMessage(cause, '文件读取失败') }
  finally { if (!current.signal.aborted) loading.value = false }
}, { immediate: true })
async function download() {
  const preview = props.preview
  const path = preview.downloadPath
  const current = request
  if (downloading.value || !path) return
  downloading.value = true
  error.value = ''
  try {
    const content = bytes.value || await readLibraryContent(path, current?.signal)
    if (preview !== props.preview || current?.signal.aborted) return
    const result = await saveExportBlob(new Blob([content], { type: preview.mimeType }), preview.title)
    if (!result.cancelled) showExportSuccess(result)
  } catch (cause) { if (preview === props.preview && !current?.signal.aborted) error.value = errorMessage(cause, '下载失败') }
  finally { downloading.value = false }
}
onBeforeUnmount(release)
</script>

<template>
  <aside class="preview-drawer" :aria-label="`${preview.title} 文件预览`">
    <div class="preview-head">
      <div><strong>{{ preview.title }}</strong><small>{{ labels[preview.kind] || '文件' }}</small></div>
      <button v-if="preview.downloadPath" type="button" class="icon-button" :disabled="downloading" title="下载原文件" aria-label="下载原文件" @click="download"><Download :size="17" /></button>
      <button type="button" class="icon-button" title="关闭预览" aria-label="关闭预览" @click="emit('close')"><X :size="17" /></button>
    </div>
    <p v-if="error" class="preview-status" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="preview-status" role="status">正在读取文件…</p>
    <PdfPreview v-else-if="preview.kind === 'pdf' && bytes" :bytes="bytes" :title="preview.title" />
    <div v-else-if="preview.kind === 'image'" class="preview-image"><img :src="imageUrl" :alt="preview.title" @error="error = '图片无法显示，请下载原文件查看。'" /></div>
    <iframe v-else-if="preview.kind === 'html'" sandbox="" :title="preview.title" :srcdoc="html" />
    <pre v-else-if="preview.kind === 'text'">{{ preview.content }}</pre>
    <p v-else class="preview-status">此格式暂不支持在线预览，可下载原文件查看。</p>
  </aside>
</template>

<style scoped>
.preview-drawer { position:absolute; inset:0 0 0 auto; width:48%; min-width:min(370px,100%); max-width:100%; border-left:1px solid var(--line); background:var(--surface); box-shadow:-12px 0 30px #00000016; z-index:3; display:flex; flex-direction:column; }
.preview-head { display:flex; align-items:center; gap:8px; padding:16px 20px; border-bottom:1px solid var(--line); font-size:13px; }
.preview-head > div { min-width:0; display:flex; flex-direction:column; gap:3px; }
.preview-head strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.preview-head small { color:var(--muted); font-size:10px; }
.preview-drawer pre { margin:0; padding:22px; white-space:pre-wrap; overflow:auto; font:12px/1.7 ui-monospace,monospace; }
.preview-drawer iframe { flex:1; border:0; background:white; }
.preview-status { padding:18px; font-size:13px; color:var(--muted); }
.preview-image { overflow:auto; padding:16px; }
.preview-image img { display:block; max-width:100%; height:auto; }
.preview-head > div { flex:1; }
</style>
