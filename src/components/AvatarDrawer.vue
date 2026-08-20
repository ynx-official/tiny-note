<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { BarChart3, Brain } from 'lucide-vue-next'
import MemoryManagement from './MemoryManagement.vue'
import UsageStatistics from './UsageStatistics.vue'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()
const activeSection = ref('memory')
const visible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value)
})
const navItems = computed(() => [
  { key: 'memory', label: t('memoryManagement'), icon: Brain },
  { key: 'usage', label: t('usageStatistics'), icon: BarChart3 }
])
const currentComponent = computed(() => activeSection.value === 'usage' ? UsageStatistics : MemoryManagement)

function close() {
  visible.value = false
}

function handleEscape(event) {
  if (event.key === 'Escape' && visible.value) close()
}

watch(visible, value => {
  if (value) activeSection.value = 'memory'
})
onMounted(() => document.addEventListener('keydown', handleEscape))
onUnmounted(() => document.removeEventListener('keydown', handleEscape))
</script>

<template>
  <Teleport to="body">
    <Transition name="assistant-drawer-fade">
      <div v-if="visible" class="assistant-drawer-overlay" @click.self="close">
        <Transition name="assistant-drawer-pop" appear>
          <section class="assistant-drawer" role="dialog" aria-modal="true" :aria-label="t('assistantCenter')">
            <aside class="assistant-drawer-nav">
              <button v-for="item in navItems" :key="item.key" type="button" class="assistant-drawer-nav-item" :class="{ active: activeSection === item.key }" @click="activeSection = item.key"><component :is="item.icon" :size="18" :stroke-width="1.7" /><span>{{ item.label }}</span></button>
            </aside>
            <main class="assistant-drawer-content"><component :is="currentComponent" @close="close" /></main>
          </section>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
