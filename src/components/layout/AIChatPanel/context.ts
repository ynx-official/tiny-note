import type { AIContextAttachment } from "./types";
import type { ArticleAIDraft } from "../../../lib/articleAi";

export function buildGlobalContextPrompt(attachments: AIContextAttachment[]): string {
  if (attachments.length === 0) return "";

  const folders = attachments.filter((item) => item.type === "folder");
  const notes = attachments.filter((item) => item.type === "note");
  const parts: string[] = ["<kova_context>"];

  if (folders.length > 0) {
    parts.push("目录上下文：");
    parts.push("- 这表示后续操作默认在这些目录范围内进行。");
    parts.push("- 如果用户要求创建笔记，必须把对应 folder_id 传给 create_note 或 batch_create_notes。");
    parts.push("- 不要把新笔记创建到未分类，除非用户明确要求。");
    parts.push("folders:");
    for (const folder of folders) {
      parts.push(`- name: ${folder.name}`);
      parts.push(`  folder_id: ${folder.id}`);
      parts.push(`  note_count: ${folder.noteCount}`);
      parts.push(folder.notes.length > 0 ? `  notes: ${folder.notes.map((note) => `${note.title}(note_id:${note.id})`).join(", ")}` : "  notes: []");
    }
  } else {
    parts.push("folders: []");
  }

  if (notes.length > 0) {
    parts.push("");
    parts.push("笔记上下文：");
    parts.push("- 这表示用户希望你围绕这些具体笔记进行增删改查。");
    parts.push("- 涉及查看、编辑、重命名、删除、移动、导出时，优先按 note_id 精确操作。");
    parts.push("notes:");
    for (const note of notes) {
      parts.push(`- title: ${note.title}`);
      parts.push(`  note_id: ${note.id}`);
      parts.push(`  folder_id: ${note.folderId ?? ""}`);
    }
  } else {
    parts.push("notes: []");
  }

  parts.push("</kova_context>");
  return parts.join("\n");
}

export function buildArticleContextPrompt(draft: ArticleAIDraft): string {
  return [
    "<kova_note_context>",
    "当前文章上下文：",
    "- 后续分析、改写、提炼、续写都只围绕这一篇文章进行。",
    "- 除非用户明确要求，不要切换到其他笔记，也不要泛化到整个知识库。",
    "note:",
    `- note_id: ${draft.noteId}`,
    `  folder_id: ${draft.folderId ?? ""}`,
    `  title: ${draft.title || "（无标题）"}`,
    "  content: |",
    ...indentBlock(draft.content || ""),
    "</kova_note_context>",
  ].join("\n");
}

export function buildMessageForAI(userMessage: string, contextPrompt: string): string {
  return contextPrompt
    ? `${contextPrompt}\n\n用户请求：\n${userMessage}`
    : `用户请求：\n${userMessage}`;
}

function indentBlock(content: string): string[] {
  if (!content.trim()) return ["    "];
  return content.split("\n").map((line) => `    ${line}`);
}