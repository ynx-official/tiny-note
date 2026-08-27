<script setup lang="ts">
import { ChevronDown, Copy, FileText, LoaderCircle, Save, Wrench, X } from 'lucide-vue-next'
import AgentInputCard from '../AgentInputCard.vue'
import MarkdownMessage from '../MarkdownMessage.vue'
import type { ChatWorkspace } from '../../composables/useChatWorkspace'

const { workspace } = defineProps<{ workspace: ChatWorkspace }>()
const {
  messagesRef, messages, isBusy, tinyAgentAvatar, draft, toolEventTitle, formatToolDetail,
  agentMessageTail, reviewProposal, copyMessage, saveAssistantAsNote, currentMode, agentSegments,
  respondInput, streamingText, error, router, savedNote, openSavedNote, pendingApproval,
  toolLabel, approvalError, approvalBusy, decideApproval
} = workspace
</script>

<template>
  <main ref="messagesRef" class="chat-page-messages" aria-live="polite">
    <div v-if="!messages.length && !isBusy" class="chat-page-empty"><span class="chat-page-empty-avatar tiny-agent-avatar"><img class="tiny-agent-avatar-image" :src="tinyAgentAvatar" alt="" /></span><strong>你好，我是 Tiny Agent</strong><p>我可以总结对话，也能创建、查询和修改你的笔记。</p><small class="chat-experimental-note">实验功能：写入、删除和外部工具调用会先请求审批。</small><div class="chat-page-suggestions"><button type="button" @click="draft = '创建笔记《项目想法》，内容：'">创建一篇笔记</button><button type="button" @click="draft = '查找关于 ' ">查询已有笔记</button></div></div>
    <article v-for="(message, index) in messages" :key="`${index}-${message.role}`" class="chat-page-message" :class="`is-${message.role}`">
      <div v-if="message.role === 'assistant'" class="chat-page-assistant-head"><span class="chat-page-avatar tiny-agent-avatar"><img class="tiny-agent-avatar-image" :src="tinyAgentAvatar" alt="" /></span><strong>Tiny Agent</strong></div>
      <div v-if="message.agentSegments?.length" class="agent-timeline agent-event-timeline">
        <template v-for="segment in message.agentSegments" :key="segment.id">
          <div v-if="segment.type === 'text'" class="agent-event agent-text-event" data-agent-event="text"><MarkdownMessage :content="segment.content" /></div>
          <AgentInputCard v-else-if="segment.type === 'input'" :request="segment.arguments" :status="segment.status" :response="segment.response" data-agent-event="input" />
          <details v-else class="agent-event agent-tool-step" :class="`status-${segment.status}`" data-agent-event="tool"><summary><span class="agent-tool-status-dot"><span v-if="segment.status === 'running'" class="agent-tool-dot-pulse"></span></span><Wrench class="agent-tool-glyph" :size="13" /><span>{{ toolEventTitle(segment) }}</span><ChevronDown :size="12" /></summary><div><strong>参数</strong><pre>{{ formatToolDetail(segment.arguments) }}</pre><strong v-if="segment.output">真实返回</strong><pre v-if="segment.output">{{ formatToolDetail(segment.output) }}</pre></div></details>
        </template>
      </div>
      <div v-if="message.role === 'user'" class="chat-page-bubble">{{ message.content }}</div>
      <MarkdownMessage v-else-if="agentMessageTail(message)" :content="agentMessageTail(message)" />
      <div v-if="message.sources?.length" class="chat-source-list"><span v-for="(source, sourceIndex) in message.sources" :key="source.id" class="chat-source-chip" :title="source.snippet">[{{ sourceIndex + 1 }}] {{ source.title }}<small v-if="source.truncated">已截取</small></span></div>
      <button v-if="message.proposalId" type="button" class="chat-review-proposal" @click="reviewProposal(message.proposalId)">在文章中审阅修改</button>
      <div v-if="message.role === 'assistant'" class="chat-page-message-actions"><button type="button" title="复制" @click="copyMessage(message.content)"><Copy :size="14" /></button><button type="button" title="保存这条回复为笔记" @click="saveAssistantAsNote(message)"><Save :size="14" /></button></div>
    </article>
    <article v-if="isBusy" class="chat-page-message is-assistant"><div class="chat-page-assistant-head"><span class="chat-page-avatar tiny-agent-avatar"><img class="tiny-agent-avatar-image" :src="tinyAgentAvatar" alt="" /></span><strong>Tiny Agent</strong><small v-if="currentMode === 'agent'" class="agent-mode-badge">Tiny Agent</small></div><div v-if="currentMode === 'agent' && agentSegments.length" class="agent-timeline agent-event-timeline"><template v-for="segment in agentSegments" :key="segment.id"><div v-if="segment.type === 'text'" class="agent-event agent-text-event" data-agent-event="text"><MarkdownMessage :content="segment.content" streaming /></div><AgentInputCard v-else-if="segment.type === 'input'" :request="segment.arguments" :status="segment.status" :response="segment.response" :interactive="segment.status === 'awaiting_input'" data-agent-event="input" @answer="respondInput" /><details v-else class="agent-event agent-tool-step" :class="`status-${segment.status}`" data-agent-event="tool"><summary><span class="agent-tool-status-dot"><span v-if="segment.status === 'running'" class="agent-tool-dot-pulse"></span></span><Wrench class="agent-tool-glyph" :size="13" /><span>{{ toolEventTitle(segment) }}</span><ChevronDown :size="12" /></summary><div><strong>参数</strong><pre>{{ formatToolDetail(segment.arguments) }}</pre><strong v-if="segment.output">真实返回</strong><pre v-if="segment.output">{{ formatToolDetail(segment.output) }}</pre></div></details></template></div><MarkdownMessage v-else :content="streamingText || '正在思考…'" streaming /></article>
    <div v-if="error" class="chat-page-error">{{ error }} <button type="button" @click="router.push('/settings')">打开模型设置</button></div>
    <div v-if="savedNote" class="chat-page-saved"><FileText :size="15" /><span>已保存为「{{ savedNote.title }}」</span><button type="button" @click="openSavedNote">打开笔记</button><button type="button" class="is-close" title="关闭" @click="savedNote = null"><X :size="13" /></button></div>
  </main>
  <Teleport to="body">
    <div v-if="pendingApproval" class="agent-approval-overlay" role="presentation" @pointerdown.stop @click.stop>
      <section class="agent-approval-dialog" role="dialog" aria-modal="true" aria-labelledby="agent-approval-title">
        <div class="agent-approval-heading"><span><Wrench :size="18" /></span><div><strong id="agent-approval-title">确认 Tiny Agent 操作</strong><small>{{ pendingApproval.description }}</small></div></div>
        <div class="agent-approval-tool"><b>{{ toolLabel(pendingApproval.toolName) }}</b><pre>{{ formatToolDetail(pendingApproval.arguments) }}</pre></div>
        <p>批准仅对以上参数生效；如果参数发生变化，Tiny Agent 会重新请求确认。</p>
        <p v-if="approvalError" class="agent-approval-error">{{ approvalError }}</p>
        <div class="agent-approval-actions"><button type="button" class="is-reject" :disabled="approvalBusy" @click="decideApproval('reject')">拒绝</button><button type="button" class="is-approve" :disabled="approvalBusy" @click="decideApproval('approve')"><LoaderCircle v-if="approvalBusy" class="is-spinning" :size="14" />{{ approvalBusy ? '正在继续…' : '批准并继续' }}</button></div>
      </section>
    </div>
  </Teleport>
</template>
