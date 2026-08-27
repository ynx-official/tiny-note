import { computed, onMounted, ref, watch, type Component } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Cpu, FolderDown, Info, Keyboard, Moon, Monitor, Palette, Sparkles, Sun, Wrench } from 'lucide-vue-next'
import { invoke } from '../services/tauri'
import { appUpdater, BUNDLED_APP_VERSION, type UpdateCheckState } from '../services/appUpdater'
import { requestConfirmation, showToast } from '../services/appFeedback'
import { useAppStore } from '../stores/app'
import { shortcutDisplayParts, shortcutFromKeyboardEvent } from '../utils/keyboardShortcut'
import { modelProviderLabel } from '../utils/modelProvider'
import { pickNativeExportDirectory } from '../services/exportLocation'
import doubaoIcon from '../assets/providers/doubao.png'
import qwenIcon from '../assets/providers/qwen.png'
import zhipuIcon from '../assets/providers/zhipu.png'
import deepseekIcon from '../assets/providers/deepseek.png'
import kimiIcon from '../assets/providers/kimi.png'
import minimaxIcon from '../assets/providers/minimax.png'
import otherIcon from '../assets/providers/other.png'
import { errorMessage, type AppSettings, type JsonValue, type ModelOption, type ModelProfile } from '../types/domain'

export function useSettingsWorkspace() {
  interface ProviderOption { key: string; label: string; mark: string; icon: string; baseUrl: string }
  
  interface EndpointOption { key: string; label: string; description: string }
  
  interface ModelDraft { id: string; providerId: string | null; connectionName: string; name: string; providerKey: string; provider: string; baseUrl: string; model: string; endpointType: string; isDefault: boolean; apiKey: string; apiKeyConfigured?: boolean; connectionModels?: ModelProfile[] }
  
  interface ModelConnection { id: string; name: string; providerId: string | null; representative: ModelProfile; models: ModelProfile[] }
  
  interface ModelTestState { loading: boolean; status: string; message: string }
  
  interface BalanceData { supported?: boolean; error?: string; totalBalance?: number; grantedBalance?: number; toppedUpBalance?: number; currency?: string; updatedAt?: string; [key: string]: unknown }
  
  interface BalanceState { loading: boolean; data?: BalanceData; updatedAt?: string; error?: string }
  
  interface ThemeOption { value: AppSettings['theme']; label: string; icon: Component }
  
  interface LanguageOption { value: AppSettings['language']; label: string }
  
  const { t, locale } = useI18n()
  
  const appStore = useAppStore()
  
  const { settings, models, editorModeShortcut } = storeToRefs(appStore)
  
  const draft = ref<ModelDraft | null>(null)
  
  const showLanguageDropdown = ref(false)
  
  const providerMenuOpen = ref(false)
  
  const endpointMenuOpen = ref(false)
  
  const primaryModelMenuOpen = ref(false)
  
  const imagePrimaryModelMenuOpen = ref(false)
  
  const searchQuery = ref('')
  
  const activeSectionId = ref('appearance')
  
  const saving = ref(false)
  
  const modelSaving = ref(false)
  
  const modelCatalog = ref<ModelOption[]>([])
  
  const selectedModelIds = ref<string[]>([])
  
  const modelFetchBusy = ref(false)
  
  const modelFetchError = ref('')
  
  const modelTestStates = ref<Record<string, ModelTestState>>({})
  
  const balanceStates = ref<Record<string, BalanceState>>({})
  
  const balanceRefreshingAll = ref(false)
  
  const appVersion = ref(BUNDLED_APP_VERSION)
  
  const updateStatus = ref('idle')
  
  const updateInfo = ref<UpdateCheckState | null>(null)
  
  const updateProgress = ref<number | null>(null)
  
  const updateError = ref('')
  
  const backupInput = ref<HTMLInputElement | null>(null)
  
  const backupStatus = ref('')
  
  const selectedImageModelIds = ref<string[]>([])
  
  const shortcutRecording = ref(false)
  
  const shortcutError = ref('')
  
  const exportDirectoryBusy = ref(false)
  
  const providerOptions: ProviderOption[] = [
    { key: 'doubao', label: '豆包', mark: '豆', icon: doubaoIcon, baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
    { key: 'qwen', label: '千问', mark: '千', icon: qwenIcon, baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    { key: 'zhipu', label: '智谱', mark: '智', icon: zhipuIcon, baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
    { key: 'deepseek', label: 'DeepSeek', mark: 'DS', icon: deepseekIcon, baseUrl: 'https://api.deepseek.com' },
    { key: 'kimi', label: 'Kimi', mark: 'K', icon: kimiIcon, baseUrl: 'https://api.moonshot.cn/v1' },
    { key: 'minimax', label: 'MiniMax', mark: 'M', icon: minimaxIcon, baseUrl: 'https://api.minimaxi.com/v1' },
    { key: 'custom', label: 'OpenAI 兼容服务', mark: 'AI', icon: otherIcon, baseUrl: '' }
  ]
  
  const endpointOptions: EndpointOption[] = [
    { key: 'openaiResponses', label: 'OpenAI Responses', description: 'POST /responses' },
    { key: 'openaiChat', label: 'OpenAI Chat', description: 'POST /chat/completions' },
    { key: 'anthropicMessages', label: 'Anthropic', description: 'POST /messages' }
  ]
  
  const themeOptions = computed<ThemeOption[]>(() => [
    { value: 'system', label: t('system'), icon: Monitor },
    { value: 'light', label: t('light'), icon: Sun },
    { value: 'dark', label: t('dark'), icon: Moon }
  ])
  
  const languageOptions = computed<LanguageOption[]>(() => [
    { value: 'zh-CN', label: '简体中文' },
    { value: 'en', label: 'English' }
  ])
  
  const currentLanguageLabel = computed(() => languageOptions.value.find(option => option.value === settings.value.language)?.label || '简体中文')
  
  const editorModeShortcutParts = computed(() => shortcutDisplayParts(editorModeShortcut.value))
  
  const settingsSections = computed(() => [
    { id: 'appearance', label: t('appearance'), description: t('appearanceHint'), icon: Palette },
    { id: 'shortcuts', label: t('shortcutSettings'), description: t('shortcutSettingsHint'), icon: Keyboard },
    { id: 'files', label: t('fileSaveLocation'), description: t('fileSaveLocationHint'), icon: FolderDown },
    { id: 'ai', label: t('aiWriting'), description: t('aiWritingHint'), icon: Sparkles },
    { id: 'agent-tools', label: locale.value === 'zh-CN' ? 'Agent 工具（实验）' : 'Agent tools (Experimental)', description: locale.value === 'zh-CN' ? '查看实验能力和强制审批策略' : 'Inspect experimental capabilities and approval policies', icon: Wrench },
    { id: 'models', label: t('models'), description: t('modelsHint'), icon: Cpu },
    { id: 'about', label: t('about'), description: t('aboutHint'), icon: Info }
  ])
  
  const filteredSections = computed(() => {
    const query = searchQuery.value.trim().toLocaleLowerCase()
    if (!query) return settingsSections.value
    return settingsSections.value.filter(section => `${section.label} ${section.description}`.toLocaleLowerCase().includes(query))
  })
  
  const activeSection = computed(() => settingsSections.value.find(section => section.id === activeSectionId.value) || settingsSections.value[0])
  
  const selectedProvider = computed(() => providerOptions.find(option => option.key === draft.value?.providerKey) || providerOptions[3]!)
  
  const isEditingModel = computed(() => Boolean(draft.value?.id))
  
  const selectedEndpoint = computed(() => endpointOptions.find(option => option.key === draft.value?.endpointType) || endpointOptions[1]!)
  
  const selectedCatalogModels = computed(() => modelCatalog.value.filter(option => selectedModelIds.value.includes(option.id)))
  
  const canSaveModel = computed(() => Boolean(draft.value && (selectedModelIds.value.length || draft.value.model.trim())))
  
  const primaryModel = computed(() => models.value.find(model => model.isDefault) || models.value[0] || null)
  
  const imageModels = computed(() => models.value.filter(model => model.imageEnabled))
  
  const primaryImageModel = computed(() => imageModels.value.find(model => model.isImageDefault) || imageModels.value[0] || null)
  
  const modelConnections = computed(() => {
    const groups = new Map<string, ModelConnection>()
    for (const model of models.value) {
      const key = model.providerId || [model.provider, model.baseUrl, model.endpointType || 'openaiChat'].join('|')
      if (!groups.has(key)) groups.set(key, {
        id: key,
        name: model.connectionName || providerLabel(model),
        providerId: model.providerId || null,
        representative: model,
        models: []
      })
      groups.get(key)!.models.push(model)
    }
    return [...groups.values()]
  })
  
  const balanceModels = computed(() => {
    const byProvider = new Map<string, ModelProfile>()
    for (const model of models.value) {
      const provider = model.providerId || [model.provider, model.baseUrl, model.endpointType || 'openaiChat'].join('|')
      const current = byProvider.get(provider)
      if (!current || (model.isDefault && !current.isDefault)) byProvider.set(provider, model)
    }
    return [...byProvider.values()]
  })
  
  const updateButtonLabel = computed(() => {
    const chinese = locale.value === 'zh-CN'
    if (updateStatus.value === 'checking') return chinese ? '检查中…' : 'Checking…'
    if (updateStatus.value === 'available') return chinese ? '下载并安装' : 'Download and install'
    if (updateStatus.value === 'downloading') return updateProgress.value == null ? (chinese ? '下载中…' : 'Downloading…') : `${updateProgress.value}%`
    if (updateStatus.value === 'manual') return chinese ? '重新检查' : 'Check again'
    return chinese ? '检查更新' : 'Check for updates'
  })
  
  const updateMessage = computed(() => {
    const chinese = locale.value === 'zh-CN'
    if (updateStatus.value === 'latest') return chinese ? '当前已是最新版本。' : 'You are up to date.'
    if (updateStatus.value === 'unsupported') return chinese ? '浏览器预览不支持在线升级，请在桌面应用中检查。' : 'Updates are only available in the desktop app.'
    if (updateStatus.value === 'manual') return chinese ? '安装包已打开，请完成安装后重新启动 Tiny Note。' : 'The installer is open. Finish installation, then restart Tiny Note.'
    if (updateStatus.value === 'error') return updateError.value
    return ''
  })
  
  function emptyDraft(): ModelDraft {
    const provider = providerOptions[3]!
    return { id: '', providerId: crypto.randomUUID(), connectionName: provider.label, name: '', providerKey: provider.key, provider: provider.label, baseUrl: provider.baseUrl, model: '', endpointType: 'openaiChat', isDefault: models.value.length === 0, apiKey: '' }
  }
  
  async function save() {
    saving.value = true
    try {
      await appStore.saveSettings({ ...settings.value })
    } finally {
      saving.value = false
    }
  }
  
  async function selectTheme(value: AppSettings['theme']) {
    settings.value.theme = value
    await save()
  }
  
  async function selectLanguage(value: AppSettings['language']) {
    settings.value.language = value
    locale.value = value
    showLanguageDropdown.value = false
    await save()
  }
  
  async function chooseDefaultExportDirectory() {
    if (exportDirectoryBusy.value) return
    exportDirectoryBusy.value = true
    try {
      const directory = await pickNativeExportDirectory(settings.value.exportDirectory)
      if (!directory) return
      await appStore.saveSettings({ ...settings.value, exportDirectory: directory })
      showToast(t('exportLocationSaved'))
    } catch (error) {
      showToast(errorMessage(error, t('htmlExportFailed')), { tone: 'error' })
    } finally {
      exportDirectoryBusy.value = false
    }
  }
  
  async function clearDefaultExportDirectory() {
    if (exportDirectoryBusy.value) return
    exportDirectoryBusy.value = true
    try {
      await appStore.saveSettings({ ...settings.value, exportDirectory: '' })
      showToast(t('exportLocationCleared'))
    } finally {
      exportDirectoryBusy.value = false
    }
  }
  
  function beginShortcutRecording() {
    shortcutError.value = ''
    shortcutRecording.value = true
  }
  
  function cancelShortcutRecording() {
    shortcutRecording.value = false
    shortcutError.value = ''
  }
  
  function recordEditorModeShortcut(event: KeyboardEvent) {
    if (!shortcutRecording.value) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') {
      cancelShortcutRecording()
      return
    }
    const shortcut = shortcutFromKeyboardEvent(event)
    if (!shortcut) {
      shortcutError.value = t('shortcutRequiresModifier')
      return
    }
    appStore.setEditorModeShortcut(shortcut)
    shortcutRecording.value = false
    shortcutError.value = ''
  }
  
  function resetEditorModeShortcut() {
    appStore.resetEditorModeShortcut()
    cancelShortcutRecording()
  }
  
  function closeDropdowns() {
    showLanguageDropdown.value = false
    providerMenuOpen.value = false
    endpointMenuOpen.value = false
    primaryModelMenuOpen.value = false
    imagePrimaryModelMenuOpen.value = false
  }
  
  function selectSection(id: string) {
    activeSectionId.value = id
    closeDropdowns()
  }
  
  async function exportWorkspace() {
    backupStatus.value = ''
    try {
      const backup = await invoke('workspace_export')
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'tiny-note-backup-' + new Date().toISOString().slice(0, 10) + '.tnbackup.json'
      link.click()
      URL.revokeObjectURL(url)
      backupStatus.value = locale.value === 'zh-CN' ? '备份已导出；模型 API Key 不会包含在备份中。' : 'Backup exported; model API keys are not included.'
    } catch (error) {
      backupStatus.value = errorMessage(error, locale.value === 'zh-CN' ? '备份导出失败' : 'Backup export failed')
    }
  }
  
  async function restoreWorkspace(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      const backup = JSON.parse(await file.text()) as JsonValue
      const confirmed = await requestConfirmation({
        title: locale.value === 'zh-CN' ? '恢复工作区' : 'Restore workspace',
        message: locale.value === 'zh-CN' ? '恢复会替换当前笔记、知识库和设置。建议先导出当前备份，确定继续吗？' : 'Restore will replace current notes, libraries, and settings. Export a backup first. Continue?',
        tone: 'danger',
        confirmLabel: locale.value === 'zh-CN' ? '继续恢复' : 'Restore'
      })
      if (!confirmed) return
      await invoke('workspace_import', { request: { backup, replaceExisting: true } })
      backupStatus.value = locale.value === 'zh-CN' ? '恢复完成，正在重新加载…' : 'Restore complete. Reloading…'
      window.setTimeout(() => window.location.reload(), 250)
    } catch (error) {
      backupStatus.value = errorMessage(error, locale.value === 'zh-CN' ? '备份恢复失败' : 'Backup restore failed')
    }
  }
  
  function addModel() {
    draft.value = emptyDraft()
    modelCatalog.value = []
    selectedModelIds.value = []
    selectedImageModelIds.value = []
    modelFetchError.value = ''
    providerMenuOpen.value = false
  }
  
  function editModel(model: ModelProfile) {
    const provider = providerForModel(model)
    draft.value = {
      ...model,
      connectionName: model.connectionName || provider.label,
      providerKey: provider.key,
      provider: provider.label,
      name: model.name || '',
      endpointType: model.endpointType || 'openaiChat',
      apiKey: ''
    }
    modelCatalog.value = []
    selectedModelIds.value = []
    selectedImageModelIds.value = model.imageEnabled ? [model.model] : []
    modelFetchError.value = ''
    providerMenuOpen.value = false
    endpointMenuOpen.value = false
  }
  
  function editConnection(connection: ModelConnection) {
    editModel(connection.representative)
    if (draft.value) draft.value.connectionModels = connection.models
  }
  
  function cancelModel() {
    draft.value = null
    modelCatalog.value = []
    selectedModelIds.value = []
    selectedImageModelIds.value = []
    modelFetchError.value = ''
    providerMenuOpen.value = false
    endpointMenuOpen.value = false
  }
  
  function selectEndpoint(option: EndpointOption) {
    if (!draft.value) return
    draft.value.endpointType = option.key
    endpointMenuOpen.value = false
    modelCatalog.value = []
    selectedModelIds.value = []
    selectedImageModelIds.value = []
    modelFetchError.value = ''
  }
  
  function selectProvider(option: ProviderOption) {
    if (!draft.value) return
    draft.value.providerKey = option.key
    draft.value.provider = option.label
    draft.value.baseUrl = option.baseUrl
    draft.value.model = ''
    modelCatalog.value = []
    selectedModelIds.value = []
    selectedImageModelIds.value = []
    modelFetchError.value = ''
    providerMenuOpen.value = false
  }
  
  function toggleAllModels() {
    selectedModelIds.value = selectedModelIds.value.length === modelCatalog.value.length ? [] : modelCatalog.value.map(option => option.id)
  }
  
  function toggleCatalogModel(id: string) {
    selectedModelIds.value = selectedModelIds.value.includes(id)
      ? selectedModelIds.value.filter(item => item !== id)
      : [...selectedModelIds.value, id]
  }
  
  function toggleImageModel(id: string) {
    selectedImageModelIds.value = selectedImageModelIds.value.includes(id)
      ? selectedImageModelIds.value.filter(item => item !== id)
      : [...selectedImageModelIds.value, id]
    if (!selectedModelIds.value.includes(id)) selectedModelIds.value = [...selectedModelIds.value, id]
  }
  
  async function fetchModels() {
    const currentDraft = draft.value
    if (!currentDraft?.baseUrl.trim() || modelFetchBusy.value) return
    modelFetchBusy.value = true
    modelFetchError.value = ''
    try {
      modelCatalog.value = await invoke('model_fetch_models', { request: {
        provider: currentDraft.provider,
        profileId: currentDraft.id || null,
        baseUrl: currentDraft.baseUrl.trim(),
        endpointType: currentDraft.endpointType,
        apiKey: currentDraft.apiKey
      } })
      selectedModelIds.value = isEditingModel.value
        ? modelCatalog.value.filter(option => currentDraft.connectionModels?.some(model => model.model === option.id)).map(option => option.id)
        : []
      selectedImageModelIds.value = isEditingModel.value
        ? modelCatalog.value.filter(option => currentDraft.connectionModels?.some(model => model.model === option.id && model.imageEnabled)).map(option => option.id)
        : []
      if (!modelCatalog.value.length) modelFetchError.value = '没有获取到可用模型，请检查地址和 API Key。'
    } catch (error) {
      modelCatalog.value = []
      modelFetchError.value = errorMessage(error, '模型列表获取失败，请检查地址和 API Key。')
    } finally {
      modelFetchBusy.value = false
    }
  }
  
  async function saveModel() {
    const currentDraft = draft.value
    if (!currentDraft) return
    const selected = selectedCatalogModels.value.length ? selectedCatalogModels.value : (currentDraft.model.trim() ? [{ id: currentDraft.model.trim(), name: currentDraft.model.trim(), ownedBy: null }] : [])
    if (!selected.length) {
      modelFetchError.value = '请先获取模型列表并至少勾选一个模型。'
      return
    }
    modelSaving.value = true
    try {
      const options = selected
      const existingByModel = new Map<string, ModelProfile>((currentDraft.connectionModels || []).map((model: ModelProfile) => [model.model, model]))
      for (const [index, option] of options.entries()) {
        const editing = isEditingModel.value
        const existing = existingByModel.get(option.id)
        await invoke('model_upsert', {
          profile: {
            id: existing?.id || (editing && options.length === 1 ? currentDraft.id : crypto.randomUUID()),
            name: existing?.name || (options.length === 1 && currentDraft.name.trim()) || currentDraft.provider + ' ' + option.id,
            providerId: currentDraft.providerId,
            connectionName: currentDraft.connectionName.trim() || currentDraft.provider,
            provider: currentDraft.provider,
            baseUrl: currentDraft.baseUrl.trim(),
            model: option.id,
            endpointType: currentDraft.endpointType,
            isDefault: existing ? Boolean(existing.isDefault) : (editing ? false : models.value.length === 0 && index === 0),
            apiKeyConfigured: editing ? Boolean(currentDraft.apiKeyConfigured) : false,
            imageEnabled: currentDraft.endpointType !== 'anthropicMessages' && selectedImageModelIds.value.includes(option.id),
            isImageDefault: existing ? Boolean(existing.isImageDefault) && selectedImageModelIds.value.includes(option.id) : false
          },
          apiKey: currentDraft.apiKey
        })
      }
      if (isEditingModel.value && modelCatalog.value.length) {
        for (const existing of currentDraft.connectionModels || []) {
          if (!options.some(option => option.id === existing.model)) await invoke('model_delete', { id: existing.id })
        }
      }
      await appStore.refreshModels()
      cancelModel()
    } finally {
      modelSaving.value = false
    }
  }
  
  async function setPrimaryModel(model: ModelProfile | null) {
    if (!model || model.id === primaryModel.value?.id) {
      primaryModelMenuOpen.value = false
      return
    }
    modelSaving.value = true
    try {
      for (const item of models.value) {
        await invoke('model_upsert', { profile: { ...item, isDefault: item.id === model.id }, apiKey: null })
      }
      await appStore.refreshModels()
    } finally {
      modelSaving.value = false
      primaryModelMenuOpen.value = false
    }
  }
  
  async function setPrimaryImageModel(model: ModelProfile | null) {
    if (!model || model.id === primaryImageModel.value?.id) {
      imagePrimaryModelMenuOpen.value = false
      return
    }
    modelSaving.value = true
    try {
      for (const item of imageModels.value) {
        await invoke('model_upsert', { profile: { ...item, isImageDefault: item.id === model.id }, apiKey: null })
      }
      await appStore.refreshModels()
    } finally {
      modelSaving.value = false
      imagePrimaryModelMenuOpen.value = false
    }
  }
  
  async function requestModelDelete(model: ModelProfile) {
    const confirmed = await requestConfirmation({ title: '删除模型', message: `确定删除「${model.name}」吗？删除后需要重新配置才能使用。`, tone: 'danger', confirmLabel: '删除' })
    if (!confirmed) return
    try {
      await invoke('model_delete', { id: model.id })
      localStorage.removeItem(`tiny-note-context-consent:${model.id}`)
      await appStore.refreshModels()
      const next = { ...balanceStates.value }
      delete next[model.id]
      balanceStates.value = next
    } catch (error) {
      showToast(errorMessage(error, '删除失败，请重试'), { tone: 'error' })
    }
  }
  
  async function requestConnectionDelete(connection: ModelConnection) {
    const confirmed = await requestConfirmation({ title: '删除模型服务', message: `确定删除「${connection.name}」及其 ${connection.models.length} 个模型吗？`, tone: 'danger', confirmLabel: '删除服务' })
    if (!confirmed) return
    try {
      for (const model of connection.models) {
        await invoke('model_delete', { id: model.id })
        localStorage.removeItem(`tiny-note-context-consent:${model.id}`)
      }
      await appStore.refreshModels()
    } catch (error) {
      showToast(errorMessage(error, '删除失败，请重试'), { tone: 'error' })
    }
  }
  
  function providerForModel(model: ModelProfile): ProviderOption {
    const value = String(model?.provider || '').toLowerCase()
    return providerOptions.find(option => option.key === value || option.label.toLowerCase() === value || value.includes(option.key)) || providerOptions.at(-1)!
  }
  
  async function testModel(model: ModelProfile) {
    if (!model?.id || modelTestStates.value[model.id]?.loading) return
    modelTestStates.value = { ...modelTestStates.value, [model.id]: { loading: true, status: 'loading', message: '正在测试…' } }
    try {
      const result = await invoke('model_test', { modelId: model.id })
      const latency = Number(result?.latencyMs)
      modelTestStates.value = { ...modelTestStates.value, [model.id]: { loading: false, status: 'success', message: Number.isFinite(latency) ? `连接成功 · ${latency} ms` : (result?.message || '连接成功') } }
    } catch (error) {
      modelTestStates.value = { ...modelTestStates.value, [model.id]: { loading: false, status: 'error', message: errorMessage(error, '连接测试失败') } }
    }
  }
  
  function providerLabel(model: ModelProfile) { return modelProviderLabel(model.provider) }
  
  function endpointLabel(model: ModelProfile) { return endpointOptions.find(option => option.key === (model.endpointType || 'openaiChat'))?.label || 'OpenAI Chat' }
  
  function providerIcon(model: ModelProfile) {
    return providerForModel(model).icon
  }
  
  function isDeepSeek(model: ModelProfile) {
    return providerForModel(model).key === 'deepseek'
  }
  
  function formatBalance(value: unknown, currency = '') {
    const amount = Number(value) || 0
    return (currency || '¥') + amount.toFixed(2)
  }
  
  function formatBalanceTime(value?: string) {
    if (!value) return ''
    try {
      return new Intl.DateTimeFormat(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    } catch {
      return ''
    }
  }
  
  async function queryBalanceFor(model: ModelProfile) {
    if (!model || !isDeepSeek(model)) return
    balanceStates.value = { ...balanceStates.value, [model.id]: { loading: true } }
    try {
      const data = await invoke('model_query_balance', { modelId: model.id }) as BalanceData
      balanceStates.value = { ...balanceStates.value, [model.id]: { loading: false, data, updatedAt: data.updatedAt || new Date().toISOString() } }
    } catch (error) {
      balanceStates.value = { ...balanceStates.value, [model.id]: { loading: false, error: errorMessage(error, '余额查询失败') } }
    }
  }
  
  async function queryAllBalances() {
    const targets = balanceModels.value.filter(isDeepSeek)
    if (!targets.length || balanceRefreshingAll.value) return
    balanceRefreshingAll.value = true
    try {
      await Promise.all(targets.map(queryBalanceFor))
    } finally {
      balanceRefreshingAll.value = false
    }
  }
  
  async function checkForUpdates() {
    updateStatus.value = 'checking'
    updateInfo.value = null
    updateError.value = ''
    try {
      const result = await appUpdater.check({ force: true })
      if (!result.supported) updateStatus.value = 'unsupported'
      else if (!result.available) updateStatus.value = 'latest'
      else { updateInfo.value = result; updateStatus.value = 'available' }
    } catch (error) {
      updateError.value = errorMessage(error, locale.value === 'zh-CN' ? '检查更新失败，请稍后重试。' : 'Unable to check for updates.')
      updateStatus.value = 'error'
    }
  }
  
  async function installUpdate() {
    updateStatus.value = 'downloading'
    updateProgress.value = 0
    updateError.value = ''
    try {
      await appUpdater.downloadAndInstall(progress => { updateProgress.value = progress })
      updateStatus.value = 'manual'
    } catch (error) {
      updateError.value = errorMessage(error, locale.value === 'zh-CN' ? '更新安装失败，请稍后重试。' : 'Unable to install the update.')
      updateStatus.value = 'error'
    }
  }
  
  async function handleUpdateAction() {
    if (updateStatus.value === 'available') return installUpdate()
    if (updateStatus.value === 'manual') return checkForUpdates()
    return checkForUpdates()
  }
  
  onMounted(async () => {
    await appStore.initialize()
    locale.value = settings.value.language
    try { appVersion.value = await appUpdater.currentVersion(appVersion.value) } catch { /* keep the bundled fallback */ }
  })
  
  watch(() => settings.value.language, value => { if (value) locale.value = value })
  
  watch(filteredSections, sections => {
    if (searchQuery.value && !sections.some(section => section.id === activeSectionId.value)) activeSectionId.value = sections[0]?.id || 'appearance'
  })

  return {
    t, locale, appStore, settings, models, editorModeShortcut, draft, showLanguageDropdown,
    providerMenuOpen, endpointMenuOpen, primaryModelMenuOpen, imagePrimaryModelMenuOpen, searchQuery, activeSectionId, saving, modelSaving,
    modelCatalog, selectedModelIds, modelFetchBusy, modelFetchError, modelTestStates, balanceStates, balanceRefreshingAll, appVersion,
    updateStatus, updateInfo, updateProgress, updateError, backupInput, backupStatus, selectedImageModelIds, shortcutRecording,
    shortcutError, exportDirectoryBusy, providerOptions, endpointOptions, themeOptions, languageOptions, currentLanguageLabel, editorModeShortcutParts,
    settingsSections, filteredSections, activeSection, selectedProvider, isEditingModel, selectedEndpoint, selectedCatalogModels, canSaveModel,
    primaryModel, imageModels, primaryImageModel, modelConnections, balanceModels, updateButtonLabel, updateMessage, emptyDraft,
    save, selectTheme, selectLanguage, chooseDefaultExportDirectory, clearDefaultExportDirectory, beginShortcutRecording, cancelShortcutRecording, recordEditorModeShortcut,
    resetEditorModeShortcut, closeDropdowns, selectSection, exportWorkspace, restoreWorkspace, addModel, editModel, editConnection,
    cancelModel, selectEndpoint, selectProvider, toggleAllModels, toggleCatalogModel, toggleImageModel, fetchModels, saveModel,
    setPrimaryModel, setPrimaryImageModel, requestModelDelete, requestConnectionDelete, providerForModel, testModel, providerLabel, endpointLabel,
    providerIcon, isDeepSeek, formatBalance, formatBalanceTime, queryBalanceFor, queryAllBalances, checkForUpdates, installUpdate,
    handleUpdateAction
  }
}

export type SettingsWorkspace = ReturnType<typeof useSettingsWorkspace>
