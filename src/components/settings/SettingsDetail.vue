<script lang="ts">
import { defineComponent, type PropType } from 'vue'
import { AlertCircle, Check, ChevronDown, ChevronRight, FlaskConical, FolderOpen, Globe2, Languages, LoaderCircle, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-vue-next'
import AgentToolsCatalog from '../AgentToolsCatalog.vue'
import type { SettingsWorkspace } from '../../composables/useSettingsWorkspace'

export default defineComponent({
  name: 'SettingsDetail',
  components: { AlertCircle, Check, ChevronDown, ChevronRight, FlaskConical, FolderOpen, Globe2, Languages, LoaderCircle, Pencil, Plus, RefreshCw, Trash2, AgentToolsCatalog },
  props: { workspace: { type: Object as PropType<SettingsWorkspace>, required: true } },
  setup: props => props.workspace
})
</script>

<template>
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

          <section v-else-if="activeSectionId === 'shortcuts'" class="settings-detail-section settings-shortcuts-section">
            <div class="settings-section-kicker">{{ t('editorShortcuts') }}</div>
            <div class="settings-setting-row settings-shortcut-row">
              <div class="settings-setting-copy"><strong>{{ t('editorModeShortcut') }}</strong><span>{{ t('editorModeShortcutHint') }}</span></div>
              <div class="settings-shortcut-control" @click.stop>
                <button
                  type="button"
                  class="settings-shortcut-recorder"
                  :class="{ recording: shortcutRecording }"
                  :aria-pressed="shortcutRecording"
                  aria-describedby="editor-mode-shortcut-help"
                  @click="beginShortcutRecording"
                  @keydown="recordEditorModeShortcut"
                  @blur="cancelShortcutRecording"
                >
                  <span v-if="shortcutRecording">{{ t('pressShortcut') }}</span>
                  <template v-else><kbd v-for="part in editorModeShortcutParts" :key="part">{{ part }}</kbd></template>
                </button>
                <button type="button" class="settings-shortcut-reset" @click="resetEditorModeShortcut">{{ t('resetShortcut') }}</button>
                <span id="editor-mode-shortcut-help" class="settings-shortcut-status" :class="{ error: shortcutError }" role="status" aria-live="polite">{{ shortcutError || t('recordShortcut') }}</span>
              </div>
            </div>
          </section>

          <section v-else-if="activeSectionId === 'files'" class="settings-detail-section settings-files-section">
            <div class="settings-section-kicker">{{ t('fileSaveLocation') }}</div>
            <div class="settings-setting-row settings-export-directory-row">
              <div class="settings-setting-copy"><strong>{{ t('defaultExportDirectory') }}</strong><span>{{ t('fileSaveLocationHint') }}</span></div>
              <div class="settings-export-directory-control">
                <div data-testid="export-directory-path" class="settings-export-directory-path" :title="settings.exportDirectory || t('chooseEveryExport')"><FolderOpen :size="15" /><span>{{ settings.exportDirectory || t('chooseEveryExport') }}</span></div>
                <div class="settings-export-directory-actions">
                  <button data-testid="choose-export-directory" type="button" class="settings-fetch-button" :disabled="exportDirectoryBusy" @click="chooseDefaultExportDirectory"><LoaderCircle v-if="exportDirectoryBusy" class="spinning" :size="14" /><FolderOpen v-else :size="14" />{{ settings.exportDirectory ? t('changeFolder') : t('selectFolder') }}</button>
                  <button v-if="settings.exportDirectory" data-testid="clear-export-directory" type="button" class="settings-shortcut-reset" :disabled="exportDirectoryBusy" @click="clearDefaultExportDirectory">{{ t('clearFolder') }}</button>
                </div>
              </div>
            </div>
            <p class="settings-inline-note">{{ t('chooseExportLocationHint') }}</p>
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
                  <span v-if="primaryModel" class="settings-primary-model"><img :src="providerIcon(primaryModel)" :alt="providerLabel(primaryModel)" class="provider-icon-image" /><span><b>{{ primaryModel.name }}</b><small>{{ providerLabel(primaryModel) }} · {{ endpointLabel(primaryModel) }} · {{ primaryModel.model }}</small></span></span>
                  <span v-else class="settings-primary-empty">{{ t('noModels') }}</span>
                  <ChevronDown :size="15" :class="{ expanded: primaryModelMenuOpen }" />
                </button>
                <div v-if="primaryModelMenuOpen" class="settings-primary-menu" @click.stop>
                  <button v-for="model in models" :key="model.id" type="button" :class="{ active: model.id === primaryModel?.id }" @click="setPrimaryModel(model)">
                    <img :src="providerIcon(model)" :alt="model.provider" class="provider-icon-image" /><span><b>{{ model.name }}</b><small>{{ model.model }}</small></span><Check v-if="model.id === primaryModel?.id" :size="15" />
                  </button>
                  <span v-if="!models.length" class="settings-primary-menu-empty">{{ t('noModels') }}</span>
                </div>
              </div>
            </div>
            <div class="settings-model-primary-row settings-image-primary-row">
              <strong>首选生图模型</strong>
              <div class="settings-primary-select-wrap">
                <button type="button" class="settings-primary-select" @click.stop="imagePrimaryModelMenuOpen = !imagePrimaryModelMenuOpen; primaryModelMenuOpen = false">
                  <span v-if="primaryImageModel" class="settings-primary-model"><img :src="providerIcon(primaryImageModel)" :alt="providerLabel(primaryImageModel)" class="provider-icon-image" /><span><b>{{ primaryImageModel.name }}</b><small>{{ providerLabel(primaryImageModel) }} · {{ primaryImageModel.model }}</small></span></span>
                  <span v-else class="settings-primary-empty">请先勾选生图模型</span>
                  <ChevronDown :size="15" :class="{ expanded: imagePrimaryModelMenuOpen }" />
                </button>
                <div v-if="imagePrimaryModelMenuOpen" class="settings-primary-menu" @click.stop>
                  <button v-for="model in imageModels" :key="model.id" type="button" :class="{ active: model.id === primaryImageModel?.id }" @click="setPrimaryImageModel(model)">
                    <img :src="providerIcon(model)" :alt="model.provider" class="provider-icon-image" /><span><b>{{ model.name }}</b><small>{{ model.model }}</small></span><Check v-if="model.id === primaryImageModel?.id" :size="15" />
                  </button>
                  <span v-if="!imageModels.length" class="settings-primary-menu-empty">请先在下方模型列表勾选“生图”</span>
                </div>
              </div>
            </div>
            <div class="settings-subheading">模型服务</div>
            <button type="button" class="settings-add-model-row" @click="addModel"><Plus :size="17" /><span>添加模型服务</span><ChevronRight :size="15" /></button>
            <div v-if="modelConnections.length" class="settings-connection-list">
              <article v-for="connection in modelConnections" :key="connection.id" class="settings-connection-card">
                <header class="settings-connection-head">
                  <img :src="providerIcon(connection.representative)" :alt="providerLabel(connection.representative)" class="provider-icon-image" />
                  <div class="settings-model-card-copy"><strong>{{ connection.name }}</strong><small>{{ providerLabel(connection.representative) }} · {{ endpointLabel(connection.representative) }} · {{ connection.representative.baseUrl }}</small></div>
                  <span class="settings-model-status">{{ connection.models.length }} 个模型 · {{ connection.representative.apiKeyConfigured ? t('configured') : t('notConfigured') }}</span>
                  <button type="button" class="model-edit-btn" title="编辑模型服务" aria-label="编辑模型服务" @click="editConnection(connection)"><Pencil :size="15" /></button>
                  <button type="button" class="model-delete-btn" title="删除模型服务" aria-label="删除模型服务" @click="requestConnectionDelete(connection)"><Trash2 :size="16" /></button>
                </header>
                <div class="settings-connection-models">
                  <div v-for="model in connection.models" :key="model.id" class="settings-connection-model-row">
                    <div class="settings-model-card-copy"><strong>{{ model.model || model.name }}</strong><span v-if="modelTestStates[model.id]" class="settings-model-test-result" :class="`is-${modelTestStates[model.id]?.status}`"><Check v-if="modelTestStates[model.id]?.status === 'success'" :size="11" /><AlertCircle v-else-if="modelTestStates[model.id]?.status === 'error'" :size="11" /><LoaderCircle v-else class="spinning" :size="11" />{{ modelTestStates[model.id]?.message }}</span></div>
                    <span v-if="model.isDefault" class="settings-model-default-badge">首选</span><span v-if="model.imageEnabled" class="settings-image-enabled-badge">生图</span><span v-if="model.isImageDefault" class="settings-image-default-badge">首选生图</span>
                    <button v-if="model.apiKeyConfigured" type="button" class="model-test-btn" :disabled="modelTestStates[model.id]?.loading" title="测试模型连接" aria-label="测试模型连接" @click="testModel(model)"><LoaderCircle v-if="modelTestStates[model.id]?.loading" class="spinning" :size="15" /><FlaskConical v-else :size="15" /></button>
                    <button type="button" class="model-delete-btn" title="移除模型" aria-label="移除模型" @click="requestModelDelete(model)"><Trash2 :size="15" /></button>
                  </div>
                </div>
              </article>
            </div>
            <div v-else class="settings-empty settings-empty-large">{{ t('noModels') }}</div>
            <div class="settings-subheading settings-balance-heading"><span>账户余额</span><button type="button" class="settings-balance-refresh-all" :disabled="balanceRefreshingAll || !balanceModels.some(isDeepSeek)" @click="queryAllBalances"><RefreshCw :size="14" :class="{ spinning: balanceRefreshingAll }" />刷新全部</button></div>
            <div v-if="balanceModels.length" class="settings-balance-list">
              <article v-for="model in balanceModels" :key="'balance-' + (model.providerId || model.id)" class="settings-balance-card">
                <header class="settings-balance-card-head">
                  <img :src="providerIcon(model)" :alt="model.provider" class="provider-icon-image" />
                  <div class="settings-balance-card-copy"><strong>{{ model.name }}</strong><small>{{ providerLabel(model) }}</small></div>
                  <button type="button" class="settings-balance-query" :disabled="!isDeepSeek(model) || balanceStates[model.id]?.loading" @click="queryBalanceFor(model)"><RefreshCw v-if="balanceStates[model.id]?.loading" :size="13" class="spinning" /><span v-else>查询余额</span></button>
                </header>
                <div v-if="!isDeepSeek(model)" class="settings-balance-muted">该厂商暂不提供标准余额接口</div>
                <div v-else-if="balanceStates[model.id]?.error" class="settings-balance-error">{{ balanceStates[model.id].error }}</div>
                <div v-else-if="balanceStates[model.id]?.data?.supported === false" class="settings-balance-muted">{{ balanceStates[model.id]?.data?.error || '余额查询需要桌面端凭据服务' }}</div>
                <div v-else-if="balanceStates[model.id]?.data" class="settings-balance-values">
                  <div class="settings-balance-total"><small>总余额</small><strong>{{ formatBalance(balanceStates[model.id]?.data?.totalBalance, balanceStates[model.id]?.data?.currency) }}</strong></div>
                  <div><small>赠金余额</small><strong>{{ formatBalance(balanceStates[model.id]?.data?.grantedBalance, balanceStates[model.id]?.data?.currency) }}</strong></div>
                  <div><small>充值余额</small><strong>{{ formatBalance(balanceStates[model.id]?.data?.toppedUpBalance, balanceStates[model.id]?.data?.currency) }}</strong></div>
                  <span class="settings-balance-updated">更新于 {{ formatBalanceTime(balanceStates[model.id]?.updatedAt) }}</span>
                </div>
              </article>
            </div>
          </section>

          <section v-else-if="activeSectionId === 'agent-tools'" class="settings-detail-section settings-agent-tools-section">
            <div class="settings-section-kicker">工具与权限 · 实验功能</div>
            <p class="settings-inline-note">Tiny Agent、MCP 和隔离脚本仍处于实验阶段；涉及写入、删除或外部调用的操作会按策略请求审批。</p>
            <AgentToolsCatalog />
          </section>

          <section v-else class="settings-detail-section settings-about-section">
            <div class="settings-section-kicker">{{ t('about') }}</div>
            <div class="settings-setting-row"><div class="settings-setting-copy"><strong>{{ t('appName') }}</strong><span>{{ t('localFirstHint') }}</span></div><span class="settings-value">v{{ appVersion }}</span></div>
            <div class="settings-setting-row settings-update-row">
              <div class="settings-setting-copy">
                <strong>{{ locale === 'zh-CN' ? '软件更新' : 'Software update' }}</strong>
                <span v-if="updateInfo">{{ locale === 'zh-CN' ? `发现 Tiny Note v${updateInfo.version}` : `Tiny Note v${updateInfo.version} is available` }}</span>
                <span v-else>{{ locale === 'zh-CN' ? '通过 GitHub Release 获取并校验 SHA-256 的更新包。' : 'Updates are downloaded from GitHub Releases and verified with SHA-256.' }}</span>
                <small v-if="updateMessage" :class="{ error: updateStatus === 'error' }" role="status">{{ updateMessage }}</small>
                <small v-if="updateInfo?.body" class="settings-update-notes">{{ updateInfo.body }}</small>
              </div>
              <button type="button" class="settings-action-button" :class="{ primary: updateStatus === 'available' || updateStatus === 'manual' }" :disabled="updateStatus === 'checking' || updateStatus === 'downloading' || updateStatus === 'unsupported'" @click="handleUpdateAction">
                <RefreshCw :size="14" :class="{ spinning: updateStatus === 'checking' || updateStatus === 'downloading' }" />{{ updateButtonLabel }}
              </button>
            </div>
            <div class="settings-setting-row"><div class="settings-setting-copy"><strong>{{ t('localFirst') }}</strong><span>{{ t('noteScope') }}</span></div><Globe2 :size="17" class="settings-value-icon" /></div>
            <div class="settings-subheading">数据备份与恢复</div>
            <div class="settings-setting-row">
              <div class="settings-setting-copy"><strong>工作区备份</strong><span>导出笔记、知识库文件、标签、链接和设置；模型 API Key 不会写入备份。</span><small v-if="backupStatus" role="status">{{ backupStatus }}</small></div>
              <div class="settings-inline-actions"><button type="button" class="settings-action-button" @click="exportWorkspace">导出备份</button><button type="button" class="settings-action-button" @click="backupInput?.click()">恢复备份</button><input ref="backupInput" type="file" hidden accept=".json,.tnbackup" @change="restoreWorkspace" /></div>
            </div>
          </section>
        </div>
      </main>
</template>
