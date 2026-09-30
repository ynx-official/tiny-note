<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ modelValue: string; readonly?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; 'enter-body': [] }>()
const { t } = useI18n()
const draft = ref(props.modelValue)
const normalized = () => draft.value.trim() || t('untitled')
watch(() => props.modelValue, value => {
  // Preserve the user's trailing space and empty draft while the saved name is normalized.
  if (value !== normalized()) draft.value = value
})
watch(draft, () => {
  if (!props.readonly && normalized() !== props.modelValue) emit('update:modelValue', normalized())
}, { flush: 'sync' })
function enter(event: KeyboardEvent) {
  if (event.isComposing) return
  event.preventDefault()
  emit('enter-body')
}
</script>

<template>
  <input v-model="draft" class="note-title-input" aria-label="笔记名称" :placeholder="t('untitled')" :readonly="readonly" :title="readonly ? '外部文件名称' : '编辑笔记名称'" autocomplete="off" @keydown.enter="enter" />
</template>
