<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { FolderOpen, LoaderCircle, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { cancelExportLocationRequest, chooseExportLocation, exportLocationState } from '../services/exportLocation'

const { t } = useI18n()
const dialogRef = ref<HTMLElement | null>(null)

watch(() => exportLocationState.visible, async visible => {
  if (!visible) return
  await nextTick()
  dialogRef.value?.focus()
})
</script>

<template>
  <Transition name="app-feedback-fade">
    <div v-if="exportLocationState.visible" class="app-feedback-overlay">
      <section ref="dialogRef" class="app-export-location-dialog" role="dialog" aria-modal="true" aria-labelledby="export-location-title" tabindex="-1" @keydown.esc.prevent="cancelExportLocationRequest">
        <header>
          <span class="app-export-location-icon" aria-hidden="true"><FolderOpen :size="20" /></span>
          <div><strong id="export-location-title">{{ t('chooseExportLocation') }}</strong><p>{{ t('chooseExportLocationHint') }}</p></div>
          <button type="button" class="app-export-location-close" :aria-label="t('cancel')" :disabled="exportLocationState.busy" @click="cancelExportLocationRequest"><X :size="17" /></button>
        </header>
        <label class="app-export-location-remember">
          <input v-model="exportLocationState.remember" type="checkbox" />
          <span><b>{{ t('rememberExportLocation') }}</b><small>{{ t('rememberExportLocationHint') }}</small></span>
        </label>
        <p v-if="exportLocationState.error" class="app-export-location-error" role="alert">{{ exportLocationState.error }}</p>
        <footer>
          <button type="button" class="secondary-button" :disabled="exportLocationState.busy" @click="cancelExportLocationRequest">{{ t('cancel') }}</button>
          <button type="button" class="primary-button" :disabled="exportLocationState.busy" @click="chooseExportLocation"><LoaderCircle v-if="exportLocationState.busy" class="spinning" :size="15" /><FolderOpen v-else :size="15" />{{ exportLocationState.busy ? t('openingFolderPicker') : t('selectFolder') }}</button>
        </footer>
      </section>
    </div>
  </Transition>
</template>
