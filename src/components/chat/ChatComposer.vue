<script setup lang="ts">
import { BookOpen, File, FileText, MessageCircle, Paperclip, Send, Square, Wrench, X } from 'lucide-vue-next'
import type { ChatWorkspace } from '../../composables/useChatWorkspace'

const { workspace } = defineProps<{ workspace: ChatWorkspace }>()
const {
  submit, references, removeReference, draft, isBusy, modeSaving, currentMode, selectMode,
  toggleReferenceMenu, referenceMenuOpen, notesStore, addNoteReference, library, addFileReference,
  agentTools, agentApprovalCount, stop
} = workspace
</script>

<template>
  <form class="chat-page-composer" @submit.prevent="submit">
    <div v-if="references.length" class="chat-reference-tags"><span v-for="reference in references" :key="reference.key"><FileText v-if="reference.type === 'note'" :size="13" /><File v-else :size="13" />{{ reference.name }}<button type="button" @click="removeReference(reference.key)"><X :size="12" /></button></span></div>
    <textarea v-model="draft" rows="2" placeholder="输入消息..." @keydown.enter.exact.prevent="submit"></textarea>
    <div class="chat-page-composer-footer"><div class="chat-composer-left"><div class="chat-mode-switch" :class="{ 'is-locked': isBusy || modeSaving }"><button type="button" :class="{ active: currentMode === 'chat' }" :disabled="isBusy || modeSaving" title="普通对话" @click="selectMode('chat')"><MessageCircle :size="14" />对话</button><button type="button" :class="{ active: currentMode === 'agent' }" :disabled="isBusy || modeSaving" title="实验功能：自主调用工具完成任务" @click="selectMode('agent')"><Wrench :size="14" />Tiny Agent · 实验</button></div><div class="chat-reference-anchor"><button type="button" class="chat-attach-button" title="引用笔记或文件" @click="toggleReferenceMenu"><Paperclip :size="15" /></button><div v-if="referenceMenuOpen" class="chat-reference-menu"><strong>引用内容</strong><small>笔记</small><button v-for="note in notesStore.notes" :key="note.id" type="button" @click="addNoteReference(note)"><FileText :size="13" />{{ note.title || '未命名笔记' }}</button><small v-if="library.entries.some(item => item.kind === 'file')">{{ library.active?.name || '知识库文件' }}</small><button v-for="entry in library.entries.filter(item => item.kind === 'file')" :key="entry.relativePath" type="button" @click="addFileReference(entry)"><BookOpen :size="13" />{{ entry.name }}</button></div></div><small v-if="currentMode === 'agent'" data-testid="agent-tool-summary" class="chat-agent-tool-summary">{{ agentTools.length }} 个工具可用 · {{ agentApprovalCount }} 个操作需审批</small><small v-else>{{ modeSaving ? '正在切换模式…' : isBusy ? '正在生成回复，请留在当前页面' : '内容保存在你的设备上' }}</small></div><button v-if="isBusy" type="button" class="chat-page-send is-stop" aria-label="停止生成" title="停止生成" @click="stop"><Square :size="15" /></button><button v-else type="submit" class="chat-page-send" :class="{ active: draft.trim() }" :disabled="!draft.trim()" aria-label="发送消息" title="发送消息"><Send :size="16" /></button></div>
  </form>
</template>
