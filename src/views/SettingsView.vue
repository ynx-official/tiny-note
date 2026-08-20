<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, ChevronDown, KeyRound, Moon, Monitor, Plus, Sun, Trash2, X } from 'lucide-vue-next'
import { invoke } from '../services/tauri'

const { t, locale } = useI18n()
const settings = ref({ theme: 'system', language: locale.value, fimEnabled: false })
const models = ref([])
const draft = ref(null)
const showThemeDropdown = ref(false)
const showLanguageDropdown = ref(false)
const saving = ref(false)
const modelSaving = ref(false)

const themeOptions = computed(() => [
  { value: 'light', label: t('light'), icon: Sun },
  { value: 'dark', label: t('dark'), icon: Moon },
  { value: 'system', label: t('system'), icon: Monitor }
])
const languageOptions = computed(() => [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' }
])
const currentThemeLabel = computed(() => themeOptions.value.find(option => option.value === settings.value.theme)?.label || t('system'))
const currentLanguageLabel = computed(() => languageOptions.value.find(option => option.value === settings.value.language)?.label || '简体中文')

function emptyDraft() {
  return { id: '', name: '', provider: 'OpenAI-compatible', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', isDefault: models.value.length === 0, apiKey: '' }
}

function applyTheme(theme) {
  const resolved = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme
  document.documentElement.dataset.theme = resolved
  localStorage.setItem('tiny-note-theme', resolved)
}

async function save() {
  saving.value = true
  try {
    settings.value = await invoke('settings_update', { settings: settings.value })
    applyTheme(settings.value.theme)
  } finally {
    saving.value = false
  }
}

async function selectTheme(value) {
  settings.value.theme = value
  showThemeDropdown.value = false
  await save()
}

async function selectLanguage(value) {
  settings.value.language = value
  locale.value = value
  showLanguageDropdown.value = false
  await save()
}

function closeDropdowns() {
  showThemeDropdown.value = false
  showLanguageDropdown.value = false
}

function addModel() {
  draft.value = emptyDraft()
}

function cancelModel() {
  draft.value = null
}

async function saveModel() {
  if (!draft.value?.name.trim() || !draft.value?.model.trim()) return
  modelSaving.value = true
  try {
    await invoke('model_upsert', {
      profile: {
        id: draft.value.id || crypto.randomUUID(),
        name: draft.value.name.trim(),
        provider: draft.value.provider.trim() || 'OpenAI-compatible',
        baseUrl: draft.value.baseUrl.trim(),
        model: draft.value.model.trim(),
        isDefault: draft.value.isDefault,
        apiKeyConfigured: false
      },
      apiKey: draft.value.apiKey
    })
    models.value = await invoke('model_list')
    draft.value = null
  } finally {
    modelSaving.value = false
  }
}

async function removeModel(id) {
  if (!window.confirm(t('confirmDelete'))) return
  await invoke('model_delete', { id })
  models.value = await invoke('model_list')
}

onMounted(async () => {
  settings.value = await invoke('settings_get')
  locale.value = settings.value.language
  applyTheme(settings.value.theme)
  models.value = await invoke('model_list')
})

watch(() => settings.value.language, value => { if (value) locale.value = value })
</script>

<template>
  <div class="settings-page" @click="closeDropdowns">
    <h1 class="settings-title">{{ t('settings') }}</h1>

    <div class="settings-content">
      <section class="settings-group">
        <div class="group-title">{{ t('general') }}</div>
        <div class="group-content">
          <div class="setting-item">
            <span class="item-label">{{ t('theme') }}</span>
            <div class="theme-select-wrapper" @click.stop>
              <button class="theme-select-trigger" type="button" @click="showThemeDropdown = !showThemeDropdown; showLanguageDropdown = false">
                <span>{{ currentThemeLabel }}</span><ChevronDown class="theme-select-arrow" :class="{ expanded: showThemeDropdown }" :size="13" />
              </button>
              <div v-if="showThemeDropdown" class="theme-dropdown-menu">
                <button v-for="option in themeOptions" :key="option.value" class="theme-dropdown-item" :class="{ active: settings.theme === option.value }" type="button" @click="selectTheme(option.value)">
                  <span class="theme-option-label"><component :is="option.icon" :size="15" />{{ option.label }}</span><Check v-if="settings.theme === option.value" class="check-icon" :size="16" />
                </button>
              </div>
            </div>
          </div>

          <div class="setting-item">
            <span class="item-label">{{ t('language') }}</span>
            <div class="theme-select-wrapper" @click.stop>
              <button class="theme-select-trigger" type="button" @click="showLanguageDropdown = !showLanguageDropdown; showThemeDropdown = false">
                <span>{{ currentLanguageLabel }}</span><ChevronDown class="theme-select-arrow" :class="{ expanded: showLanguageDropdown }" :size="13" />
              </button>
              <div v-if="showLanguageDropdown" class="theme-dropdown-menu">
                <button v-for="option in languageOptions" :key="option.value" class="theme-dropdown-item" :class="{ active: settings.language === option.value }" type="button" @click="selectLanguage(option.value)">
                  <span>{{ option.label }}</span><Check v-if="settings.language === option.value" class="check-icon" :size="16" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="settings-group">
        <div class="group-title">{{ t('aiWriting') }}</div>
        <div class="group-content">
          <div class="setting-item setting-item-with-hint">
            <div class="item-label-group"><span class="item-label">{{ t('fim') }}</span><span class="item-hint">{{ t('fimHint') }}。首次开启会发起外部 API 请求并可能产生费用。</span></div>
            <label class="toggle-switch"><input v-model="settings.fimEnabled" type="checkbox" :disabled="saving" @change="save" /><span class="toggle-slider"></span></label>
          </div>
        </div>
      </section>

      <section class="settings-group">
        <div class="group-title">{{ t('model') }}</div>
        <div class="group-content">
          <div class="setting-item setting-item-with-hint">
            <div class="item-label-group"><span class="item-label">{{ t('modelConfiguration') }}</span><span class="item-hint">{{ t('modelConfigHint') }}</span></div>
            <button class="action-btn" type="button" @click="addModel"><Plus :size="15" />{{ t('addModel') }}</button>
          </div>
          <div v-if="!models.length && !draft" class="settings-empty">{{ t('noModels') }}</div>
          <div v-for="model in models" :key="model.id" class="model-row">
            <div class="model-avatar"><KeyRound :size="16" /></div>
            <div class="model-details"><strong>{{ model.name }}</strong><small>{{ model.provider }} · {{ model.model }}</small></div>
            <span class="model-status">{{ model.apiKeyConfigured ? t('configured') : t('notConfigured') }}</span>
            <button class="model-delete-btn" type="button" :title="t('delete')" @click="removeModel(model.id)"><Trash2 :size="15" /></button>
          </div>
          <div v-if="draft" class="model-form">
            <div class="model-form-grid">
              <label><span>{{ t('name') }}</span><input v-model="draft.name" autofocus :placeholder="t('model')" /></label>
              <label><span>{{ t('provider') }}</span><input v-model="draft.provider" placeholder="OpenAI-compatible" /></label>
              <label><span>{{ t('baseUrl') }}</span><input v-model="draft.baseUrl" :placeholder="t('baseUrl')" /></label>
              <label><span>{{ t('modelName') }}</span><input v-model="draft.model" :placeholder="t('modelName')" /></label>
              <label class="model-form-wide"><span>{{ t('apiKey') }}</span><input v-model="draft.apiKey" type="password" :placeholder="t('apiKey')" autocomplete="new-password" /></label>
            </div>
            <div class="model-form-actions"><button class="text-btn" type="button" @click="cancelModel"><X :size="14" />{{ t('cancel') }}</button><button class="action-btn primary" type="button" :disabled="modelSaving || !draft.name.trim() || !draft.model.trim()" @click="saveModel">{{ modelSaving ? t('saving') : t('save') }}</button></div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
