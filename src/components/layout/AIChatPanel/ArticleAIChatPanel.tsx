import { useEffect, useMemo, useState } from "react";
import { ChatThread } from "./ChatThread";
import { ChatComposer } from "./ChatComposer";
import { buildArticleContextPrompt } from "./context";
import { useChatRuntime } from "./useChatRuntime";
import { db } from "../../../lib/db";
import type { ArticleAIChatPanelProps } from "./types";

export function ArticleAIChatPanel({ onClose, articleDraft, onOpenNote, onOpenFolder }: ArticleAIChatPanelProps) {
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);

  const runtime = useChatRuntime({
    currentConvId,
    buildContextPrompt: () => articleDraft ? buildArticleContextPrompt(articleDraft) : "",
    emptyUserMessage: "请基于当前文章继续处理。",
  });

  useEffect(() => {
    if (!articleDraft) {
      setCurrentConvId(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      const conversation = await db.getOrCreateNoteConversation(articleDraft.noteId);
      if (cancelled) return;
      setCurrentConvId(conversation.id);
      setTimeout(() => runtime.inputRef.current?.focus(), 0);
    })();

    return () => {
      cancelled = true;
    };
  }, [articleDraft?.noteId]);

  const articleTitle = useMemo(() => {
    if (!articleDraft) return "当前文章 AI";
    return articleDraft.title?.trim() || "未命名文章";
  }, [articleDraft]);

  const handleClear = async () => {
    if (!articleDraft) return;
    if (runtime.loading) {
      runtime.handleStop();
    }
    await db.clearNoteConversationMessages(articleDraft.noteId);
    runtime.setMessages([]);
  };

  return (
    <div className="w-full h-full flex flex-col border-l border-paper-deep/30 bg-paper/40 relative min-w-[260px]">
      <div className="h-10 px-3 flex items-center justify-between border-b border-paper-deep/25 shrink-0">
        <div className="min-w-0 flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-accent-mist text-accent flex items-center justify-center shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" /><path d="M7 10h10a2 2 0 0 1 2 2v2a8 8 0 0 1-16 0v-2a2 2 0 0 1 2-2z" /></svg>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-ink-ghost leading-none">当前文章 AI</p>
            <p className="text-xs text-ink-soft truncate">{articleTitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void handleClear()}
            disabled={!articleDraft}
            className="px-2 h-6 rounded text-[11px] text-ink-ghost hover:text-accent hover:bg-accent-mist transition-colors disabled:opacity-40"
            title="清空当前文章对话"
          >
            清空
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded text-ink-ghost hover:text-ink-soft hover:bg-paper-warm transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
          </button>
        </div>
      </div>

      <div className="px-3 pt-2 shrink-0">
        <div className="rounded-xl border border-accent/15 bg-accent-mist/35 px-3 py-2 text-[11px] text-ink-soft">
          <div className="flex items-center gap-1 text-accent mb-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
            <span>默认会携带当前编辑中的标题和正文</span>
          </div>
          <p className="line-clamp-2 break-all">{articleDraft?.content?.trim() ? articleDraft.content : "当前文章暂无正文"}</p>
        </div>
      </div>

      <ChatThread
        messages={runtime.messages}
        loading={runtime.loading}
        emptyText={articleDraft ? "从当前文章开始对话吧" : "请先选择一篇文章"}
        hasLastUserMessage={!!runtime.lastUserMsgRef.current}
        onCopy={(content) => navigator.clipboard.writeText(content)}
        onCreateNote={runtime.handleCreateNoteFromMsg}
        onRegenerate={runtime.handleRegenerate}
        onOpenNote={onOpenNote}
        onOpenFolder={onOpenFolder}
        endRef={runtime.messagesEndRef}
      />

      <ChatComposer
        input={runtime.input}
        onInputChange={runtime.setInput}
        onKeyDown={runtime.handleKeyDown}
        onSend={runtime.handleSend}
        onStop={runtime.handleStop}
        placeholder={articleDraft ? (runtime.activeProfile ? `${runtime.activeProfile.name} - 例如：优化结构、润色语气、提炼摘要` : "请先配置 AI") : "请先选择文章"}
        disabled={!articleDraft || !currentConvId}
        sendDisabled={!runtime.input.trim() || !articleDraft || !currentConvId}
        loading={runtime.loading}
        inputRef={runtime.inputRef}
      />
    </div>
  );
}