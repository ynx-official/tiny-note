<script lang="ts">
import { defineComponent, type PropType } from 'vue'
import { ChevronRight, Search as SearchIcon } from 'lucide-vue-next'
import type { SettingsWorkspace } from '../../composables/useSettingsWorkspace'

export default defineComponent({
  name: 'SettingsNavigation',
  components: { ChevronRight, SearchIcon },
  props: { workspace: { type: Object as PropType<SettingsWorkspace>, required: true } },
  setup: props => props.workspace
})
</script>

<template>
      <aside class="settings-nav" aria-label="设置分类">
        <label class="settings-search"><SearchIcon :size="14" /><input v-model="searchQuery" :placeholder="t('settingsSearch')" /></label>
        <nav class="settings-nav-list">
          <button v-for="section in filteredSections" :key="section.id" type="button" class="settings-nav-item" :class="{ active: section.id === activeSectionId }" @click="selectSection(section.id)">
            <component :is="section.icon" :size="14" /><span>{{ section.label }}</span><ChevronRight :size="13" />
          </button>
          <div v-if="!filteredSections.length" class="settings-nav-empty">{{ locale === 'zh-CN' ? '没有匹配的设置' : 'No matching settings' }}</div>
        </nav>
      </aside>
</template>
