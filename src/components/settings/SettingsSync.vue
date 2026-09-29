<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { CheckCircle2, RefreshCw, AlertCircle } from 'lucide-vue-next'
import { useNoteSyncStore, type NoteSyncPreferences } from '../../stores/noteSync'
import { useNotesStore } from '../../stores/notes'
import { refreshRemoteNotes } from '../../services/noteRemoteRefresh'

const { t, locale } = useI18n()
const sync = useNoteSyncStore()
const notes = useNotesStore()
const interval = ref<number | string>(sync.preferences.interval)
const unit = ref<NoteSyncPreferences['unit']>(sync.preferences.unit)
const validationError = ref('')
const online = ref(navigator.onLine)
const updateOnline = () => { online.value = navigator.onLine }
onMounted(() => { window.addEventListener('online', updateOnline); window.addEventListener('offline', updateOnline) })
onBeforeUnmount(() => { window.removeEventListener('online', updateOnline); window.removeEventListener('offline', updateOnline) })
const status = computed(() => !online.value ? t('syncOffline') : sync.checking ? t('syncChecking') : sync.error ? t('syncFailed') : sync.lastCheckedAt ? t('syncConnected') : t('syncNotChecked'))
const formatTime = (time: number) => new Date(time).toLocaleString(locale.value, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
function commit(enabled = sync.preferences.enabled) {
  try {
    sync.setPreferences({ enabled, interval: Number(interval.value), unit: unit.value })
    validationError.value = ''
  } catch (error) { validationError.value = error instanceof Error ? error.message : t('syncPreferenceError') }
}
function toggle(event: Event) {
  const input = event.target as HTMLInputElement
  try {
    sync.setPreferences({ ...sync.preferences, enabled: input.checked })
    validationError.value = ''
  } catch { input.checked = sync.preferences.enabled; validationError.value = t('syncPreferenceError') }
}
</script>

<template>
  <section class="settings-detail-section note-sync">
    <div class="note-sync-status" role="status">
      <AlertCircle v-if="sync.error || !online" :size="17" class="note-sync-warning" />
      <CheckCircle2 v-else :size="17" :class="{ 'note-sync-success': sync.lastCheckedAt }" />
      <div class="note-sync-status-copy">
        <strong>{{ status }}</strong>
        <span>{{ sync.lastCheckedAt ? t('syncLastChecked', { time: formatTime(sync.lastCheckedAt) }) : t('syncFirstCheckHint') }}</span>
        <span v-if="sync.lastSavedAt">{{ t('syncLastSaved', { time: formatTime(sync.lastSavedAt) }) }}</span>
      </div>
      <button data-testid="sync-now" class="settings-action-button" type="button" :disabled="sync.checking || !online" @click="refreshRemoteNotes(notes)"><RefreshCw :size="14" :class="{ spinning: sync.checking }" />{{ t('syncNow') }}</button>
    </div>
    <p v-if="sync.error" class="note-sync-error" role="status">{{ sync.error }}</p>
    <p v-if="sync.draftProtected" class="settings-inline-note">{{ t('syncDraftProtected') }}</p>

    <div class="settings-setting-row">
      <div class="settings-setting-copy"><strong>{{ t('syncAutomatic') }}</strong><span>{{ t('syncAutomaticHint') }}</span></div>
      <label class="settings-switch"><input type="checkbox" :checked="sync.preferences.enabled" :aria-label="t('syncAutomatic')" @change="toggle" /><span class="settings-switch-track"></span></label>
    </div>
    <div class="settings-setting-row note-sync-frequency-row">
      <div class="settings-setting-copy"><strong>{{ t('syncFrequency') }}</strong><span>{{ t('syncFrequencyHint') }}</span></div>
      <div class="note-sync-frequency">
        <input v-model="interval" type="number" min="1" :max="unit === 'minutes' ? 1440 : 86400" step="1" :disabled="!sync.preferences.enabled" :aria-label="t('syncFrequency')" :aria-invalid="Boolean(validationError)" aria-describedby="sync-frequency-error" @change="commit()" />
        <select v-model="unit" :disabled="!sync.preferences.enabled" :aria-label="t('syncUnit')" @change="commit()"><option value="seconds">{{ t('syncSeconds') }}</option><option value="minutes">{{ t('syncMinutes') }}</option></select>
      </div>
    </div>
    <p v-if="validationError" id="sync-frequency-error" class="note-sync-error" role="alert">{{ validationError }}</p>
    <div class="settings-setting-row">
      <div class="settings-setting-copy"><strong>{{ t('noteAutoSave') }}</strong><span>{{ t('noteAutoSaveHint') }}</span></div>
      <span class="note-sync-enabled"><CheckCircle2 :size="14" />{{ t('noteAutoSaveEnabled') }}</span>
    </div>
    <p class="settings-inline-note">{{ t('syncDevicePreference') }}</p>
  </section>
</template>

<style scoped>
.note-sync { padding-top:20px; }
.note-sync-status { display:flex; align-items:center; gap:12px; margin-bottom:24px; padding:20px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-secondary); color:var(--text-secondary); }
.note-sync-status-copy { flex:1; min-width:0; display:grid; gap:4px; }
.note-sync-status-copy strong { font-size:13px; font-weight:500; color:var(--text-primary); }
.note-sync-status-copy span { font-size:12px; line-height:1.5; }
.note-sync-status > svg { flex-shrink:0; }
.note-sync-success,.note-sync-enabled { color:var(--success-color, #29885c); }
.note-sync-warning,.note-sync-error { color:var(--danger-color, #b94032); }
.note-sync-error { margin:8px 0; font-size:12px; line-height:1.5; overflow-wrap:anywhere; }
.note-sync-frequency { display:flex; align-items:center; gap:8px; flex-shrink:0; margin-left:auto; }
.note-sync-frequency input,.note-sync-frequency select { box-sizing:border-box; height:34px; padding:6px 10px; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-primary); color:var(--text-primary); font:inherit; font-size:13px; }
.note-sync-frequency input { width:96px; }
.note-sync-frequency select { width:80px; }
.note-sync-frequency :focus-visible { outline:2px solid var(--accent-color); outline-offset:2px; }
.note-sync-frequency :disabled { opacity:.5; cursor:not-allowed; }
.note-sync-enabled { display:flex; align-items:center; gap:6px; margin-left:auto; white-space:nowrap; font-size:12px; }
.note-sync .settings-switch input:focus-visible + .settings-switch-track { outline:2px solid var(--accent-color); outline-offset:3px; }
@media(max-width:700px) { .note-sync-status { flex-wrap:wrap; padding:16px; } .note-sync-status .settings-action-button { margin-left:29px; } .note-sync-frequency-row { flex-wrap:wrap; gap:12px; } }
</style>
