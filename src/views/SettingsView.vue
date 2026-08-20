<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, ChevronDown, ChevronRight, Cpu, Globe2, Info, KeyRound, Languages, Moon, Monitor, Palette, Plus, RefreshCw, Search, Sparkles, Sun, Trash2, X } from 'lucide-vue-next'
import { invoke } from '../services/tauri'

const { t, locale } = useI18n()
const settings = ref({ theme: 'system', language: locale.value, fimEnabled: false })
const models = ref([])
const draft = ref(null)
const showLanguageDropdown = ref(false)
const providerMenuOpen = ref(false)
const primaryModelMenuOpen = ref(false)
const searchQuery = ref('')
const activeSectionId = ref('appearance')
const saving = ref(false)
const modelSaving = ref(false)
const modelCatalog = ref([])
const selectedModelIds = ref([])
const modelFetchBusy = ref(false)
const modelFetchError = ref('')

const providerOptions = [
  { key: 'qwen', label: '通义千问', mark: 'Q', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { key: 'zhipu', label: '智谱', mark: 'Z', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { key: 'deepseek', label: 'DeepSeek', mark: 'DS', baseUrl: 'https://api.deepseek.com/v1' },
  { key: 'kimi', label: 'Kimi', mark: 'K', baseUrl: 'https://api.moonshot.cn/v1' },
  { key: 'minimax', label: 'MiniMax', mark: 'M', baseUrl: 'https://api.minimax.chat/v1' },
  { key: 'custom', label: '其他', mark: '···', baseUrl: '' }
]

const themeOptions = computed(() => [
  { value: 'system', label: t('system'), icon: Monitor },
  { value: 'light', label: t('light'), icon: Sun },
  { value: 'dark', label: t('dark'), icon: Moon }
])
const languageOptions = computed(() => [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' }
])
const currentLanguageLabel = computed(() => languageOptions.value.find(option => option.value === settings.value.language)?.label || '简体中文')
const settingsSections = computed(() => [
  { id: 'appearance', label: t('appearance'), description: t('appearanceHint'), icon: Palette },
  { id: 'ai', label: t('aiWriting'), description: t('aiWritingHint'), icon: Sparkles },
  { id: 'models', label: t('models'), description: t('modelsHint'), icon: Cpu },
  { id: 'about', label: t('about'), description: t('aboutHint'), icon: Info }
])
const filteredSections = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  if (!query) return settingsSections.value
  return settingsSections.value.filter(section => `${section.label} ${section.description}`.toLocaleLowerCase().includes(query))
})
const activeSection = computed(() => settingsSections.value.find(section => section.id === activeSectionId.value) || settingsSections.value[0])
const selectedProvider = computed(() => providerOptions.find(option => option.key === draft.value?.providerKey) || providerOptions[2])
const selectedCatalogModels = computed(() => modelCatalog.value.filter(option => selectedModelIds.value.includes(option.id)))
const primaryModel = computed(() => models.value.find(model => model.isDefault) || models.value[0] || null)

function emptyDraft() {
  const provider = providerOptions[2]
  return { id: '', name: '', providerKey: provider.key, provider: provider.label, baseUrl: provider.baseUrl, model: '', isDefault: models.value.length === 0, apiKey: '' }
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
  await save()
}

async function selectLanguage(value) {
  settings.value.language = value
  locale.value = value
  showLanguageDropdown.value = false
  await save()
}

function closeDropdowns() {
  showLanguageDropdown.value = false
  providerMenuOpen.value = false
  primaryModelMenuOpen.value = false
}

function selectSection(id) {
  activeSectionId.value = id
  closeDropdowns()
}

function addModel() {
  draft.value = emptyDraft()
  modelCatalog.value = []
  selectedModelIds.value = []
  modelFetchError.value = ''
  providerMenuOpen.value = false
}

function cancelModel() {
  draft.value = null
  modelCatalog.value = []
  selectedModelIds.value = []
  modelFetchError.value = ''
  providerMenuOpen.value = false
}

function selectProvider(option) {
  if (!draft.value) return
  draft.value.providerKey = option.key
  draft.value.provider = option.label
  draft.value.baseUrl = option.baseUrl
  draft.value.model = ''
  modelCatalog.value = []
  selectedModelIds.value = []
  modelFetchError.value = ''
  providerMenuOpen.value = false
}

function toggleAllModels() {
  selectedModelIds.value = selectedModelIds.value.length === modelCatalog.value.length ? [] : modelCatalog.value.map(option => option.id)
}

async function fetchModels() {
  if (!draft.value?.baseUrl.trim() || modelFetchBusy.value) return
  modelFetchBusy.value = true
  modelFetchError.value = ''
  try {
    modelCatalog.value = await invoke('model_fetch_models', { request: {
      provider: draft.value.provider,
      baseUrl: draft.value.baseUrl.trim(),
      apiKey: draft.value.apiKey
    } })
    selectedModelIds.value = []
    if (!modelCatalog.value.length) modelFetchError.value = '没有获取到可用模型，请检查地址和 API Key。'
  } catch (error) {
    modelCatalog.value = []
    modelFetchError.value = error?.message || '模型列表获取失败，请检查地址和 API Key。'
  } finally {
    modelFetchBusy.value = false
  }
}

async function saveModel() {
  if (!draft.value) return
  const selected = selectedCatalogModels.value.length ? selectedCatalogModels.value : (draft.value.model.trim() ? [{ id: draft.value.model.trim(), name: draft.value.model.trim() }] : [])
  if (!selected.length) {
    modelFetchError.value = '请先获取模型列表并至少勾选一个模型。'
    return
  }
  modelSaving.value = true
  try {
    for (const [index, option] of selected.entries()) {
      await invoke('model_upsert', {
        profile: {
          id: crypto.randomUUID(),
          name: draft.value.provider + ' ' + option.id,
          provider: draft.value.provider,
          baseUrl: draft.value.baseUrl.trim(),
          model: option.id,
          isDefault: models.value.length === 0 && index === 0,
          apiKeyConfigured: false
        },
        apiKey: draft.value.apiKey
      })
    }
    models.value = await invoke('model_list')
    cancelModel()
  } finally {
    modelSaving.value = false
  }
}

async function setPrimaryModel(model) {
  if (!model || model.id === primaryModel.value?.id) {
    primaryModelMenuOpen.value = false
    return
  }
  modelSaving.value = true
  try {
    for (const item of models.value) {
      await invoke('model_upsert', { profile: { ...item, isDefault: item.id === model.id }, apiKey: null })
    }
    models.value = await invoke('model_list')
  } finally {
    modelSaving.value = false
    primaryModelMenuOpen.value = false
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
watch(filteredSections, sections => {
  if (searchQuery.value && !sections.some(section => section.id === activeSectionId.value)) activeSectionId.value = sections[0]?.id || 'appearance'
})
</script>

<template>
  <div class="settings-page" @click="closeDropdowns">
    <div class="settings-shell">
      <aside class="settings-nav" aria-label="设置分类">
        <label class="settings-search"><Search :size="14" /><input v-model="searchQuery" :placeholder="t('settingsSearch')" /></label>
        <nav class="settings-nav-list">
          <button v-for="section in filteredSections" :key="section.id" type="button" class="settings-nav-item" :class="{ active: section.id === activeSectionId }" @click="selectSection(section.id)">
            <component :is="section.icon" :size="14" /><span>{{ section.label }}</span><ChevronRight :size="13" />
          </button>
          <div v-if="!filteredSections.length" class="settings-nav-empty">{{ locale === 'zh-CN' ? '没有匹配的设置' : 'No matching settings' }}</div>
        </nav>
      </aside>

      <main class="settings-detail">
        <header class="settings-detail-header"><span>{{ activeSection.label }}</span></header>
        <div class="settings-detail-scroll">
          <section v-if="activeSectionId === 'appearance'" class="settings-detail-section">
            <div class="settings-section-kicker">{{ t('appearance') }}</div>
            <div class="settings-setting-row settings-theme-row">
              <div class="settings-setting-copy"><strong>{{ t('theme') }}</strong><span>{{ t('appearanceHint') }}</span></div>
              <div class="settings-theme-options" role="group" :aria-label="t('theme')">
                <button v-for="option in themeOptions" :key="option.value" type="button" class="settings-theme-option" :class="{ active: settings.theme === option.value }" @click="selectTheme(option.value)"><component :is="option.icon" :size="14" /><span>{{ option.label }}</span><Check v-if="settings.theme === option.value" :size="13" /></button>
              </div>
            </div>
            <div class="settings-setting-row">
              <div class="settings-setting-copy"><strong>{{ t('language') }}</strong><span>{{ t('languageHint') }}</span></div>
              <div class="theme-select-wrapper settings-language-control" @click.stop>
                <button class="theme-select-trigger" type="button" @click="showLanguageDropdown = !showLanguageDropdown"><Languages :size="14" /><span>{{ currentLanguageLabel }}</span><ChevronDown class="theme-select-arrow" :class="{ expanded: showLanguageDropdown }" :size="13" /></button>
                <div v-if="showLanguageDropdown" class="theme-dropdown-menu">
                  <button v-for="option in languageOptions" :key="option.value" class="theme-dropdown-item" :class="{ active: settings.language === option.value }" type="button" @click="selectLanguage(option.value)"><span>{{ option.label }}</span><Check v-if="settings.language === option.value" class="check-icon" :size="16" /></button>
                </div>
              </div>
            </div>
          </section>

          <section v-else-if="activeSectionId === 'ai'" class="settings-detail-section">
            <div class="settings-section-kicker">{{ t('aiWriting') }}</div>
            <div class="settings-setting-row">
              <div class="settings-setting-copy"><strong>{{ t('fim') }}</strong><span>{{ t('fimHint') }}</span></div>
              <label class="settings-switch"><input v-model="settings.fimEnabled" type="checkbox" :disabled="saving" @change="save" /><span class="settings-switch-track"></span></label>
            </div>
            <p class="settings-inline-note">{{ t('fimCostHint') }}</p>
          </section>

          <section v-else-if="activeSectionId === 'models'" class="settings-detail-section">
            <div class="settings-section-kicker">模型设置</div>
            <div class="settings-model-primary-row">
              <strong>首选模型</strong>
              <div class="settings-primary-select-wrap">
                <button type="button" class="settings-primary-select" @click.stop="primaryModelMenuOpen = !primaryModelMenuOpen; providerMenuOpen = false">
                  <span v-if="primaryModel" class="settings-primary-model"><span class="provider-mark" :class="'provider-' + (primaryModel.provider || '').toLowerCase()">{{ (primaryModel.provider || 'AI').slice(0, 2) }}</span><span><b>{{ primaryModel.name }}</b><small>{{ primaryModel.provider }} · {{ primaryModel.model }}</small></span></span>
                  <span v-else class="settings-primary-empty">{{ t('noModels') }}</span>
                  <ChevronDown :size="15" :class="{ expanded: primaryModelMenuOpen }" />
                </button>
                <div v-if="primaryModelMenuOpen" class="settings-primary-menu" @click.stop>
                  <button v-for="model in models" :key="model.id" type="button" :class="{ active: model.id === primaryModel?.id }" @click="setPrimaryModel(model)">
                    <span class="provider-mark" :class="'provider-' + (model.provider || '').toLowerCase()">{{ (model.provider || 'AI').slice(0, 2) }}</span><span><b>{{ model.name }}</b><small>{{ model.model }}</small></span><Check v-if="model.id === primaryModel?.id" :size="15" />
                  </button>
                  <span v-if="!models.length" class="settings-primary-menu-empty">{{ t('noModels') }}</span>
                </div>
              </div>
            </div>
            <div class="settings-subheading">自定义模型</div>
            <button type="button" class="settings-add-model-row" @click="addModel"><Plus :size="17" /><span>{{ t('addModel') }}</span><ChevronRight :size="15" /></button>
            <div v-if="models.length" class="settings-model-list">
              <div v-for="model in models" :key="model.id" class="settings-model-card">
                <span class="provider-mark" :class="'provider-' + (model.provider || '').toLowerCase()">{{ (model.provider || 'AI').slice(0, 2) }}</span>
                <div class="settings-model-card-copy"><strong>{{ model.name }}</strong><small>{{ model.provider }} · {{ model.model }}</small></div>
                <span class="settings-model-status">{{ model.apiKeyConfigured ? t('configured') : t('notConfigured') }}</span>
                <button type="button" class="model-delete-btn" :title="t('delete')" @click="removeModel(model.id)"><Trash2 :size="16" /></button>
              </div>
            </div>
            <div v-else class="settings-empty settings-empty-large">{{ t('noModels') }}</div>
          </section>

          <section v-else class="settings-detail-section settings-about-section">
            <div class="settings-section-kicker">{{ t('about') }}</div>
            <div class="settings-setting-row"><div class="settings-setting-copy"><strong>{{ t('appName') }}</strong><span>{{ t('localFirstHint') }}</span></div><span class="settings-value">v0.1.0</span></div>
            <div class="settings-setting-row"><div class="settings-setting-copy"><strong>{{ t('localFirst') }}</strong><span>{{ t('noteScope') }}</span></div><Globe2 :size="17" class="settings-value-icon" /></div>
          </section>
        </div>
      </main>
    </div>
    <div v-if="draft" class="settings-model-modal-backdrop" @click.self="cancelModel">
      <section class="settings-model-modal" role="dialog" aria-modal="true" aria-label="添加模型">
        <header class="settings-model-modal-header"><strong>添加模型</strong><button type="button" aria-label="关闭" @click="cancelModel"><X :size="20" /></button></header>
        <div class="settings-model-modal-body">
          <label class="settings-modal-label">模型厂商</label>
          <div class="settings-provider-control">
            <button type="button" class="settings-provider-trigger" @click.stop="providerMenuOpen = !providerMenuOpen; primaryModelMenuOpen = false">
              <span class="provider-mark" :class="'provider-' + selectedProvider.key">{{ selectedProvider.mark }}</span><span>{{ selectedProvider.label }}</span><ChevronDown :size="15" :class="{ expanded: providerMenuOpen }" />
            </button>
            <div v-if="providerMenuOpen" class="settings-provider-menu" @click.stop>
              <button v-for="option in providerOptions" :key="option.key" type="button" :class="{ active: option.key === draft.providerKey }" @click="selectProvider(option)"><span class="provider-mark" :class="'provider-' + option.key">{{ option.mark }}</span><span>{{ option.label }}</span><Check v-if="option.key === draft.providerKey" :size="15" /></button>
            </div>
          </div>
          <div class="settings-modal-form-grid">
            <label><span>{{ t('baseUrl') }}</span><input v-model="draft.baseUrl" type="url" placeholder="https://api.example.com/v1" /></label>
            <label><span>{{ t('apiKey') }}</span><input v-model="draft.apiKey" type="password" :placeholder="t('apiKey')" autocomplete="new-password" /></label>
          </div>
          <div class="settings-fetch-row"><span>从 {{ draft.baseUrl || '接口地址' }}/models 获取可用模型</span><button type="button" class="settings-fetch-button" :disabled="modelFetchBusy || !draft.baseUrl.trim()" @click="fetchModels"><RefreshCw :size="14" :class="{ spinning: modelFetchBusy }" />{{ modelFetchBusy ? '获取中…' : '获取模型列表' }}</button></div>
          <p v-if="modelFetchError" class="settings-model-error">{{ modelFetchError }}</p>
          <div v-if="modelCatalog.length" class="settings-model-picker">
            <div class="settings-model-picker-header"><span>选择模型 <small>已选 {{ selectedModelIds.length }} 个</small></span><button type="button" @click="toggleAllModels">{{ selectedModelIds.length === modelCatalog.length ? '取消全选' : '全选' }}</button></div>
            <label v-for="option in modelCatalog" :key="option.id" class="settings-model-check-row"><input v-model="selectedModelIds" type="checkbox" :value="option.id" /><span class="settings-model-check"></span><span><b>{{ option.name || option.id }}</b><small>{{ option.id }}<template v-if="option.ownedBy"> · {{ option.ownedBy }}</template></small></span></label>
          </div>
          <label v-if="!modelCatalog.length" class="settings-custom-model-field"><span>自定义模型 ID（可选）</span><input v-model="draft.model" type="text" placeholder="例如 deepseek-chat" /></label>
          <p class="settings-modal-hint">自定义配置，请遵守法规并关注模型使用 Token 消耗。</p>
        </div>
        <footer class="settings-model-modal-footer"><button type="button" class="settings-text-button" @click="cancelModel">{{ t('cancel') }}</button><button type="button" class="settings-action-button primary" :disabled="modelSaving || (!selectedModelIds.length && !draft.model.trim())" @click="saveModel">{{ modelSaving ? t('saving') : (locale === 'zh-CN' ? '保存' : 'Save') }}</button></footer>
      </section>
    </div>
  </div>
</template>
