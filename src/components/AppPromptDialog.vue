<script setup>
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { X } from 'lucide-vue-next'
import { cancelPrompt, promptDialogState, resolvePrompt } from '../services/promptDialog'

const { t } = useI18n()
const inputRef = ref(null)

watch(() => promptDialogState.visible, async visible => {
  if (!visible) return
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
})

function confirm() {
  resolvePrompt(promptDialogState.value)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="app-prompt-fade">
      <div
        v-if="promptDialogState.visible"
        class="app-prompt-overlay"
        data-testid="app-prompt-overlay"
        @click.self="cancelPrompt"
      >
        <section
          class="app-prompt-dialog"
          data-testid="app-prompt-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-prompt-title"
          @keydown.esc.prevent="cancelPrompt"
        >
          <header class="app-prompt-header">
            <strong id="app-prompt-title">{{ promptDialogState.title }}</strong>
            <button type="button" :aria-label="t('close')" @click="cancelPrompt"><X :size="18" /></button>
          </header>
          <div class="app-prompt-body">
            <input
              ref="inputRef"
              v-model="promptDialogState.value"
              data-testid="app-prompt-input"
              :type="promptDialogState.inputType"
              :placeholder="promptDialogState.placeholder"
              aria-labelledby="app-prompt-title"
              @keydown.enter.prevent="confirm"
            />
          </div>
          <footer class="app-prompt-footer">
            <button type="button" class="secondary-button" @click="cancelPrompt">{{ t('cancel') }}</button>
            <button type="button" class="primary-button" @click="confirm">{{ t('confirm') }}</button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
