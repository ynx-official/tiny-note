<script setup lang="ts">
import SettingsNavigation from '../components/settings/SettingsNavigation.vue'
import SettingsDetail from '../components/settings/SettingsDetail.vue'
import SettingsModelDialog from '../components/settings/SettingsModelDialog.vue'
import { useSettingsWorkspace } from '../composables/useSettingsWorkspace'

const workspace = useSettingsWorkspace()
const { t, locale, appStore, settings, models, editorModeShortcut, draft, showLanguageDropdown, providerMenuOpen, endpointMenuOpen, primaryModelMenuOpen, imagePrimaryModelMenuOpen, searchQuery, activeSectionId, saving, modelSaving, modelCatalog, selectedModelIds, modelFetchBusy, modelFetchError, modelTestStates, balanceStates, balanceRefreshingAll, appVersion, updateStatus, updateInfo, updateProgress, updateError, backupInput, backupStatus, selectedImageModelIds, shortcutRecording, shortcutError, exportDirectoryBusy, providerOptions, endpointOptions, themeOptions, languageOptions, currentLanguageLabel, editorModeShortcutParts, settingsSections, filteredSections, activeSection, selectedProvider, isEditingModel, selectedEndpoint, selectedCatalogModels, canSaveModel, primaryModel, imageModels, primaryImageModel, modelConnections, balanceModels, updateButtonLabel, updateMessage, emptyDraft, save, selectTheme, selectLanguage, chooseDefaultExportDirectory, clearDefaultExportDirectory, beginShortcutRecording, cancelShortcutRecording, recordEditorModeShortcut, resetEditorModeShortcut, closeDropdowns, selectSection, exportWorkspace, restoreWorkspace, addModel, editModel, editConnection, cancelModel, selectEndpoint, selectProvider, toggleAllModels, toggleCatalogModel, toggleImageModel, fetchModels, saveModel, setPrimaryModel, setPrimaryImageModel, requestModelDelete, requestConnectionDelete, providerForModel, testModel, providerLabel, endpointLabel, providerIcon, isDeepSeek, formatBalance, formatBalanceTime, queryBalanceFor, queryAllBalances, checkForUpdates, installUpdate, handleUpdateAction } = workspace
</script>

<template>
  <div class="settings-page" @click="workspace.closeDropdowns">
    <div class="settings-shell">
      <SettingsNavigation :workspace="workspace" />
      <SettingsDetail :workspace="workspace" />
    </div>
    <SettingsModelDialog :workspace="workspace" />
  </div>
</template>
