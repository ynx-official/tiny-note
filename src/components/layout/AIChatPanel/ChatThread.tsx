import { MessageBubble } from "./MessageBubble";
import type { ChatMessage } from "./types";

interface ChatThreadProps {
  messages: ChatMessage[];
  loading: boolean;
  emptyText: string;
  hasLastUserMessage: boolean;
  onCopy: (content: string) => void;
  onCreateNote: (content: string) => void | Promise<void>;
  onRegenerate: () => void;
  onOpenNote?: (noteId: string) => void;
  onOpenFolder?: (folderId: string) => void;
  endRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatThread({
  messages,
  loading,
  emptyText,
  hasLastUserMessage,
  onCopy,
  onCreateNote,
  onRegenerate,
  onOpenNote,
  onOpenFolder,
  endRef,
}: ChatThreadProps) {
  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-ink-ghost">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-2 opacity-30">
            <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
            <path d="M7 10h10a2 2 0 0 1 2 2v2a8 8 0 0 1-16 0v-2a2 2 0 0 1 2-2z" />
          </svg>
          <p className="text-xs">{emptyText}</p>
        </div>
      ) : (
        messages.map((msg, index) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            index={index}
            totalMessages={messages.length}
            loading={loading}
            hasLastUserMsg={hasLastUserMessage}
            onCopy={onCopy}
            onCreateNote={onCreateNote}
            onRegenerate={onRegenerate}
            onOpenNote={onOpenNote}
            onOpenFolder={onOpenFolder}
          />
        ))
      )}
      <div ref={endRef} />
    </div>
  );
}