<script setup lang="ts">
import ChatHeader from '../components/chat/ChatHeader.vue'
import ChatMessageStream from '../components/chat/ChatMessageStream.vue'
import ChatComposer from '../components/chat/ChatComposer.vue'
import { useChatWorkspace } from '../composables/useChatWorkspace'

const workspace = useChatWorkspace()
const { route, router, notesStore, library, appStore, tasksStore, models, messages, draft, references, selectedModelId, thinkingMode, busy, streamingText, error, requestId, messagesRef, conversationId, conversationTitle, referenceMenuOpen, responseSources, responseProposal, pendingSummary, savedNote, currentMode, modeSaving, agentSegments, currentAgentRunId, pendingApproval, pendingInput, agentTools, approvalBusy, approvalError, responseFinalizing, agentTextSequence, fromHome, selectedModel, agentApprovalCount, isBusy, scrollToBottom, ensureConversation, saveMessage, pushResponse, completeResponse, mapAgentStep, appendAgentText, finishStreamingAgentText, hasAgentText, agentMessageTail, markActiveAgentSteps, retainInterruptedAgentRun, parseInputResponse, ensureContextConsent, noteHtml, noteTitle, createNoteFromText, refreshDataAfterAgent, saveAssistantAsNote, openSavedNote, addAssistantNotice, performNoteCommand, createResponseChannel, decideApproval, sendMessage, submit, summarizeConversation, stop, respondInput, goBack, newChat, toggleReferenceMenu, addNoteReference, addFileReference, removeReference, reviewProposal, copyMessage, loadConversation, handleDeleted, selectMode, toolLabels, toolLabel, jsonStringField, toolEventLabel, toolEventTitle, formatToolDetail, modelProviderLabel, tinyAgentAvatar } = workspace
</script>

<template>
  <div class="chat-page">
    <ChatHeader :workspace="workspace" />
    <ChatMessageStream :workspace="workspace" />
    <ChatComposer :workspace="workspace" />
  </div>
</template>
