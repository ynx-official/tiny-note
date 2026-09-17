<script setup lang="ts">
import { CheckCircle2, Clock, LoaderCircle } from 'lucide-vue-next'
import type { ChatWorkspace } from '../../composables/useChatWorkspace'

const { workspace } = defineProps<{ workspace: ChatWorkspace }>()
const { pendingApproval, approvalBusy, approvalError, approvalDecisions, decideApproval, toolLabel } = workspace
</script>

<template>
  <div v-if="approvalDecisions.length" class="chat-approval-decisions" aria-live="polite">
    <p v-for="(item, index) in approvalDecisions" :key="`${item.toolCallId}-${index}`" class="chat-approval-decision" :class="{ 'is-rejected': item.decision === 'reject' }">
      <CheckCircle2 :size="16" aria-hidden="true" />
      <span>{{ item.decision === 'approve' ? '已批准' : '已拒绝' }} · {{ toolLabel(item.toolName) }}</span>
    </p>
  </div>
  <section v-if="pendingApproval" class="agent-approval-card" aria-labelledby="chat-approval-title" :aria-busy="approvalBusy">
    <div class="chat-approval-heading"><Clock :size="18" aria-hidden="true" /><strong id="chat-approval-title">等待你的确认</strong></div>
    <p class="chat-approval-operation">{{ toolLabel(pendingApproval.toolName) }}</p>
    <p class="chat-approval-description">{{ pendingApproval.description }}</p>
    <details class="chat-approval-parameters"><summary>查看操作参数</summary><pre>{{ JSON.stringify(pendingApproval.arguments, null, 2) }}</pre></details>
    <p v-if="approvalError" class="chat-approval-error" role="alert">{{ approvalError }}</p>
    <div class="agent-approval-actions">
      <button type="button" class="is-reject" :disabled="approvalBusy" @click="decideApproval('reject')">拒绝</button>
      <button type="button" class="is-approve" :disabled="approvalBusy" @click="decideApproval('approve')"><LoaderCircle v-if="approvalBusy" class="is-spinning" :size="14" aria-hidden="true" />{{ approvalBusy ? '正在提交…' : '批准并继续' }}</button>
    </div>
    <p class="chat-approval-hint">可以先切到文章查看。离开页面不会自动批准；批准仅对本次操作参数生效。</p>
  </section>
</template>
