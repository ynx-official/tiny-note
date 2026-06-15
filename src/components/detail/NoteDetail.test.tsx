import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import type { Note } from "../../lib/db";
import { NoteDetail } from "./NoteDetail";

const note: Note = {
  id: "note-1",
  title: "文章标题",
  content: "文章内容",
  tags: [],
  folder_id: "folder-1",
  created_at: "2026-06-15T00:00:00Z",
  updated_at: "2026-06-15T00:00:00Z",
};

beforeEach(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
  });
});

describe("NoteDetail 文章 AI 入口", () => {
  it("选中文章时显示优化本文入口", () => {
    const html = renderToStaticMarkup(
      <NoteDetail
        note={note}
        onToggleSidebar={() => {}}
        onDelete={() => {}}
        onUpdateTitle={() => {}}
        onUpdateContent={() => {}}
        onOpenArticleAI={() => {}}
      />,
    );

    expect(html).toContain("优化本文");
  });

  it("没有文章时不显示优化本文入口", () => {
    const html = renderToStaticMarkup(
      <NoteDetail
        note={null}
        onToggleSidebar={() => {}}
        onDelete={() => {}}
        onUpdateTitle={() => {}}
        onUpdateContent={() => {}}
        onOpenArticleAI={() => {}}
      />,
    );

    expect(html).not.toContain("优化本文");
  });
});