<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

defineProps<{ label: string }>()
const emit = defineEmits<{ open: [] }>()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
function dismiss(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) open.value = false
}
function close() {
  open.value = false
  nextTick(() => trigger.value?.focus())
}
function toggle() {
  if (!open.value) emit('open')
  open.value = !open.value
}
onMounted(() => document.addEventListener('pointerdown', dismiss))
onBeforeUnmount(() => document.removeEventListener('pointerdown', dismiss))
</script>

<template>
  <span ref="root" class="toolbar-menu-anchor format-popover" @keydown.esc.stop.prevent="close">
    <button ref="trigger" type="button" :title="label" :aria-label="label" :aria-expanded="open" @click="toggle"><slot name="trigger" /></button>
    <div v-if="open" class="format-popover-panel" role="group" :aria-label="`${label}选项`"><slot :close="close" /></div>
  </span>
</template>
