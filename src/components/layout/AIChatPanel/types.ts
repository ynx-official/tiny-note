import type { ArticleAIDraft } from "../../../lib/articleAi";

export interface Conversation {
  id: string;
  title: string;
  summary: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  tool_calls: string | null;
  tool_call_id: string | null;
  created_at: string;
}

export interface AIProfile {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  system_prompt: string;
  max_context_messages: number;
  enable_summary: boolean;
  enable_thinking: boolean;
  temperature: number;
  max_tokens: number;
}

export type AIContextAttachment =
  | {
      type: "folder";
      id: string;
      name: string;
      noteCount: number;
      notes: { id: string; title: string }[];
    }
  | {
      type: "note";
      id: string;
      title: string;
      folderId: string | null;
    };

export interface PendingAIContext {
  id: number;
  attachments: AIContextAttachment[];
  mode: "current" | "new";
}

interface AIChatPanelSharedProps {
  onClose: () => void;
  onOpenNote?: (noteId: string) => void;
  onOpenFolder?: (folderId: string) => void;
}

export interface GlobalAIChatPanelProps extends AIChatPanelSharedProps {
  scope: "global";
  pendingContext: PendingAIContext | null;
}

export interface ArticleAIChatPanelProps extends AIChatPanelSharedProps {
  scope: "article";
  articleDraft: ArticleAIDraft | null;
}

export type AIChatPanelProps = GlobalAIChatPanelProps | ArticleAIChatPanelProps;