import { describe, expect, it } from "vitest";
import { buildArticleContextPrompt, buildGlobalContextPrompt } from "./context";

describe("AIChatPanel context builders", () => {
  it("文章上下文会固定到当前文章并带上当前编辑态正文", () => {
    const prompt = buildArticleContextPrompt({
      noteId: "note-1",
      title: "正在编辑的标题",
      content: "第一段\n第二段",
      folderId: "folder-9",
    });

    expect(prompt).toContain("<kova_note_context>");
    expect(prompt).toContain("note_id: note-1");
    expect(prompt).toContain("folder_id: folder-9");
    expect(prompt).toContain("title: 正在编辑的标题");
    expect(prompt).toContain("    第一段");
    expect(prompt).toContain("    第二段");
    expect(prompt).toContain("只围绕这一篇文章进行");
  });

  it("全局上下文会保留目录和笔记附件语义", () => {
    const prompt = buildGlobalContextPrompt([
      {
        type: "folder",
        id: "folder-1",
        name: "产品文档",
        noteCount: 2,
        notes: [
          { id: "note-1", title: "规划" },
          { id: "note-2", title: "复盘" },
        ],
      },
      {
        type: "note",
        id: "note-3",
        title: "发布清单",
        folderId: "folder-1",
      },
    ]);

    expect(prompt).toContain("<kova_context>");
    expect(prompt).toContain("folder_id: folder-1");
    expect(prompt).toContain("规划(note_id:note-1)");
    expect(prompt).toContain("title: 发布清单");
    expect(prompt).toContain("note_id: note-3");
  });
});