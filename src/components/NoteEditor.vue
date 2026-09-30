<script setup lang="ts">
import '../styles/note-workspace.css'
import NoteSaveStatus from './notes/NoteSaveStatus.vue'
import NoteTitleInput from './notes/NoteTitleInput.vue'
import { ListTree } from 'lucide-vue-next'
import VditorEditor from './VditorEditor.vue'
import MarkdownMessage from './MarkdownMessage.vue'
import NoteAssistantSidebar from './NoteAssistantSidebar.vue'
import FridayDropdownChevron from './FridayDropdownChevron.vue'
import { CalendarDays, Check, CircleHelp, Columns2, Copy, FileCode2, FileOutput, FileText, Languages, LoaderCircle, Maximize2, MessageSquare, RotateCcw, Send, ShieldCheck, Table2, ThumbsDown, ThumbsUp, PenLine, Layers, Sparkles, Trash2, Download, Printer, X, Zap } from 'lucide-vue-next'
import { useNoteEditor, type NoteEditorEmit, type NoteEditorProps } from '../composables/useNoteEditor'
import type { Note } from '../types/domain'

const inputProps = defineProps<{ note?: NoteEditorProps['note']; tocVisible?: boolean; proposalId?: string }>()
const props: NoteEditorProps = {
  get note() { return inputProps.note ?? null },
  get tocVisible() { return inputProps.tocVisible ?? false },
  get proposalId() { return inputProps.proposalId ?? '' }
}
const emit = defineEmits<NoteEditorEmit>()
const workspace = useNoteEditor(props, emit)
defineExpose({ saveLatestContent: () => workspace.flushLatestContent({ save: true }) })
const { t, store, tasksStore, aiBusy, aiText, aiResultAction, aiProposal, aiSources, aiConsentOpen, assistantOpen, assistantTriggerVisible, assistantBusy, assistantStreamingText, assistantMessages, assistantSelection, aiPanelOpen, aiPanelSelectionText, commandMenuOpen, aiPrompt, aiInputRef, commandMenuDirection, moreOpen, moreTriggerRef, moreMenuRef, imageDialogOpen, imageUrl, imageAlt, imageInput, imageFileInput, fimSuggestion, noteLinks, editorModes, editorMode, modeMenuOpen, modeMenuIndex, modeMenuRef, markdownDraft, markdownParseError, sourceDirty, markdownPreview, exportingFormat, exportStatusLabel, externalFileName, showExternalNoteBanner, dismissExternalNoteBanner, currentMode, modeShortcutParts, modeShortcutLabel, codeMode, aiActionLabel, aiFeedback, aiOutputOpen, aiOriginalText, aiCharCount, aiDialogStyle, editor, selectedText, applyingAi, aiError, onEditorReady, onEditorSelection, updateNoteTitle, focusNoteBody, updateMarkdownDraft, flushLatestContent, changeEditorMode, toggleModeMenu, handleModeMenuKeydown, toggleMoreMenu, handleMoreMenuKeydown, handlePreviewScroll, toggleMarkdownPreview, cancelAiConsent, confirmAiConsent, closeAssistant, toggleAssistant, sendAssistantMessage, stopAssistant, copyAssistantMessage, exportMarkdown, exportHtml, exportPdf, printNote, insertAi, replaceWithAi, copyAi, toggleAiFeedback, dismissAiResult, closeAiResult, startAiDrag, rewriteAi, closeAiPanel, openAiPanel, toggleCommandMenu, selectAiCommand, sendCustomAi, runSelectedAi, openInConversation, handleEditorTab, dismissFim, openImageDialog, normalizeImageUrl, confirmImage, insertLocalImage, importExternalSource } = workspace
</script>
<template>
  <div v-if="note" class="note-editor-shell">
    <section class="editor-panel" :class="{ 'is-code-mode': codeMode }">
    <div class="toolbar friday-editor-toolbar" :class="{ 'with-assistant': !assistantTriggerVisible }">
      <div class="note-title-row">
        <FileText class="note-title-icon" :size="18" aria-hidden="true" />
        <NoteTitleInput :key="note.id" :model-value="note.title" :readonly="note.external || applyingAi" @update:model-value="updateNoteTitle" @enter-body="focusNoteBody" />
        <NoteSaveStatus :note-id="note.id" :source-dirty="sourceDirty" @retry="flushLatestContent({ save: true }).catch(() => {})" />
      <div key="toolbar-mode-controls" class="toolbar-right-group">
        <button
          v-if="codeMode"
          type="button"
          class="markdown-preview-toggle"
          :class="{ pressed: markdownPreview }"
          :aria-pressed="markdownPreview"
          :aria-label="markdownPreview ? '关闭实时预览' : '打开实时预览'"
          :title="markdownPreview ? '关闭实时预览' : '打开实时预览'"
          @click="toggleMarkdownPreview"
        ><Columns2 :size="16" /></button>
        <span class="toolbar-menu-anchor mode-menu-anchor">
          <button type="button" class="editor-mode-trigger" :disabled="applyingAi" :aria-label="`文章模式：${currentMode.label}`" :aria-expanded="modeMenuOpen" aria-haspopup="menu" :title="`文章模式：${currentMode.label}（${modeShortcutLabel}）`" @click="toggleModeMenu" @keydown.esc.stop="modeMenuOpen = false">
            <component :is="currentMode.icon" class="mode-icon" :size="16" /><span class="editor-mode-label">{{ currentMode.label }}</span><FridayDropdownChevron />
          </button>
          <div v-if="modeMenuOpen" ref="modeMenuRef" class="editor-mode-menu" role="menu" aria-label="文章模式" @keydown="handleModeMenuKeydown" @click.stop>
            <button v-for="(mode, index) in editorModes" :key="mode.id" type="button" role="menuitemradio" :aria-checked="editorMode === mode.id" :tabindex="index === modeMenuIndex ? 0 : -1" @focus="modeMenuIndex = index" @click="changeEditorMode(mode.id)">
              <component :is="mode.icon" :size="15" />
              <span><strong>{{ mode.label }}</strong><small>{{ mode.description }}</small></span>
              <Check v-if="editorMode === mode.id" :size="14" class="editor-mode-check" />
            </button>
            <div class="editor-mode-shortcut-hint"><span>切换快捷键</span><kbd v-for="part in modeShortcutParts" :key="part">{{ part }}</kbd></div>
          </div>
        </span>
        <span v-if="exportStatusLabel" class="toolbar-export-status" role="status" aria-live="polite"><LoaderCircle :size="14" class="is-spinning" /> {{ exportStatusLabel }}</span>
        <span class="toolbar-menu-anchor more-menu-anchor">
          <button ref="moreTriggerRef" type="button" class="toolbar-export-trigger" :title="t('exportAndPrint')" :aria-label="t('exportAndPrint')" aria-haspopup="menu" :aria-expanded="moreOpen" aria-controls="note-more-menu" @click="toggleMoreMenu"><FileOutput :size="18" /></button>
          <div v-if="moreOpen" id="note-more-menu" ref="moreMenuRef" class="toolbar-more-menu" role="menu" :aria-label="t('exportAndPrint')" @keydown="handleMoreMenuKeydown" @click.stop>
            <button type="button" role="menuitem" :disabled="Boolean(exportingFormat)" @click="exportMarkdown"><FileText :size="15" /> {{ t('exportMarkdown') }}</button>
            <button type="button" role="menuitem" :disabled="Boolean(exportingFormat)" @click="exportHtml"><FileCode2 :size="15" /> {{ t('exportHtml') }}</button>
            <button type="button" role="menuitem" :disabled="Boolean(exportingFormat)" @click="exportPdf"><Download :size="15" /> {{ t('exportPdf') }}</button>
            <button type="button" role="menuitem" :disabled="Boolean(exportingFormat)" @click="printNote"><Printer :size="15" /> {{ t('printArticle') }}</button>
          </div>
        </span>
        <button class="toolbar-toc-trigger" title="目录" aria-label="目录" :aria-pressed="tocVisible" @click="emit('toggle-toc')"><ListTree :size="17" /><span class="document-action-label">目录</span></button>
        <button class="ai-button" :aria-pressed="assistantOpen" title="Tiny Note 助理" aria-label="Tiny Note 助理" @click="toggleAssistant"><Layers :size="17" /><span class="document-action-label">助理</span></button>
      </div>
      </div>
    </div>
    <div v-if="showExternalNoteBanner" class="external-note-banner" role="status" :title="note.externalPath">
      <div class="external-note-message"><FileText :size="16" aria-hidden="true" /><span><strong>外部文件</strong><small>{{ externalFileName }} · 修改会保存到源文件，不会出现在笔记列表</small></span></div>
      <div class="external-note-actions">
        <button type="button" class="external-note-dismiss" title="以后不再提示此文章" @click="dismissExternalNoteBanner">不再提醒</button>
        <button type="button" class="external-note-import" @click="importExternalSource">导入到笔记</button>
      </div>
    </div>
    <div v-if="noteLinks.length" class="note-links-slot">
      <div v-if="noteLinks.length" class="note-metadata note-links" aria-label="关联笔记"><span>关联笔记</span><button v-for="link in noteLinks" :key="link.sourceNoteId + '-' + link.targetNoteId" type="button" @click="store.activeId = link.sourceNoteId === note.id ? link.targetNoteId : link.sourceNoteId">{{ link.targetTitle }}</button></div>
    </div>
    <VditorEditor :model-value="markdownDraft" :note-id="note.id" :mode="editorMode" :preview="markdownPreview" @ready="onEditorReady" @change="updateMarkdownDraft" @selection="onEditorSelection" @mode="changeEditorMode" @image="openImageDialog" @scroll="handlePreviewScroll" @keydown.tab.capture="handleEditorTab" @keydown.esc="dismissFim" />
    <div v-if="markdownParseError" class="markdown-parse-error" role="alert">{{ markdownParseError }}</div>
    <div v-show="!aiOutputOpen && (selectedText || aiPanelOpen)" class="tiny-note-bubble-menu" role="toolbar" aria-label="选区 AI 工具">
      <div v-if="aiPanelOpen" class="tiny-note-ai-input-wrapper" @mousedown.stop>
        <div v-if="aiPanelSelectionText" class="tiny-note-ai-selection-context" role="group" aria-label="选中文本">
          <span class="tiny-note-ai-selection-label">基于选中文本</span>
          <p class="tiny-note-ai-selection-text">{{ aiPanelSelectionText }}</p>
        </div>
        <textarea ref="aiInputRef" v-model="aiPrompt" class="tiny-note-ai-textarea" rows="1" placeholder="告诉 AI 如何处理这段文字…" @keydown.enter.exact.prevent="sendCustomAi" @keydown.esc.prevent="closeAiPanel"></textarea>
        <div class="tiny-note-ai-input-actions">
          <div class="tiny-note-ai-action-left">
            <div class="tiny-note-command-dropdown">
              <button class="tiny-note-command-btn" :class="{ active: commandMenuOpen }" @click.stop="toggleCommandMenu"><Zap :size="13" /><span>AI 指令</span><FridayDropdownChevron /></button>
              <Transition name="tiny-note-command-transition">
                <div v-if="commandMenuOpen" class="tiny-note-command-menu" :class="`menu-${commandMenuDirection}`" @click.stop>
                  <button class="tiny-note-command-item" @click="selectAiCommand('translate', $event)"><Languages :size="14" /><span>翻译</span></button>
                  <button class="tiny-note-command-item" @click="selectAiCommand('summarize', $event)"><FileText :size="14" /><span>总结</span></button>
                  <button class="tiny-note-command-item" @click="selectAiCommand('continue_write', $event)"><PenLine :size="14" /><span>续写</span></button>
                  <button class="tiny-note-command-item" @click="selectAiCommand('fix_grammar', $event)"><CircleHelp :size="14" /><span>语法修正</span></button>
                  <button class="tiny-note-command-item" @click="selectAiCommand('generate_plan', $event)"><CalendarDays :size="14" /><span>生成任务计划</span></button>
                  <button class="tiny-note-command-item" @click="selectAiCommand('generate_table', $event)"><Table2 :size="14" /><span>生成表格</span></button>
                </div>
              </Transition>
            </div>
          </div>
          <div class="tiny-note-ai-action-right">
            <button class="tiny-note-send-btn" :class="{ active: aiPrompt.trim() }" :disabled="!aiPrompt.trim() || aiBusy" title="发送" @click="sendCustomAi"><Send :size="16" /></button>
          </div>
        </div>
      </div>
      <div v-else class="bubble-menu-container tiny-note-bubble-content" @mousedown.prevent>
        <button class="bubble-btn ai-write-btn bubble-ai-button" title="AI 写作" @mousedown.prevent="openAiPanel"><Sparkles :size="14" /><span>AI 写作</span></button>
        <span class="bubble-divider"></span>
        <button class="bubble-btn" title="解读" @mousedown.prevent="runSelectedAi('interpret', $event)"><CircleHelp :size="14" /><span>解读</span></button>
        <button class="bubble-btn" title="精炼" @mousedown.prevent="runSelectedAi('refine', $event)"><Zap :size="14" /><span>精炼</span></button>
        <button class="bubble-btn" title="润色" @mousedown.prevent="runSelectedAi('polish', $event)"><PenLine :size="14" /><span>润色</span></button>
        <button class="bubble-btn" title="扩写" @mousedown.prevent="runSelectedAi('expand', $event)"><Maximize2 :size="14" /><span>扩写</span></button>
        <span class="bubble-divider"></span>
        <button class="bubble-btn" title="在对话中打开" @mousedown.prevent="openInConversation"><MessageSquare :size="14" /><span>在对话中打开</span></button>
      </div>
    </div>
    <div v-if="fimSuggestion" class="fim-suggestion">{{ fimSuggestion }} <small>Tab 接受 · Esc 放弃</small></div>
    <div v-if="aiConsentOpen" class="editor-dialog-overlay" @click.self="cancelAiConsent">
      <div class="editor-dialog ai-consent-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-consent-title">
        <div class="editor-dialog-header"><strong id="ai-consent-title"><Sparkles :size="16" />允许 AI 使用文章上下文</strong><button class="editor-dialog-close" title="关闭" aria-label="关闭" @click="cancelAiConsent">×</button></div>
        <div class="editor-dialog-body"><p>Tiny Note 会把当前文章、选中的文字及命中的知识库片段发送给当前模型，以完成本次 AI 操作。</p><small>授权仅保存在本机，可随模型配置分别记录。</small></div>
        <div class="editor-dialog-footer"><button class="secondary-button" @click="cancelAiConsent">取消</button><button class="primary-button" @click="confirmAiConsent">允许并继续</button></div>
      </div>
    </div>
    <Transition name="ai-output-transition">
      <div v-if="aiOutputOpen" class="ai-output-overlay" @mousedown.self="closeAiResult">
        <div class="ai-output-panel" :style="aiDialogStyle" role="dialog" aria-modal="true" aria-label="AI 写作结果" @mousedown.stop>
        <div class="ai-output-header" @pointerdown="startAiDrag"><strong><Sparkles :size="14" />{{ aiActionLabel(aiResultAction) }}内容</strong><button type="button" title="关闭" aria-label="关闭" @click="closeAiResult"><X :size="17" /></button></div>
        <div class="ai-output-content">
          <div v-if="aiOriginalText && aiResultAction !== 'interpret'" class="ai-diff-preview"><div class="ai-diff-before"><small>原文</small>{{ aiOriginalText }}</div><div class="ai-diff-after"><small>建议</small><MarkdownMessage class="ai-output-markdown" :content="aiText" :streaming="aiBusy" /></div></div>
          <MarkdownMessage v-else class="ai-output-markdown" :content="aiText" :streaming="aiBusy" />
          <div v-if="aiSources.length" class="ai-source-list"><span v-for="(source, index) in aiSources" :key="source.id" :title="source.snippet">[{{ index + 1 }}] {{ source.title }}<small v-if="source.truncated">已截取</small></span></div>
        </div>
        <div class="ai-output-footer"><div class="ai-output-footer-meta"><span>内容由 AI 生成 <ShieldCheck :size="13" /></span><span>已生成{{ aiCharCount }}字</span></div><div class="ai-output-feedback"><button type="button" :class="{ active: aiFeedback === 'like' }" title="有帮助" @click="toggleAiFeedback('like')"><ThumbsUp :size="16" /></button><button type="button" :class="{ active: aiFeedback === 'dislike' }" title="没帮助" @click="toggleAiFeedback('dislike')"><ThumbsDown :size="16" /></button><button type="button" title="复制" @click="copyAi"><Copy :size="16" /></button></div></div>
        <p v-if="aiError" class="ai-apply-error" role="alert">{{ aiError }}</p>
        <div class="ai-output-actions"><div><button type="button" class="ai-output-action rewrite" :disabled="aiBusy" @click="rewriteAi"><RotateCcw :size="14" />重写</button><button type="button" class="ai-output-action discard" :disabled="aiBusy" @click="dismissAiResult"><Trash2 :size="14" />弃用</button></div><div><button type="button" class="ai-output-action replace" :disabled="aiBusy || applyingAi || !aiText || !aiProposal" @click="replaceWithAi">应用替换</button><button type="button" class="ai-output-action insert" :disabled="aiBusy || applyingAi || !aiText || !aiProposal" title="在选区后或当前光标位置插入" @click="insertAi">应用插入</button></div></div>
        </div>
      </div>
    </Transition>
    <div v-if="imageDialogOpen" class="editor-dialog-overlay" @click.self="imageDialogOpen = false">
      <div class="editor-dialog" role="dialog" aria-modal="true" aria-label="插入图片">
        <div class="editor-dialog-header"><strong>插入图片</strong><button class="editor-dialog-close" title="关闭" @click="imageDialogOpen = false">×</button></div>
        <div class="editor-dialog-body"><label>图片地址<input ref="imageInput" v-model="imageUrl" type="url" placeholder="https://example.com/image.jpg" @keyup.enter="confirmImage" /></label><label>替代文字<input v-model="imageAlt" type="text" placeholder="图片说明（可选）" @keyup.enter="confirmImage" /></label><button type="button" class="secondary-button" @click="imageFileInput?.click()">从本机选择图片</button><input ref="imageFileInput" type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp" @change="insertLocalImage" /></div>
        <div class="editor-dialog-footer"><button class="secondary-button" @click="imageDialogOpen = false">取消</button><button class="primary-button" :disabled="!normalizeImageUrl(imageUrl)" @click="confirmImage">插入图片</button></div>
      </div>
    </div>
    </section>
    <Transition name="tiny-note-assistant-slide">
      <NoteAssistantSidebar v-if="assistantOpen" :note="note" :selection="assistantSelection" :messages="assistantMessages" :busy="assistantBusy" :streaming-text="assistantStreamingText" @close="closeAssistant" @send="sendAssistantMessage" @stop="stopAssistant" @copy="copyAssistantMessage" />
    </Transition>
  </div>
  <div v-else class="empty-state"><div class="empty-icon">✦</div><h2>{{ t('emptyNotes') }}</h2><p>{{ t('emptyHint') }}</p></div>
</template>
