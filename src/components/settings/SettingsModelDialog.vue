<script setup lang="ts">
import { Check, ChevronDown, RefreshCw, X } from 'lucide-vue-next'
import type { SettingsWorkspace } from '../../composables/useSettingsWorkspace'

const props = defineProps<{ workspace: SettingsWorkspace }>()
const workspace = props.workspace
const { draft, isEditingModel, cancelModel, providerMenuOpen, primaryModelMenuOpen, selectedProvider, providerOptions, selectProvider, endpointMenuOpen, selectedEndpoint, endpointOptions, selectEndpoint, t, modelFetchBusy, fetchModels, modelFetchError, modelCatalog, selectedModelIds, selectedImageModelIds, toggleCatalogModel, toggleImageModel, toggleAllModels, saveModel, modelSaving, canSaveModel, locale } = workspace
</script>

<template>
    <div v-if="draft" class="settings-model-modal-backdrop">
      <section class="settings-model-modal" role="dialog" aria-modal="true" :aria-label="isEditingModel ? '编辑模型服务' : '添加模型服务'">
        <header class="settings-model-modal-header"><strong>{{ isEditingModel ? '编辑模型服务' : '添加模型服务' }}</strong><button type="button" aria-label="关闭" @click="cancelModel"><X :size="20" /></button></header>
        <div class="settings-model-modal-body">
          <label class="settings-modal-label">模型厂商</label>
          <div class="settings-provider-control">
            <button type="button" class="settings-provider-trigger" @click.stop="providerMenuOpen = !providerMenuOpen; primaryModelMenuOpen = false">
              <img :src="selectedProvider.icon" :alt="selectedProvider.label" class="provider-icon-image" /><span>{{ selectedProvider.label }}</span><ChevronDown :size="15" :class="{ expanded: providerMenuOpen }" />
            </button>
            <div v-if="providerMenuOpen" class="settings-provider-menu" @click.stop>
              <button v-for="option in providerOptions" :key="option.key" type="button" :class="{ active: option.key === draft.providerKey }" @click="selectProvider(option)"><img :src="option.icon" :alt="option.label" class="provider-icon-image" /><span>{{ option.label }}</span><Check v-if="option.key === draft.providerKey" :size="15" /></button>
            </div>
          </div>
          <p v-if="selectedProvider.key === 'custom'" class="settings-provider-note">连接实现 OpenAI 兼容协议的服务；实际生成端点由下方“端点类型”决定。</p>
          <label class="settings-modal-label settings-endpoint-label">端点类型</label>
          <div class="settings-endpoint-control">
            <button type="button" class="settings-endpoint-trigger" @click.stop="endpointMenuOpen = !endpointMenuOpen; providerMenuOpen = false">
              <span class="settings-endpoint-symbol">◎</span><span><b>{{ selectedEndpoint.label }}</b><small>{{ selectedEndpoint.description }}</small></span><ChevronDown :size="15" :class="{ expanded: endpointMenuOpen }" />
            </button>
            <div v-if="endpointMenuOpen" class="settings-endpoint-menu" @click.stop>
              <button v-for="option in endpointOptions" :key="option.key" type="button" :class="{ active: option.key === draft.endpointType }" @click="selectEndpoint(option)">
                <span class="settings-endpoint-symbol" :class="`is-${option.key}`">{{ option.key === 'anthropicMessages' ? '✳' : '◎' }}</span><span><b>{{ option.label }}</b><small>{{ option.description }}</small></span><Check v-if="option.key === draft.endpointType" :size="15" />
              </button>
            </div>
          </div>
          <div class="settings-modal-form-grid">
            <label><span>连接名称</span><input v-model="draft.connectionName" name="profile-name" type="text" placeholder="例如：公司网关" /></label>
            <label><span>{{ t('baseUrl') }}</span><input v-model="draft.baseUrl" name="base-url" type="url" placeholder="https://api.example.com/v1" /></label>
            <label><span>{{ t('apiKey') }}</span><input v-model="draft.apiKey" name="api-key" type="password" :placeholder="isEditingModel && draft.apiKeyConfigured ? '留空保留已保存的 API Key' : t('apiKey')" autocomplete="new-password" /><small v-if="isEditingModel && draft.apiKeyConfigured" class="settings-key-hint">已保存的 Key 不会回显；留空时获取模型和保存都会继续使用原 Key。</small></label>
          </div>
          <div class="settings-fetch-row"><span>从 {{ draft.baseUrl || '接口地址' }}/models 获取可用模型；获取后可勾选“生图”能力</span><button type="button" class="settings-fetch-button" :disabled="modelFetchBusy || !draft.baseUrl.trim()" @click="fetchModels"><RefreshCw :size="14" :class="{ spinning: modelFetchBusy }" />{{ modelFetchBusy ? '获取中…' : '获取模型列表' }}</button></div>
          <p v-if="modelFetchError" class="settings-model-error">{{ modelFetchError }}</p>
          <div v-if="modelCatalog.length" class="settings-model-picker">
            <div class="settings-model-picker-header"><span>选择模型 <small>已选 {{ selectedModelIds.length }} 个 · 生图 {{ selectedImageModelIds.length }} 个</small></span><button type="button" @click="toggleAllModels">{{ selectedModelIds.length === modelCatalog.length ? '取消全选' : '全选' }}</button></div>
            <div v-for="option in modelCatalog" :key="option.id" class="settings-model-check-row"><label class="settings-model-check-main"><input :checked="selectedModelIds.includes(option.id)" type="checkbox" :value="option.id" @change="toggleCatalogModel(option.id)" /><span class="settings-model-check"></span><span><b>{{ option.name || option.id }}</b><small>{{ option.id }}<template v-if="option.ownedBy"> · {{ option.ownedBy }}</template></small></span></label><label v-if="draft.endpointType !== 'anthropicMessages'" class="settings-image-model-toggle" title="允许此模型用于生图"><input :checked="selectedImageModelIds.includes(option.id)" type="checkbox" @change="toggleImageModel(option.id)" /><span>生图</span></label></div>
          </div>
          <label v-if="!modelCatalog.length" class="settings-custom-model-field"><span>模型 ID</span><input v-model="draft.model" name="model-id" type="text" placeholder="例如 gpt-4.1-mini" /></label>
          <p class="settings-modal-hint">自定义配置，请遵守法规并关注模型使用 Token 消耗。</p>
        </div>
        <footer class="settings-model-modal-footer"><button type="button" class="settings-text-button" @click="cancelModel">{{ t('cancel') }}</button><button type="button" class="settings-action-button primary settings-model-save-button" :disabled="modelSaving || !canSaveModel" :aria-disabled="modelSaving || !canSaveModel" @click="saveModel">{{ modelSaving ? t('saving') : (isEditingModel ? '保存修改' : (locale === 'zh-CN' ? '保存' : 'Save')) }}</button></footer>
      </section>
    </div>
</template>
