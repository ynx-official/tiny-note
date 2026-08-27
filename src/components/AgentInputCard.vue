<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

interface InputOption { id: string; label: string; description?: string; recommended?: boolean }
interface InputRequest { title: string; question: string; options?: InputOption[]; allowOther?: boolean }
interface InputResponse { outcome?: string; selectedLabel?: string; selectedOptionId?: string | null; otherText?: string | null }
const props = withDefaults(defineProps<{ request: InputRequest; interactive?: boolean; status?: string; response?: InputResponse | null }>(), { interactive: false, status: 'awaiting_input', response: null })
const emit = defineEmits(['answer'])

const activeIndex = ref(0)
const otherOpen = ref(false)
const otherText = ref('')
const otherInput = ref<HTMLInputElement | null>(null)
const options = computed(() => Array.isArray(props.request?.options) ? props.request.options.slice(0, 4) : [])
const shortcut = (index: number) => String.fromCharCode(65 + index)

function answerOption(option: InputOption | undefined) {
  if (!option) return
  if (!props.interactive) return
  emit('answer', { outcome: 'answered', selectedOptionId: option.id, otherText: null })
}
async function openOther() {
  if (!props.interactive || !props.request?.allowOther) return
  otherOpen.value = true
  await nextTick()
  otherInput.value?.focus()
}
function submitOther() {
  const value = otherText.value.trim()
  if (!props.interactive || !value) return
  emit('answer', { outcome: 'answered', selectedOptionId: null, otherText: value })
  otherText.value = ''
  otherOpen.value = false
}
function cancel() {
  if (!props.interactive) return
  if (otherOpen.value && otherText.value) {
    otherText.value = ''
    otherOpen.value = false
    return
  }
  emit('answer', { outcome: 'cancelled', selectedOptionId: null, otherText: null })
}
function onKeydown(event: KeyboardEvent) {
  if (!props.interactive || (event.target as HTMLElement | null)?.tagName === 'INPUT') return
  const key = event.key.toLowerCase()
  const shortcutIndex = key.charCodeAt(0) - 97
  if (key.length === 1 && shortcutIndex >= 0 && shortcutIndex < options.value.length) {
    event.preventDefault()
    answerOption(options.value[shortcutIndex])
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % options.value.length
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + options.value.length) % options.value.length
  } else if (event.key === 'Enter') {
    event.preventDefault()
    answerOption(options.value[activeIndex.value])
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancel()
  }
}

const answerSummary = computed(() => {
  const response = props.response
  if (!response) {
    if (props.status === 'skipped') return '已跳过'
    if (props.status === 'cancelled') return '已取消'
    return ''
  }
  if (response.outcome === 'skipped') return '已跳过'
  if (response.outcome === 'cancelled') return '已取消'
  const label = response.selectedLabel || options.value.find(item => item.id === response.selectedOptionId)?.label
  return label ? `已选择：${label}` : `已回答：${response.otherText || ''}`
})
</script>

<template>
  <section
    class="agent-input-card"
    :class="{ 'is-interactive': interactive }"
    data-testid="agent-input-card"
    :tabindex="interactive ? 0 : undefined"
    :aria-label="request.title"
    @keydown="onKeydown"
  >
    <header>
      <strong>{{ request.title }}</strong>
      <span v-if="interactive">请选择一项</span>
    </header>
    <p>{{ request.question }}</p>

    <div v-if="interactive" class="agent-input-options" role="radiogroup" :aria-label="request.question">
      <button
        v-for="(option, index) in options"
        :key="option.id"
        type="button"
        role="radio"
        :aria-checked="activeIndex === index"
        :class="{ 'is-active': activeIndex === index }"
        :data-option-id="option.id"
        @focus="activeIndex = index"
        @mouseenter="activeIndex = index"
        @click="answerOption(option)"
      >
        <kbd>{{ shortcut(index) }}</kbd>
        <span><b>{{ option.label }}</b><small v-if="option.description">{{ option.description }}</small></span>
        <em v-if="option.recommended">推荐</em>
      </button>
      <button v-if="request.allowOther && !otherOpen" data-testid="agent-input-other" type="button" class="agent-input-other" @click="openOther">
        <kbd>···</kbd><span><b>其他</b><small>自己输入答案</small></span>
      </button>
      <div v-if="request.allowOther && otherOpen" class="agent-input-other-form">
        <input ref="otherInput" v-model="otherText" data-testid="agent-input-other-text" maxlength="500" placeholder="输入其他答案…" @keydown.enter.prevent="submitOther" @keydown.esc.stop.prevent="cancel" />
        <button type="button" :disabled="!otherText.trim()" @click="submitOther">发送</button>
      </div>
    </div>
    <div v-else class="agent-input-summary">{{ answerSummary }}</div>
    <footer v-if="interactive">A–D 快速选择 · 方向键移动 · Enter 确认 · Esc 取消</footer>
  </section>
</template>

<style scoped>
.agent-input-card { width:min(580px,100%); padding:14px; border:1px solid var(--line); border-radius:12px; color:var(--text-primary); background:var(--surface); }
.agent-input-card:focus-visible { outline:2px solid #5645d4; outline-offset:2px; }
.agent-input-card header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.agent-input-card header strong { font-size:13px; font-weight:600; }
.agent-input-card header span,.agent-input-card footer { color:var(--text-tertiary); font-size:10px; }
.agent-input-card > p { margin:5px 0 12px; color:var(--text-secondary); font-size:13px; line-height:1.5; }
.agent-input-options { display:flex; flex-direction:column; gap:6px; }
.agent-input-options > button { min-height:48px; display:flex; align-items:center; gap:10px; width:100%; padding:8px 10px; border:1px solid var(--line); border-radius:8px; color:var(--text-primary); background:var(--surface); text-align:left; }
.agent-input-options > button:hover,.agent-input-options > button.is-active { border-color:#c8c4be; background:var(--bg-hover); }
.agent-input-options > button:focus-visible { outline:2px solid #5645d4; outline-offset:1px; }
.agent-input-options kbd { width:25px; height:25px; display:grid; place-items:center; flex:0 0 25px; border:1px solid var(--line); border-radius:6px; color:var(--text-secondary); background:var(--bg-secondary); font:600 11px/1 ui-monospace,SFMono-Regular,Consolas,monospace; }
.agent-input-options button > span { min-width:0; display:flex; flex:1; flex-direction:column; gap:2px; }
.agent-input-options b { font-size:12px; font-weight:600; }
.agent-input-options small { overflow:hidden; color:var(--text-tertiary); font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
.agent-input-options em { padding:2px 7px; border-radius:6px; color:#391c57; background:#e6e0f5; font-size:10px; font-style:normal; font-weight:600; }
.agent-input-other-form { display:flex; gap:7px; }
.agent-input-other-form input { min-width:0; height:42px; flex:1; padding:0 11px; border:1px solid #c8c4be; border-radius:8px; color:var(--text-primary); background:var(--surface); font-size:12px; }
.agent-input-other-form input:focus { border-color:#5645d4; outline:1px solid #5645d4; }
.agent-input-other-form button { min-width:58px; border-radius:8px; color:#fff; background:#5645d4; font-size:12px; font-weight:600; }
.agent-input-other-form button:disabled { cursor:not-allowed; opacity:.45; }
.agent-input-summary { padding:9px 10px; border-radius:8px; color:var(--text-secondary); background:var(--bg-secondary); font-size:12px; }
.agent-input-card footer { margin-top:10px; }
@media (max-width: 520px) { .agent-input-card { padding:12px; } .agent-input-card footer { display:none; } .agent-input-options > button { min-height:52px; } }
</style>
