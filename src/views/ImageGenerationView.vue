<script lang="ts">
import { defineComponent } from 'vue'
import { ImagePlus, Settings } from 'lucide-vue-next'
import ImageComposePanel from '../components/images/ImageComposePanel.vue'
import ImageHistoryGrid from '../components/images/ImageHistoryGrid.vue'
import ImageDialogs from '../components/images/ImageDialogs.vue'
import { useImageGenerationWorkspace } from '../composables/useImageGenerationWorkspace'

export default defineComponent({
  name: 'ImageGenerationView',
  components: { ImagePlus, Settings, ImageComposePanel, ImageHistoryGrid, ImageDialogs },
  setup() {
    const workspace = useImageGenerationWorkspace()
    return { workspace, router: workspace.router }
  }
})
</script>

<template>
  <section class="image-page">
    <header class="image-page-header"><div><div class="image-kicker"><ImagePlus :size="14" />创作工具</div><h1>AI 图片创作</h1><p>从文字生成新画面，也可以参考、编辑或局部重绘已有图片。</p></div><button type="button" class="image-settings-link" @click="router.push('/settings')"><Settings :size="15" />图片模型设置</button></header>
    <ImageComposePanel :workspace="workspace" />
    <ImageHistoryGrid :workspace="workspace" />
    <ImageDialogs :workspace="workspace" />
  </section>
</template>
