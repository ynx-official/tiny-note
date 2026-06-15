import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ProfileManager } from "./ProfileManager";
import { ConversationList } from "./ConversationList";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { ChatThread } from "./ChatThread";
import { ChatComposer } from "./ChatComposer";
import { buildGlobalContextPrompt } from "./context";
import { useChatRuntime } from "./useChatRuntime";
import type { AIProfile, AIContextAttachment, Conversation, GlobalAIChatPanelProps } from "./types";

export function GlobalAIChatPanel({ onClose, pendingContext, onOpenNote, onOpenFolder }: GlobalAIChatPanelProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [showConvList, setShowConvList] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editProfile, setEditProfile] = useState<AIProfile | null>(null);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingConvTitle, setEditingConvTitle] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteProfileConfirmId, setDeleteProfileConfirmId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [contextAttachments, setContextAttachments] = useState<AIContextAttachment[]>([]);

  const runtime = useChatRuntime({
    currentConvId,
    buildContextPrompt: () => buildGlobalContextPrompt(contextAttachments),
    emptyUserMessage: "请根据已添加的上下文继续处理。",
    allowContextOnlySend: contextAttachments.length > 0,
    onAfterSend: () => setContextAttachments([]),
    onAutoRenameConversation: async ({ conversationId, userMessage }) => {
      const conv = conversations.find((item) => item.id === conversationId);
      if (!conv || conv.title !== "新对话") return;
      const shortTitle = userMessage.slice(0, 20) + (userMessage.length > 20 ? "..." : "");
      await invoke("update_conversation_title", { id: conversationId, title: shortTitle });
      setConversations((prev) => prev.map((item) => (
        item.id === conversationId ? { ...item, title: shortTitle } : item
      )));
    },
  });

  const currentConv = conversations.find((conversation) => conversation.id === currentConvId);

  useEffect(() => {
    void loadConversations();
  }, []);

  useEffect(() => {
    if (!pendingContext) return;
    setContextAttachments((prev) => {
      const map = new Map(prev.map((item) => [`${item.type}:${item.id}`, item]));
      for (const item of pendingContext.attachments) {
        map.set(`${item.type}:${item.id}`, item);
      }
      return [...map.values()];
    });
    if (pendingContext.mode === "new") {
      runtime.setMessages([]);
      setCurrentConvId(null);
      setTimeout(() => {
        void handleNewConversation();
      }, 0);
    }
    setTimeout(() => runtime.inputRef.current?.focus(), 0);
  }, [pendingContext]);

  const loadConversations = async () => {
    const convs = await invoke<Conversation[]>("get_conversations");
    setConversations(convs);
    if (convs.length > 0 && !currentConvId) {
      setCurrentConvId(convs[0].id);
    }
  };

  const handleNewConversation = async () => {
    const existing = conversations.find((conversation) => conversation.title === "新对话");
    if (existing) {
      const msgs = await invoke("get_messages", { conversationId: existing.id }) as Array<unknown>;
      if (msgs.length === 0) {
        setCurrentConvId(existing.id);
        setShowConvList(false);
        return;
      }
    }
    const conv = await invoke<Conversation>("create_conversation", { title: "新对话" });
    setConversations((prev) => [conv, ...prev]);
    setCurrentConvId(conv.id);
    setShowConvList(false);
  };

  const handleDeleteConversation = async (id: string) => {
    await invoke("delete_conversation", { id });
    setConversations((prev) => prev.filter((conversation) => conversation.id !== id));
    if (currentConvId === id) {
      const remaining = conversations.filter((conversation) => conversation.id !== id);
      setCurrentConvId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const handleTogglePinned = async (id: string) => {
    const pinned = await invoke<boolean>("toggle_conversation_pinned", { id });
    setConversations((prev) => {
      const updated = prev.map((conversation) => conversation.id === id ? { ...conversation, pinned } : conversation);
      return [...updated].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    });
  };

  const handleExportConversation = async (id: string) => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const destDir = await open({ directory: true });
    if (!destDir) return;
    const path = await invoke<string>("export_conversation", { id, destDir });
    alert(`已导出到：${path}`);
  };

  const handleStartRename = (conversation: Conversation) => {
    setEditingConvId(conversation.id);
    setEditingConvTitle(conversation.title);
  };

  const handleConfirmRename = async () => {
    if (!editingConvId || !editingConvTitle.trim()) return;
    await invoke("update_conversation_title", { id: editingConvId, title: editingConvTitle.trim() });
    setConversations((prev) => prev.map((conversation) => (
      conversation.id === editingConvId ? { ...conversation, title: editingConvTitle.trim() } : conversation
    )));
    setEditingConvId(null);
  };

  const removeContextAttachment = (item: AIContextAttachment) => {
    setContextAttachments((prev) => prev.filter((current) => !(current.type === item.type && current.id === item.id)));
  };

  const handleSaveProfile = async () => {
    if (!editProfile) return;
    await runtime.handleSaveProfile(editProfile);
    setEditProfile(null);
  };

  const handleContainerClick = () => {
    if (showConvList) setShowConvList(false);
    if (showSettings) {
      setShowSettings(false);
      setEditProfile(null);
    }
  };

  const filteredMessages = searchQuery.trim()
    ? runtime.messages.filter((message) => message.role !== "system" && message.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : runtime.messages;

  return (
    <div className="w-full h-full flex flex-col border-l border-paper-deep/30 bg-paper/40 relative min-w-[260px]" onClick={handleContainerClick}>
      <div className="h-10 px-3 flex items-center justify-between border-b border-paper-deep/25 shrink-0" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setShowConvList(!showConvList);
              if (!showConvList) setShowSettings(false);
            }}
            className="text-xs text-ink-soft hover:text-accent transition-colors flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {currentConv?.title || "AI 助手"}
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showConvList ? "rotate-180" : ""}`}><path d="M1 2l3 3 3-3" /></svg>
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setShowSearch(!showSearch);
              if (showSearch) setSearchQuery("");
            }}
            className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${showSearch ? "bg-accent-mist text-accent" : "text-ink-ghost hover:text-accent hover:bg-accent-mist"}`}
            title="搜索消息"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void handleNewConversation();
            }}
            className="w-6 h-6 flex items-center justify-center rounded text-ink-ghost hover:text-accent hover:bg-accent-mist transition-colors"
            title="新对话"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setShowSettings(!showSettings);
              setEditProfile(null);
              if (!showSettings) setShowConvList(false);
            }}
            className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${showSettings ? "bg-accent-mist text-accent" : "text-ink-ghost hover:text-accent hover:bg-accent-mist"}`}
            title="AI 设置"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
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

      {showSearch && (
        <div className="px-3 py-1.5 border-b border-paper-deep/25 shrink-0" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center gap-1.5 bg-paper-warm/60 border border-paper-deep/30 rounded-lg px-2 py-1">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-ghost shrink-0"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索对话内容..."
              autoFocus
              className="flex-1 min-w-0 bg-transparent text-[11px] text-ink-soft placeholder:text-ink-ghost focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-ink-ghost hover:text-accent transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
              </button>
            )}
          </div>
        </div>
      )}

      {showSettings && (
        <div className="absolute left-0 right-0 top-10 z-20 bg-cloud border-b border-paper-deep shadow-lg animate-dropdown rounded-b-xl" onClick={(event) => event.stopPropagation()}>
          <ProfileManager
            profiles={runtime.profiles}
            activeProfileId={runtime.activeProfileId}
            editProfile={editProfile}
            onNewProfile={() => setEditProfile(runtime.createBlankProfile())}
            onSelectProfile={runtime.handleSelectProfile}
            onEditProfile={setEditProfile}
            onSaveProfile={handleSaveProfile}
            onDeleteProfile={(id) => setDeleteProfileConfirmId(id)}
          />
        </div>
      )}

      {showConvList && (
        <div className="absolute left-0 right-0 top-10 z-20 bg-cloud border-b border-paper-deep shadow-lg animate-dropdown rounded-b-xl max-h-60 overflow-y-auto" onClick={(event) => event.stopPropagation()}>
          <ConversationList
            conversations={conversations}
            currentConvId={currentConvId}
            editingConvId={editingConvId}
            editingConvTitle={editingConvTitle}
            onSelect={(id) => { setCurrentConvId(id); setShowConvList(false); }}
            onStartRename={handleStartRename}
            onConfirmRename={handleConfirmRename}
            onCancelRename={() => setEditingConvId(null)}
            onEditingTitleChange={setEditingConvTitle}
            onTogglePinned={handleTogglePinned}
            onExport={handleExportConversation}
            onDelete={(id) => setDeleteConfirmId(id)}
          />
        </div>
      )}

      {searchQuery.trim() && (
        <p className="px-3 pt-2 text-[10px] text-ink-ghost text-center shrink-0">
          {filteredMessages.length > 0 ? `找到 ${filteredMessages.length} 条消息` : "没有找到匹配的消息"}
        </p>
      )}

      <ChatThread
        messages={filteredMessages}
        loading={runtime.loading}
        emptyText={searchQuery.trim() ? "没有找到匹配的消息" : "开始和 AI 对话吧"}
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
        placeholder={currentConvId ? (runtime.activeProfile ? `${runtime.activeProfile.name} - 输入消息... (Enter 发送)` : "请先配置 AI") : "请先新建对话"}
        disabled={!currentConvId}
        sendDisabled={(!runtime.input.trim() && contextAttachments.length === 0) || !currentConvId}
        loading={runtime.loading}
        inputRef={runtime.inputRef}
        topSlot={contextAttachments.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5" onClick={(event) => event.stopPropagation()}>
            {contextAttachments.map((item) => (
              <span
                key={`${item.type}:${item.id}`}
                title={item.type === "folder" ? `${item.name} · ${item.noteCount} 条笔记 · ${item.id}` : `${item.title} · ${item.id}`}
                className="group max-w-full inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent-mist/45 px-2 py-1 text-[11px] text-accent shadow-[0_1px_0_rgba(255,255,255,0.45)_inset] animate-dropdown"
              >
                {item.type === "folder" ? (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M14 13a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13V5.5A1.5 1.5 0 0 1 3.5 4H6l1.5 2h5A1.5 1.5 0 0 1 14 7.5z"/></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                )}
                <span className="truncate max-w-[180px]">{item.type === "folder" ? item.name : item.title}</span>
                {item.type === "folder" && <span className="text-[10px] text-accent/60">{item.noteCount}</span>}
                <button
                  type="button"
                  onClick={() => removeContextAttachment(item)}
                  className="ml-0.5 rounded-full p-0.5 text-accent/50 hover:bg-accent/10 hover:text-accent transition-colors"
                  title="移除"
                >
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" /></svg>
                </button>
              </span>
            ))}
          </div>
        ) : null}
      />

      {deleteConfirmId && (
        <DeleteConfirmDialog
          title="确定删除这个对话吗？删除后无法恢复。"
          onConfirm={() => { void handleDeleteConversation(deleteConfirmId); setDeleteConfirmId(null); }}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}

      {deleteProfileConfirmId && (
        <DeleteConfirmDialog
          title="确定删除这个 AI 配置吗？"
          onConfirm={() => { void runtime.handleDeleteProfile(deleteProfileConfirmId); setDeleteProfileConfirmId(null); }}
          onCancel={() => setDeleteProfileConfirmId(null)}
        />
      )}
    </div>
  );
}