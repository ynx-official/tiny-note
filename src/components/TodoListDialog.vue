<script setup>
import { nextTick, reactive, ref, watch } from 'vue'
import { List, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { TODO_LIST_COLORS } from '../stores/todos'

const props = defineProps({
  open: { type: Boolean, default: false },
  item: { type: Object, default: null },
  saving: { type: Boolean, default: false },
  error: { type: String, default: '' }
})
const emit = defineEmits(['close', 'save'])
const { t } = useI18n()
const nameInput = ref(null)
const form = reactive({ name: '', color: '#5C6BC0' })

watch(() => props.open, async open => {
  if (!open) return
  form.name = props.item?.name || ''
  form.color = props.item?.color || '#5C6BC0'
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
})

function close() {
  if (!props.saving) emit('close')
}

function submit() {
  const name = form.name.trim()
  if (!name || props.saving) return
  emit('save', { name, color: form.color })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="todo-list-dialog-fade">
      <div v-if="open" class="todo-list-dialog-backdrop" data-testid="todo-list-dialog-backdrop" @mousedown.self="close">
        <form class="todo-list-dialog" role="dialog" aria-modal="true" :aria-labelledby="item ? 'todo-list-dialog-edit-title' : 'todo-list-dialog-create-title'" @submit.prevent="submit" @keydown.esc.stop.prevent="close">
          <header>
            <div>
              <span class="todo-list-dialog-icon" :style="{ '--list-color': form.color }"><List :size="18" /></span>
              <h2 :id="item ? 'todo-list-dialog-edit-title' : 'todo-list-dialog-create-title'">{{ item ? t('todoListEdit') : t('todoListAdd') }}</h2>
            </div>
            <button type="button" :aria-label="t('close')" @click="close"><X :size="18" /></button>
          </header>
          <label class="todo-list-name-field">
            <span>{{ t('name') }}</span>
            <input ref="nameInput" v-model="form.name" maxlength="120" :placeholder="t('todoListNamePlaceholder')" autocomplete="off">
          </label>
          <fieldset>
            <legend>{{ t('todoListColor') }}</legend>
            <div class="todo-list-color-grid">
              <button v-for="color in TODO_LIST_COLORS" :key="color" type="button" :class="{ active: form.color === color }" :style="{ '--choice-color': color }" role="radio" :aria-checked="form.color === color" :aria-label="`${t('todoListColor')} ${color}`" @click="form.color = color"></button>
            </div>
          </fieldset>
          <p v-if="error" class="todo-list-dialog-error" role="alert">{{ error }}</p>
          <footer>
            <button type="button" class="secondary" @click="close">{{ t('cancel') }}</button>
            <button class="primary" :disabled="!form.name.trim() || saving">{{ saving ? t('todoListSaving') : t('confirm') }}</button>
          </footer>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.todo-list-dialog-backdrop{position:fixed;inset:0;z-index:130;background:#0006;display:grid;place-items:center;padding:18px}.todo-list-dialog{box-sizing:border-box;width:min(480px,100%);display:grid;gap:20px;border:1px solid var(--line);border-radius:14px;background:var(--panel);color:var(--text);padding:20px;box-shadow:0 24px 75px #0006}.todo-list-dialog header,.todo-list-dialog header>div,.todo-list-dialog footer{display:flex;align-items:center}.todo-list-dialog header{justify-content:space-between}.todo-list-dialog header>div{gap:10px}.todo-list-dialog h2{margin:0;font-size:19px}.todo-list-dialog header>button{width:32px;height:32px;display:grid;place-items:center;border:0;border-radius:7px;background:transparent;color:var(--muted)}.todo-list-dialog header>button:hover{background:var(--hover);color:var(--text)}.todo-list-dialog-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:9px;background:color-mix(in srgb,var(--list-color),transparent 86%);color:var(--list-color)}.todo-list-name-field{display:grid;gap:7px;font-size:13px;color:var(--muted)}.todo-list-name-field input{box-sizing:border-box;width:100%;height:42px;border:1px solid var(--line);border-radius:9px;background:var(--bg);color:var(--text);padding:0 12px;font:inherit;outline:0}.todo-list-name-field input:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent),transparent 78%)}.todo-list-dialog fieldset{border:0;padding:0;margin:0}.todo-list-dialog legend{margin-bottom:11px;color:var(--muted);font-size:13px}.todo-list-color-grid{display:flex;flex-wrap:wrap;gap:11px}.todo-list-color-grid button{box-sizing:border-box;width:27px;height:27px;border:3px solid var(--panel);border-radius:50%;background:var(--choice-color);box-shadow:0 0 0 1px color-mix(in srgb,var(--choice-color),var(--line) 25%)}.todo-list-color-grid button.active{box-shadow:0 0 0 2px var(--panel),0 0 0 4px var(--accent)}.todo-list-dialog-error{margin:-6px 0 0;color:#dc4c4c;font-size:12px}.todo-list-dialog footer{justify-content:flex-end;gap:9px;padding-top:2px}.todo-list-dialog footer button{min-width:82px;height:36px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--text);font:inherit}.todo-list-dialog footer .primary{border-color:var(--accent);background:var(--accent);color:#fff}.todo-list-dialog footer button:disabled{opacity:.45}.todo-list-dialog-fade-enter-active,.todo-list-dialog-fade-leave-active{transition:opacity .16s}.todo-list-dialog-fade-enter-from,.todo-list-dialog-fade-leave-to{opacity:0}
</style>
