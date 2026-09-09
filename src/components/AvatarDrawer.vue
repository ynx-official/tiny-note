<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { BarChart3, Brain, Cable, Sparkles, UserRound } from 'lucide-vue-next'
import { useAuthStore } from '../stores/auth'
import AccountPanel from './AccountPanel.vue'
import McpManagement from './McpManagement.vue'
import MemoryManagement from './MemoryManagement.vue'
import SkillsManagement from './SkillsManagement.vue'
import UsageStatistics from './UsageStatistics.vue'
import '../styles/assistant-drawer.css'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue', 'signed-in', 'signed-out'])
const { t } = useI18n()
const auth = useAuthStore()
const activeSection = ref('account')
const visible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value)
})
const navItems = computed(() => [
  { key: 'account', label: auth.authenticated ? '账号' : '登录', icon: UserRound },
  ...(auth.authenticated ? [
    { key: 'memory', label: t('memoryManagement'), icon: Brain },
    { key: 'skills', label: 'Agent 技能', icon: Sparkles },
    { key: 'mcp', label: 'MCP 服务', icon: Cable },
    { key: 'usage', label: t('usageStatistics'), icon: BarChart3 }
  ] : [])
])
const currentComponent = computed(() => ({ account: AccountPanel, memory: MemoryManagement, skills: SkillsManagement, mcp: McpManagement, usage: UsageStatistics })[activeSection.value] || AccountPanel)

function close() {
  visible.value = false
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && visible.value) close()
}

watch(visible, value => {
  if (value) activeSection.value = 'account'
})
watch(() => auth.authenticated, value => { if (!value) activeSection.value = 'account' })
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
              <button v-for="item in navItems" :key="item.key" type="button" class="assistant-drawer-nav-item" :class="{ active: activeSection === item.key }" :data-section="item.key" @click="activeSection = item.key"><component :is="item.icon" :size="18" :stroke-width="1.7" /><span>{{ item.label }}</span></button>
            </aside>
            <main class="assistant-drawer-content"><component :is="currentComponent" @close="close" @signed-in="emit('signed-in')" @signed-out="emit('signed-out')" /></main>
          </section>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
