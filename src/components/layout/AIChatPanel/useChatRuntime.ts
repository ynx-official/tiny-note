import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { classifyError, buildToolCallDisplay } from "./utils";
import type { AIProfile, ChatMessage } from "./types";

interface AutoRenameContext {
  conversationId: string;
  userMessage: string;
}

interface UseChatRuntimeOptions {
  currentConvId: string | null;
  buildContextPrompt: () => string;
  emptyUserMessage: string;
  allowContextOnlySend?: boolean;
  onAfterSend?: () => void;
  onAutoRenameConversation?: (context: AutoRenameContext) => Promise<void>;
}

export function useChatRuntime({
  currentConvId,
  buildContextPrompt,
  emptyUserMessage,
  allowContextOnlySend = false,
  onAfterSend,
  onAutoRenameConversation,
}: UseChatRuntimeOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<AIProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastUserMsgRef = useRef<string>("");
  const abortRef = useRef<boolean>(false);
  const unlistenRef = useRef<(() => void) | null>(null);

  const activeProfile = profiles.find((profile) => profile.id === activeProfileId);

  useEffect(() => {
    loadProfiles().catch(() => {});
  }, []);

  useEffect(() => {
    if (currentConvId) {
      invoke<ChatMessage[]>("get_messages", { conversationId: currentConvId }).then((msgs) => {
        setMessages(msgs);
      });
    } else {
      setMessages([]);
    }
  }, [currentConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadProfiles = async () => {
    const profs = await invoke<AIProfile[]>("get_ai_profiles");
    setProfiles(profs);
    const active = await invoke<AIProfile | null>("get_active_ai_profile");
    if (active) {
      setActiveProfileId(active.id);
    }
  };

  const handleSaveProfile = async (profile: AIProfile) => {
    const nextProfile = { ...profile };
    if (!nextProfile.id) {
      nextProfile.id = Date.now().toString();
    }
    await invoke("save_ai_profile", { profile: nextProfile });
    await invoke("set_active_ai_profile", { id: nextProfile.id });
    await loadProfiles();
    return nextProfile;
  };

  const handleDeleteProfile = async (id: string) => {
    await invoke("delete_ai_profile", { id });
    await loadProfiles();
  };

  const handleSelectProfile = async (id: string) => {
    await invoke("set_active_ai_profile", { id });
    setActiveProfileId(id);
  };

  const handleSend = async () => {
    if (!currentConvId || loading) return;
    if (!input.trim() && !allowContextOnlySend) return;

    if (!activeProfile) {
      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        conversation_id: currentConvId,
        role: "system",
        content: "请先在设置中配置 AI（API 地址、Key、模型）",
        tool_calls: null,
        tool_call_id: null,
        created_at: new Date().toISOString(),
      }]);
      return;
    }

    const userMsg = input.trim() || emptyUserMessage;
    const contextPrompt = buildContextPrompt();
    const messageForAI = contextPrompt
      ? `${contextPrompt}\n\n用户请求：\n${userMsg}`
      : `用户请求：\n${userMsg}`;
    const convId = currentConvId;
    setInput("");
    onAfterSend?.();
    setLoading(true);
    abortRef.current = false;
    lastUserMsgRef.current = userMsg;

    setMessages((prev) => [...prev, {
      id: Date.now().toString(),
      conversation_id: convId,
      role: "user",
      content: userMsg,
      tool_calls: null,
      tool_call_id: null,
      created_at: new Date().toISOString(),
    }]);

    const streamingId = `streaming-${Date.now()}`;
    let streamedContent = "";
    let thinkingContent = "";
    const toolCalls: Array<{ name: string; args: string; done: boolean; startTime: number }> = [];
    const buildFullContent = () => {
      const contentParts: string[] = [];
      if (thinkingContent.trim()) {
        contentParts.push(`<thinking>${thinkingContent}</thinking>`);
      }
      if (toolCalls.length > 0) {
        contentParts.push(buildToolCallDisplay(toolCalls));
      }
      if (streamedContent) {
        contentParts.push(streamedContent);
      }
      return contentParts.join("\n\n");
    };

    setMessages((prev) => [...prev, {
      id: streamingId,
      conversation_id: convId,
      role: "assistant",
      content: "",
      tool_calls: null,
      tool_call_id: null,
      created_at: new Date().toISOString(),
    }]);

    const unlisten = await listen<string>("ai-chat-chunk", (event) => {
      if (abortRef.current) return;
      const data = event.payload;
      const match = /^__KOVA_STREAM__([a-z_]+)__\n([\s\S]*)$/m.exec(data);
      if (!match) {
        streamedContent += data;
        setMessages((prev) => prev.map((msg) =>
          msg.id === streamingId ? { ...msg, content: streamedContent } : msg,
        ));
        return;
      }

      const [, type, payload] = match;
      if (type === "chunk") {
        streamedContent += payload;
        setMessages((prev) => prev.map((msg) =>
          msg.id === streamingId ? { ...msg, content: buildFullContent() } : msg,
        ));
      } else if (type === "thinking") {
        thinkingContent += payload;
        setMessages((prev) => prev.map((msg) =>
          msg.id === streamingId ? { ...msg, content: buildFullContent() } : msg,
        ));
      } else if (type === "tool_start") {
        try {
          const tool = JSON.parse(payload) as { name?: string; arguments?: string };
          toolCalls.push({
            name: tool.name || "tool",
            args: tool.arguments || "{}",
            done: false,
            startTime: Date.now(),
          });
          setMessages((prev) => prev.map((msg) =>
            msg.id === streamingId ? { ...msg, content: buildFullContent() } : msg,
          ));
        } catch {
          // ignore parse errors
        }
      } else if (type === "tool_done") {
        const lastTool = toolCalls[toolCalls.length - 1];
        if (lastTool) {
          const elapsed = Date.now() - (lastTool.startTime ?? 0);
          const delay = Math.max(0, 300 - elapsed);
          setTimeout(() => {
            lastTool.done = true;
            setMessages((prev) => prev.map((msg) =>
              msg.id === streamingId ? { ...msg, content: buildFullContent() } : msg,
            ));
          }, delay);
        }
      } else if (type === "done") {
        toolCalls.length = 0;
        thinkingContent = "";
        setMessages((prev) => prev.map((msg) =>
          msg.id === streamingId ? { ...msg, content: streamedContent || data } : msg,
        ));
      }
    });
    unlistenRef.current = unlisten;

    try {
      await invoke<ChatMessage>("ai_chat_stream", {
        conversationId: convId,
        message: messageForAI,
        baseUrl: activeProfile.base_url,
        apiKey: activeProfile.api_key,
        model: activeProfile.model,
        systemPrompt: activeProfile.system_prompt || "",
        maxContextMessages: activeProfile.max_context_messages || 0,
        enableSummary: activeProfile.enable_summary ?? true,
        enableThinking: activeProfile.enable_thinking ?? false,
        temperature: activeProfile.temperature || undefined,
        maxTokens: activeProfile.max_tokens || undefined,
      });

      const updated = await invoke<ChatMessage[]>("get_messages", { conversationId: convId });
      setMessages(updated);
      await onAutoRenameConversation?.({ conversationId: convId, userMessage: userMsg });
    } catch (err) {
      const error = classifyError(err);
      setMessages((prev) => prev.filter((msg) => msg.id !== streamingId));
      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        conversation_id: convId,
        role: "system",
        content: `${error.icon} ${error.title}\n${error.message}`,
        tool_calls: null,
        tool_call_id: null,
        created_at: new Date().toISOString(),
      }]);
    } finally {
      unlisten();
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleStop = () => {
    abortRef.current = true;
    unlistenRef.current?.();
    invoke("abort_ai").catch(() => {});
    flushSync(() => {
      setMessages((prev) => prev.map((msg) =>
        msg.id.startsWith("streaming-") ? { ...msg, id: `stopped-${Date.now()}`, content: msg.content || "（已停止）" } : msg,
      ));
      setLoading(false);
    });
    inputRef.current?.focus();
  };

  const handleRegenerate = () => {
    if (!lastUserMsgRef.current || !currentConvId || loading) return;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === "assistant") return prev.slice(0, -1);
      return prev;
    });
    setInput(lastUserMsgRef.current);
    setTimeout(() => handleSend(), 50);
  };

  const handleCreateNoteFromMsg = async (content: string) => {
    const lines = content.split("\n");
    let title = "";
    let body = content;
    if (lines[0].startsWith("# ")) {
      title = lines[0].replace(/^#+\s*/, "");
      body = lines.slice(1).join("\n").trim();
    } else {
      title = lines[0].slice(0, 30) + (lines[0].length > 30 ? "..." : "");
    }
    await invoke("create_note", { title, content: body, tags: [], folderId: null });
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const createBlankProfile = (): AIProfile => ({
    id: "",
    name: "",
    base_url: "",
    api_key: "",
    model: "",
    system_prompt: "",
    max_context_messages: 20,
    enable_summary: true,
    enable_thinking: true,
    temperature: 1.0,
    max_tokens: 0,
  });

  return {
    messages,
    setMessages,
    input,
    setInput,
    loading,
    profiles,
    activeProfile,
    activeProfileId,
    inputRef,
    messagesEndRef,
    lastUserMsgRef,
    handleSend,
    handleKeyDown,
    handleStop,
    handleRegenerate,
    handleCreateNoteFromMsg,
    handleSaveProfile,
    handleDeleteProfile,
    handleSelectProfile,
    createBlankProfile,
    reloadProfiles: loadProfiles,
  };
}