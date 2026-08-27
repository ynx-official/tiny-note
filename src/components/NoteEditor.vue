<script setup lang="ts">
import { EditorContent } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import MarkdownSourceEditor from './MarkdownSourceEditor.vue'
import MarkdownMessage from './MarkdownMessage.vue'
import NoteAssistantSidebar from './NoteAssistantSidebar.vue'
import FridayDropdownChevron from './FridayDropdownChevron.vue'
import { Bold, CalendarDays, Check, CircleHelp, Columns2, Copy, FileCode2, FileOutput, FileText, Italic, Languages, LoaderCircle, Maximize2, MessageSquare, RotateCcw, Send, ShieldCheck, Table2, ThumbsDown, ThumbsUp, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, ListChecks, Quote, Code2, Undo2, Redo2, Eraser, Link2, Highlighter, PenLine, AlignLeft, AlignCenter, AlignRight, PlusCircle, Layers, Sparkles, Trash2, Download, Printer, Workflow, X, Zap } from 'lucide-vue-next'
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
const { lowlight, store, library, appStore, tasksStore, t, locale, aiBusy, aiText, aiRequestId, aiAction, aiResultAction, aiProposal, aiSources, aiConsentOpen, assistantOpen, assistantTriggerVisible, assistantBusy, assistantRequestId, assistantStreamingText, assistantMessages, assistantSelection, assistantResponseSources, assistantResponseProposal, aiPanelOpen, aiPanelSelectionText, commandMenuOpen, aiPrompt, aiInputRef, commandMenuDirection, moreOpen, moreTriggerRef, moreMenuRef, insertOpen, tablePickerOpen, textColorOpen, highlightOpen, headingOpen, imageDialogOpen, imageUrl, imageAlt, imageInput, imageFileInput, tableRows, tableCols, fimEnabled, fimSuggestion, editorStateTick, fimTimer, assistantTriggerTimer, savedSelection, pendingAiRequest, pendingAiChange, modeIcons, noteLinks, editorModes, editorMode, modeMenuOpen, modeMenuIndex, modeMenuRef, markdownDraft, markdownParseError, sourceDirty, markdownPasteNotice, markdownPreview, splitRatio, splitVertical, splitWorkspace, sourceEditorRef, previewScroller, pendingSourceDrafts, persistedSignatures, exportingFormat, exportStatusLabel, externalFileName, EXTERNAL_NOTICE_DISMISSED_PREFIX, externalNoticeDismissed, showExternalNoteBanner, applyingEditorContent, markdownParseTimer, markdownPasteTimer, splitResizeObserver, splitDragState, scrollSyncFrame, scrollSyncSource, modeShortcutSwitching, externalNoticeStorageKey, readExternalNoticeDismissed, dismissExternalNoteBanner, currentMode, modeShortcutParts, modeShortcutLabel, richMode, codeMode, readingMode, splitMode, splitPaneStyle, aiActionLabels, aiErrorMessages, aiEventErrorMessage, aiActionLabel, unknownErrorCode, contextConsentModelId, aiFeedback, aiOutputOpen, aiOriginalText, aiChangePending, AI_CHANGE_HIGHLIGHT, aiCharCount, aiDialogPosition, aiDialogStyle, aiDragState, refreshEditorState, looksLikeMarkdown, isPlainInlineAiReplacement, handleMarkdownPaste, prepareEditorContent, extractNoteTitle, textFromPreparedEditorContent, syncNoteTitle, getEditorMarkdown, editor, canUndo, canRedo, linkActive, canEditLink, selectedText, shouldShowBubbleMenu, textColorPalette, highlightPalette, currentHeadingLabel, canSetNoteTitle, noteContentSignature, scheduleNoteSave, saveDirtyNote, handleRichEditorUpdate, deriveMarkdown, commitMarkdown, queueMarkdownParse, updateMarkdownDraft, flushLatestContent, resetEditorSession, changeEditorMode, handleEditorModeShortcut, toggleModeMenu, focusModeOption, moveModeFocus, handleModeMenuKeydown, focusMoreItem, toggleMoreMenu, handleMoreMenuKeydown, handleDocumentPointerDown, updateSplitOrientation, setupSplitObserver, stopSplitResize, resizeSplitPane, startSplitResize, synchronizeSplitScroll, handlePreviewScroll, toggleMarkdownPreview, viewPastedMarkdown, resetTransientEditorState, handleBackgroundNoteTask, setEditorEditable, loadExternalProposal, toggle, applyMarkdownFormat, setMarkdownHeading, setMarkdownSmallBody, hasNoteContextConsent, cancelAiConsent, confirmAiConsent, runAi, captureAssistantSelection, openAssistant, closeAssistant, toggleAssistant, assistantContext, assistantReferences, pushAssistantResponse, assistantEditIntent, sendAssistantMessage, stopAssistant, copyAssistantMessage, stopAi, exportBodyHtml, prepareExportSnapshot, runArticleExport, exportMarkdown, exportHtml, exportPdf, printNote, restoreSavedSelection, clearAiResultState, syncNoteFromEditor, selectedContentMarks, insertPendingAiContent, stagePendingAiChange, restoreAiChange, persistAiChange, confirmPendingAiChange, applyAiResult, insertAi, replaceWithAi, copyAi, toggleAiFeedback, dismissAiResult, closeAiResult, stopAiDrag, moveAiDialog, startAiDrag, rewriteAi, saveCurrentSelection, closeAiPanel, positionCommandMenu, openAiPanel, toggleCommandMenu, selectAiCommand, sendCustomAi, runSelectedAi, openInConversation, runFim, acceptFim, handleEditorTab, dismissFim, insertCodeBlock, mermaidTemplates, insertMermaidDiagram, closeToolbarMenus, toggleInsertMenu, selectTableCell, insertTable, openImageDialog, normalizeImageUrl, confirmImage, insertLocalImage, setTextColor, setHighlightColor, setHeading, setNoteTitle, setSmallBody, clearRichFormatting, normalizeLinkHref, editLink, saveNoteMetadata, importExternalSource } = workspace
</script>
<template>
  <div v-if="note" class="note-editor-shell">
    <section class="editor-panel" :class="{ 'is-code-mode': codeMode, 'is-reading-mode': readingMode }">
    <div class="toolbar friday-editor-toolbar" :class="{ 'with-assistant': !assistantTriggerVisible }">
      <div key="toolbar-format-controls" class="toolbar-left-group">
        <template v-if="richMode">
        <button :title="t('undo')" :disabled="!canUndo" @click="editor?.chain().focus().undo().run()"><Undo2 :size="19" /></button>
        <button :title="t('redo')" :disabled="!canRedo" @click="editor?.chain().focus().redo().run()"><Redo2 :size="19" /></button>
        <button title="清除格式" @click="clearRichFormatting"><Eraser :size="19" /></button>
        <button title="链接" :class="{ pressed: linkActive }" :disabled="!canEditLink" @click="editLink"><Link2 :size="19" /></button><i></i>
        <span class="toolbar-menu-anchor"><button title="插入" @click="toggleInsertMenu"><PlusCircle :size="19" /><span class="toolbar-label">插入</span><FridayDropdownChevron /></button><div v-if="insertOpen" class="toolbar-insert-menu insert-command-menu">
          <div class="insert-submenu-anchor"><button class="insert-menu-item" @click.stop="tablePickerOpen = !tablePickerOpen"><span class="insert-menu-icon">▦</span><span>表格</span><span class="insert-menu-arrow">›</span></button><div v-if="tablePickerOpen" class="table-picker-menu" @click.stop><div class="table-picker-label">{{ tableRows }} × {{ tableCols }}</div><div v-for="row in 10" :key="`table-row-${row}`" class="table-picker-row"><button v-for="col in 10" :key="`table-cell-${row}-${col}`" class="table-picker-cell" :class="{ active: row <= tableRows && col <= tableCols }" @mouseenter="selectTableCell(row, col)" @click="insertTable(row, col)"></button></div></div></div>
          <button class="insert-menu-item" @click="openImageDialog"><span class="insert-menu-icon">▧</span><span>图片</span></button>
          <button class="insert-menu-item" @click="insertCodeBlock"><Code2 :size="15" /><span>代码块</span></button>
          <button class="insert-menu-item insert-mermaid-flowchart" @click="insertMermaidDiagram('flowchart')"><Workflow :size="15" /><span>流程图</span></button>
          <button class="insert-menu-item insert-mermaid-swimlane" @click="insertMermaidDiagram('swimlane')"><Columns2 :size="15" /><span>泳道图</span></button>
          <button class="insert-menu-item" @click="editor?.chain().focus().setHorizontalRule().run(); insertOpen = false"><span class="insert-rule-icon">—</span><span>分隔线</span></button>
          <button class="insert-menu-item" @click="editor?.chain().focus().toggleBlockquote().run(); insertOpen = false"><Quote :size="15" /><span>引用</span></button>
        </div></span><i></i>
        <button :class="{ pressed: editor?.isActive('bold') }" @click="toggle('toggleBold')"><Bold :size="19" /></button>
        <button @click="toggle('toggleItalic')"><Italic :size="19" /></button>
        <button @click="toggle('toggleUnderline')"><UnderlineIcon :size="19" /></button>
        <button @click="toggle('toggleStrike')"><Strikethrough :size="19" /></button>
        <span class="toolbar-menu-anchor color-menu-anchor"><button title="文字颜色" :class="{ pressed: textColorOpen }" @click="closeToolbarMenus(); textColorOpen = !textColorOpen"><PenLine :size="19" /><FridayDropdownChevron /></button><div v-if="textColorOpen" class="editor-color-menu"><strong>文字颜色</strong><button class="color-reset" @click="setTextColor('inherit')">默认颜色</button><div class="editor-color-grid"><button v-for="color in textColorPalette" :key="color" class="editor-color-swatch" :style="{ backgroundColor: color }" :title="color" @click="setTextColor(color)"></button></div></div></span>
        <span class="toolbar-menu-anchor color-menu-anchor"><button title="背景颜色" :class="{ pressed: highlightOpen }" @click="closeToolbarMenus(); highlightOpen = !highlightOpen"><Highlighter :size="19" /><FridayDropdownChevron /></button><div v-if="highlightOpen" class="editor-color-menu"><strong>背景颜色</strong><button class="color-reset" @click="setHighlightColor('none')">无背景</button><div class="editor-color-grid"><button v-for="color in highlightPalette" :key="color" class="editor-color-swatch" :style="{ backgroundColor: color }" :title="color" @click="setHighlightColor(color)"></button></div></div></span><i></i>
        <span class="toolbar-menu-anchor heading-menu-anchor">
          <button title="标题" :class="{ pressed: headingOpen }" @click="closeToolbarMenus(); headingOpen = !headingOpen"><span class="toolbar-label heading-label">{{ currentHeadingLabel }}</span><FridayDropdownChevron /></button>
          <div v-if="headingOpen" class="editor-heading-menu">
            <button class="heading-preview" :class="{ active: editor?.isActive('noteTitle') }" :disabled="!canSetNoteTitle" @click="setNoteTitle"><span class="note-title-menu-label">标题</span></button>
            <button class="heading-preview" :class="{ active: editor?.isActive('heading', { level: 1 }) }" :disabled="editor?.isActive('noteTitle')" @click="setHeading(1)"><span class="heading-level-1">标题 1</span></button>
            <button class="heading-preview" :class="{ active: editor?.isActive('heading', { level: 2 }) }" :disabled="editor?.isActive('noteTitle')" @click="setHeading(2)"><span class="heading-level-2">标题 2</span></button>
            <button class="heading-preview" :class="{ active: editor?.isActive('heading', { level: 3 }) }" :disabled="editor?.isActive('noteTitle')" @click="setHeading(3)"><span class="heading-level-3">标题 3</span></button>
            <button class="heading-preview" :class="{ active: editor?.isActive('paragraph') }" :disabled="editor?.isActive('noteTitle')" @click="setHeading(0)"><span>正文</span></button>
            <button class="heading-preview" :class="{ active: editor?.isActive('smallParagraph') }" :disabled="editor?.isActive('noteTitle')" @click="setSmallBody"><span class="small-body-label">小正</span></button>
          </div>
        </span><i></i>
        <button title="项目列表" @click="toggle('toggleBulletList')"><List :size="19" /></button>
        <button title="编号列表" @click="toggle('toggleOrderedList')"><ListOrdered :size="19" /></button>
        <button title="任务列表" @click="toggle('toggleTaskList')"><ListChecks :size="19" /></button><i></i>
        <button title="左对齐" @click="editor?.chain().focus().setTextAlign('left').run()"><AlignLeft :size="19" /></button>
        <button title="居中" @click="editor?.chain().focus().setTextAlign('center').run()"><AlignCenter :size="19" /></button>
        <button title="右对齐" @click="editor?.chain().focus().setTextAlign('right').run()"><AlignRight :size="19" /></button>
        </template>
        <template v-else-if="codeMode">
          <div class="markdown-toolbar-controls" role="toolbar" aria-label="Markdown 格式工具">
            <button title="撤销" @click="applyMarkdownFormat('undo')"><Undo2 :size="19" /></button>
            <button title="重做" @click="applyMarkdownFormat('redo')"><Redo2 :size="19" /></button>
            <button title="链接" @click="applyMarkdownFormat('link')"><Link2 :size="19" /></button><i></i>
            <button title="粗体" @click="applyMarkdownFormat('bold')"><Bold :size="19" /></button>
            <button title="斜体" @click="applyMarkdownFormat('italic')"><Italic :size="19" /></button>
            <button title="删除线" @click="applyMarkdownFormat('strike')"><Strikethrough :size="19" /></button>
            <button title="行内代码" @click="applyMarkdownFormat('code')"><Code2 :size="19" /></button><i></i>
            <span class="toolbar-menu-anchor heading-menu-anchor">
              <button title="标题" :class="{ pressed: headingOpen }" @click="closeToolbarMenus(); headingOpen = !headingOpen"><span class="toolbar-label heading-label">标题</span><FridayDropdownChevron /></button>
              <div v-if="headingOpen" class="editor-heading-menu">
                <button class="heading-preview" @click="setMarkdownHeading(1)"><span class="note-title-menu-label">标题</span></button>
                <button class="heading-preview" @click="setMarkdownHeading(1)"><span class="heading-level-1">标题 1</span></button>
                <button class="heading-preview" @click="setMarkdownHeading(2)"><span class="heading-level-2">标题 2</span></button>
                <button class="heading-preview" @click="setMarkdownHeading(3)"><span class="heading-level-3">标题 3</span></button>
                <button class="heading-preview" @click="setMarkdownHeading(0)"><span>正文</span></button>
                <button class="heading-preview" @click="setMarkdownSmallBody"><span class="small-body-label">小正</span></button>
              </div>
            </span><i></i>
            <button title="项目列表" @click="applyMarkdownFormat('bullet')"><List :size="19" /></button>
            <button title="编号列表" @click="applyMarkdownFormat('ordered')"><ListOrdered :size="19" /></button>
            <button title="任务列表" @click="applyMarkdownFormat('task')"><ListChecks :size="19" /></button>
            <button title="引用" @click="applyMarkdownFormat('quote')"><Quote :size="19" /></button>
          </div>
        </template>
      </div>
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
          <button type="button" class="editor-mode-trigger" :aria-label="`文章模式：${currentMode.label}`" :aria-expanded="modeMenuOpen" aria-haspopup="menu" :title="`文章模式：${currentMode.label}（${modeShortcutLabel}）`" @click="toggleModeMenu" @keydown.esc.stop="modeMenuOpen = false">
            <component :is="currentMode.icon" :size="16" />
          </button>
          <div v-if="modeMenuOpen" ref="modeMenuRef" class="editor-mode-menu" role="menu" aria-label="文章模式" @keydown="handleModeMenuKeydown" @click.stop>
            <button v-for="(mode, index) in editorModes" :key="mode.id" type="button" role="menuitemradio" :aria-checked="editorMode === mode.id" :tabindex="index === modeMenuIndex ? 0 : -1" @focus="modeMenuIndex = index" @click="changeEditorMode(mode.id)">
              <component :is="mode.icon" :size="15" />
              <span><strong>{{ mode.label }}</strong><small>{{ mode.description }}</small></span>
              <Check v-if="editorMode === mode.id" :size="14" class="editor-mode-check" />
            </button>
            <div class="editor-mode-shortcut-hint"><span>编辑切换快捷键</span><kbd v-for="part in modeShortcutParts" :key="part">{{ part }}</kbd></div>
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
        <button v-if="assistantTriggerVisible" class="ai-button" @click="toggleAssistant"><Layers :size="17" /> Tiny Note 助理</button>
      </div>
    </div>
    <div v-if="showExternalNoteBanner" class="external-note-banner" role="status" :title="note.externalPath">
      <div class="external-note-message"><FileText :size="16" aria-hidden="true" /><span><strong>外部文件</strong><small>{{ externalFileName }} · 修改会保存到源文件，不会出现在笔记列表</small></span></div>
      <div class="external-note-actions">
        <button type="button" class="external-note-dismiss" title="以后不再提示此文章" @click="dismissExternalNoteBanner">不再提醒</button>
        <button type="button" class="external-note-import" @click="importExternalSource">导入到笔记</button>
      </div>
    </div>
    <div v-if="noteLinks.length" class="note-metadata">
      <div class="note-links" aria-label="关联笔记"><span>关联笔记</span><button v-for="link in noteLinks" :key="link.sourceNoteId + '-' + link.targetNoteId" type="button" @click="store.activeId = link.sourceNoteId === note.id ? link.targetNoteId : link.sourceNoteId">{{ link.targetTitle }}</button></div>
    </div>
    <button class="toc-btn" :class="{ 'is-open': tocVisible }" title="目录" aria-label="目录" @click="emit('toggle-toc')"><span class="toc-char">目</span><span class="toc-char">录</span></button>
    <div ref="splitWorkspace" class="editor-workspace" :class="[`mode-${editorMode}`, { 'is-previewing': splitMode, 'is-vertical': splitVertical }]">
      <div v-if="codeMode" class="markdown-source-pane" :class="{ 'split-source-pane': splitMode }" :style="splitMode ? splitPaneStyle : undefined">
        <MarkdownSourceEditor ref="sourceEditorRef" :model-value="markdownDraft" aria-label="Markdown 源码编辑器" @update:model-value="updateMarkdownDraft" @scroll="synchronizeSplitScroll('source', $event)" />
      </div>
      <div v-if="splitMode" class="split-divider" role="separator" :aria-orientation="splitVertical ? 'horizontal' : 'vertical'" aria-label="调整源码与预览比例" aria-valuemin="30" aria-valuemax="70" :aria-valuenow="Math.round(splitRatio)" @pointerdown="startSplitResize"><span></span></div>
      <div v-show="!codeMode || markdownPreview" key="editor-render" ref="previewScroller" class="editor-render-pane" :class="{ 'split-preview-pane': splitMode }" @scroll.passive="handlePreviewScroll">
        <EditorContent :editor="editor" class="editor-content" :class="{ 'split-preview-content': splitMode, 'reading-content': readingMode, 'has-pending-ai-change': aiChangePending }" @mousedown="confirmPendingAiChange" @keydown.tab="handleEditorTab" @keydown.esc="dismissFim" />
      </div>
      <div v-if="markdownParseError" class="markdown-parse-error" role="alert">{{ markdownParseError }}</div>
      <div v-if="markdownPasteNotice" class="markdown-paste-notice" role="status">
        <span>已按 Markdown 渲染</span>
        <button type="button" class="markdown-paste-source" @click="viewPastedMarkdown">查看源码</button>
        <button type="button" class="markdown-paste-close" aria-label="关闭提示" @click="markdownPasteNotice = false">×</button>
      </div>
    </div>
    <BubbleMenu v-if="editor" v-show="!aiOutputOpen && richMode" :editor="editor" :options="{ placement: 'top' }" :should-show="shouldShowBubbleMenu" class="tiny-note-bubble-menu">
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
    </BubbleMenu>
    <div v-if="fimSuggestion && richMode" class="fim-suggestion">{{ fimSuggestion }} <small>Tab 接受 · Esc 放弃</small></div>
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
        <div class="ai-output-actions"><div><button type="button" class="ai-output-action rewrite" :disabled="aiBusy" @click="rewriteAi"><RotateCcw :size="14" />重写</button><button type="button" class="ai-output-action discard" :disabled="aiBusy" @click="dismissAiResult"><Trash2 :size="14" />弃用</button></div><div><button type="button" class="ai-output-action replace" :disabled="aiBusy || !aiText || !aiProposal" @click="replaceWithAi">应用替换</button><button type="button" class="ai-output-action insert" :disabled="aiBusy || !aiText || !aiProposal || !richMode" :title="richMode ? '在当前光标位置插入' : '请切换到即时编辑后应用插入'" @click="insertAi">应用插入</button></div></div>
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
