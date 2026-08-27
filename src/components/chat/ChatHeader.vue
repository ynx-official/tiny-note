<script setup lang="ts">
import { ArrowLeft, NotebookPen, Plus } from 'lucide-vue-next'
import type { ChatWorkspace } from '../../composables/useChatWorkspace'

const { workspace } = defineProps<{ workspace: ChatWorkspace }>()
const { fromHome, goBack, tinyAgentAvatar, conversationTitle, currentMode, selectedModel, modelProviderLabel, isBusy, messages, tasksStore, conversationId, summarizeConversation, newChat } = workspace
</script>

<template>
  <header class="chat-page-header">
    <div class="chat-page-header-side"><button v-if="fromHome" type="button" class="chat-page-back" title="返回首页" @click="goBack"><ArrowLeft :size="17" /><span>返回</span></button></div>
    <div class="chat-page-title"><span class="chat-page-avatar tiny-agent-avatar"><img class="tiny-agent-avatar-image" :src="tinyAgentAvatar" alt="" /></span><div><strong>{{ conversationTitle === '新对话' ? 'Tiny Agent' : conversationTitle }}</strong><small>{{ currentMode === 'agent' ? 'Tiny Agent · ' : '' }}{{ selectedModel ? `${modelProviderLabel(selectedModel.provider)} · ${selectedModel.model}` : 'Tiny Note 助手' }}</small></div></div>
    <div class="chat-page-header-side is-right"><button type="button" class="chat-page-summary" :disabled="isBusy || messages.length < 2 || Boolean(tasksStore.activeSummaryForConversation(conversationId))" title="将当前对话总结并保存为笔记" @click="summarizeConversation"><NotebookPen :size="15" /><span>{{ tasksStore.activeSummaryForConversation(conversationId) ? '正在后台总结' : '总结为笔记' }}</span></button><button type="button" class="chat-page-icon" title="新对话" @click="newChat"><Plus :size="18" /></button></div>
  </header>
</template>
