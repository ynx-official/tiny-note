<script setup>
import { nextTick, ref, watch } from 'vue'
import { CheckCircle2, ExternalLink, FolderOpen, LoaderCircle } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import {
  dismissExportSuccess,
  exportSuccessState,
  openExportedFile,
  revealExportedFile
} from '../services/exportSuccess'

const { t } = useI18n()
const openButton = ref(null)

watch(() => exportSuccessState.visible, async visible => {
  if (!visible) return
  await nextTick()
  openButton.value?.focus()
}, { immediate: true })
</script>

<template>
  <Transition name="app-feedback-fade">
    <div v-if="exportSuccessState.visible" class="app-feedback-overlay">
      <section class="app-export-success-dialog" role="dialog" aria-modal="true" aria-labelledby="export-success-title" aria-describedby="export-success-message" @keydown.esc.prevent="dismissExportSuccess">
        <div class="app-export-success-content">
          <span class="app-export-success-icon" aria-hidden="true"><CheckCircle2 :size="22" /></span>
          <div>
            <strong id="export-success-title">{{ t('exportSucceeded') }}</strong>
            <p id="export-success-message">{{ t('exportSucceededHint', { fileName: exportSuccessState.fileName }) }}</p>
            <small :title="exportSuccessState.path">{{ exportSuccessState.path }}</small>
          </div>
        </div>
        <p v-if="exportSuccessState.error" class="app-export-success-error" role="alert">{{ exportSuccessState.error }}</p>
        <footer>
          <button data-testid="reveal-exported-file" type="button" class="app-export-success-secondary" :disabled="exportSuccessState.busy" @click="revealExportedFile"><FolderOpen :size="15" />{{ t('openContainingFolder') }}</button>
          <button ref="openButton" data-testid="open-exported-file" type="button" class="app-export-success-primary" :disabled="exportSuccessState.busy" @click="openExportedFile"><LoaderCircle v-if="exportSuccessState.busy" class="spinning" :size="15" /><ExternalLink v-else :size="15" />{{ t('openExportedFile') }}</button>
          <button data-testid="dismiss-export-success" type="button" class="app-export-success-later" :disabled="exportSuccessState.busy" @click="dismissExportSuccess">{{ t('maybeLater') }}</button>
        </footer>
      </section>
    </div>
  </Transition>
</template>
