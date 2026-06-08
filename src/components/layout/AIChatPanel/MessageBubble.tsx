import { MarkdownPreview } from "../../shared/MarkdownPreview";
import { ThinkingBlock } from "./ThinkingBlock";
import { parseThinkingContent } from "./utils";
import type { ChatMessage } from "./types";

type ParsedContext = {
  readonly folders: ReadonlyArray<{ readonly name: string; readonly id: string }>;
  readonly notes: ReadonlyArray<{ readonly title: string; readonly id: string; readonly folderId: string | null }>;
  readonly userText: string;
};

const parseKovaContext = (content: string): ParsedContext | null => {
  const match = content.match(/<kova_context>\s*([\s\S]*?)\s*<\/kova_context>\s*([\s\S]*)/);
  if (!match) return null;

  const context = match[1] ?? "";
  const tail = (match[2] ?? "").replace(/^\s*用户请求：\s*/u, "").trim();
  const folders = [...context.matchAll(/- name:\s*(.+)\n\s*folder_id:\s*([^\n]+)/g)].map((item) => ({
    name: item[1]?.trim() ?? "未命名文件夹",
    id: item[2]?.trim() ?? "",
  })).filter((item) => item.id);
  const notes = [...context.matchAll(/- title:\s*([\s\S]*?)\n\s*note_id:\s*([^\n]+)\n\s*folder_id:\s*([^\n]*)/g)].map((item) => ({
    title: item[1]?.trim() ?? "无标题笔记",
    id: item[2]?.trim() ?? "",
    folderId: item[3]?.trim() || null,
  })).filter((item) => item.id);

  return { folders, notes, userText: tail };
};

const sanitizeMessageContent = (content: string) => {
  const parsedContext = parseKovaContext(content);
  const withoutContext = parsedContext ? parsedContext.userText : content;
  const { main } = parseThinkingContent(withoutContext);
  return main
    .replace(/<!--\s*KOVA_THINKING:[\s\S]*?-->/g, "")
    .replace(/<kova_context>[\s\S]*?<\/kova_context>/g, "")
    .replace(/^\s*用户请求：\s*/u, "")
    .trim();
};

interface MessageBubbleProps {
  msg: ChatMessage;
  index: number;
  totalMessages: number;
  loading: boolean;
  hasLastUserMsg: boolean;
  onCopy: (content: string) => void;
  onCreateNote: (content: string) => void;
  onRegenerate: () => void;
  onOpenNote?: (noteId: string) => void;
  onOpenFolder?: (folderId: string) => void;
}

export function MessageBubble({ msg, index, totalMessages, loading, hasLastUserMsg, onCopy, onCreateNote, onRegenerate, onOpenNote, onOpenFolder }: MessageBubbleProps) {
  if (msg.role === "system") {
    return (
      <div key={msg.id} className="flex justify-center my-2">
        <span className="text-[11px] text-ink-ghost bg-paper-warm/60 px-3 py-1 rounded-full">{msg.content}</span>
      </div>
    );
  }

  // Skip empty assistant messages (tool call holders)
  if (msg.role === "assistant" && !msg.content && msg.tool_calls && msg.tool_calls !== "[]") return null;
  // Skip tool result messages
  if (msg.role === "tool") return null;
  // Skip empty assistant messages without content (but not during streaming)
  if (msg.role === "assistant" && !msg.content && !loading) return null;

  const isUser = msg.role === "user";
  const parsedContext = isUser ? parseKovaContext(msg.content) : null;
  const cleanContent = sanitizeMessageContent(msg.content);
  const { thinking, main } = isUser ? { thinking: null, main: parsedContext?.userText ?? cleanContent } : parseThinkingContent(msg.content);

  return (
    <div key={msg.id} className={`group/msg flex flex-col ${isUser ? "items-end" : "items-start"} mb-3`}>
      {/* Thinking section - completely separate from bubble */}
      {thinking && (
        <div className="max-w-[85%] mb-1">
          <ThinkingBlock content={thinking} />
        </div>
      )}
      <div className={`max-w-[85%]`}>
        <div className={`rounded-xl px-3 py-2 text-[13px] leading-relaxed select-text ${isUser
          ? "bg-accent text-white rounded-br-sm whitespace-pre-wrap"
          : "bg-paper-warm text-ink-soft rounded-bl-sm"
          }`}>
          {parsedContext && (parsedContext.notes.length > 0 || parsedContext.folders.length > 0) && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {parsedContext.folders.map((folder) => (
                <button
                  key={`folder:${folder.id}`}
                  type="button"
                  title={folder.id}
                  onClick={() => onOpenFolder?.(folder.id)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/15 border border-white/20 px-2 py-1 text-[11px] text-white/95 hover:bg-white/25 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M14 13a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13V5.5A1.5 1.5 0 0 1 3.5 4H6l1.5 2h5A1.5 1.5 0 0 1 14 7.5z"/></svg>
                  <span className="max-w-[160px] truncate">{folder.name}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-75"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              ))}
              {parsedContext.notes.map((note) => (
                <button
                  key={`note:${note.id}`}
                  type="button"
                  title={note.id}
                  onClick={() => onOpenNote?.(note.id)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/15 border border-white/20 px-2 py-1 text-[11px] text-white/95 hover:bg-white/25 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span className="max-w-[160px] truncate">{note.title}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-75"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              ))}
            </div>
          )}
          {isUser ? main : (
            main ? (
              <div className="markdown-body text-[12px] select-text [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                <MarkdownPreview content={main} />
              </div>
            ) : loading ? (
              <span className="text-ink-ghost animate-pulse">正在思考...</span>
            ) : (
              <span className="text-ink-ghost">（已停止）</span>
            )
          )}
        </div>
        {/* Action buttons below the bubble, shown on hover */}
        <div className={`flex items-center gap-0.5 mt-1 opacity-0 group-hover/msg:opacity-100 transition-opacity ${isUser ? "justify-end" : "justify-start"}`}>
          <button
            type="button"
            onClick={() => onCopy(cleanContent)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-ink-ghost hover:text-accent hover:bg-accent-mist/50 transition-colors"
            title="复制"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            复制
          </button>
          {!isUser && (
            <>
              <button
                type="button"
                onClick={() => onCreateNote(cleanContent)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-ink-ghost hover:text-accent hover:bg-accent-mist/50 transition-colors"
                title="创建笔记"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                创建笔记
              </button>
              {index === totalMessages - 1 && !loading && hasLastUserMsg && (
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-ink-ghost hover:text-accent hover:bg-accent-mist/50 transition-colors"
                  title="重新生成"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
                  重新生成
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
