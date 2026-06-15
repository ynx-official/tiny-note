import { describe, expect, it } from "vitest";
import type { Note } from "./db";
import { buildArticleAIDraft } from "./articleAi";

describe("articleAi", () => {
  const note: Note = {
    id: "note-1",
    title: "旧标题",
    content: "旧正文",
    tags: [],
    folder_id: "folder-1",
    created_at: "2026-06-15T00:00:00Z",
    updated_at: "2026-06-15T00:00:00Z",
  };

  it("优先使用当前编辑态标题和正文构造文章 AI 草稿", () => {
    expect(
      buildArticleAIDraft(note, {
        title: "新标题",
        content: "新正文",
      }),
    ).toEqual({
      noteId: "note-1",
      title: "新标题",
      content: "新正文",
      folderId: "folder-1",
    });
  });

  it("编辑态为空时回退到笔记当前持久值", () => {
    expect(
      buildArticleAIDraft(note, {
        title: "",
        content: "",
      }),
    ).toEqual({
      noteId: "note-1",
      title: "旧标题",
      content: "旧正文",
      folderId: "folder-1",
    });
  });
});