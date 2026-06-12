import { describe, expect, it } from "vitest";
import type { Folder, Note } from "./db";
import { buildSidebarFolderTree, resolveCollectionTitle, resolveContextNotes } from "./noteNavigation";

const folders: Folder[] = [
  {
    id: "backend",
    name: "Backend",
    parent_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "java",
    name: "Java",
    parent_id: "backend",
    created_at: "2026-01-02T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  },
];

const notes: Note[] = [
  {
    id: "note-root-new",
    title: "Root New",
    content: "",
    tags: [],
    folder_id: "backend",
    created_at: "2026-03-03T10:00:00.000Z",
    updated_at: "2026-03-03T10:00:00.000Z",
  },
  {
    id: "note-root-old",
    title: "Root Old",
    content: "",
    tags: [],
    folder_id: "backend",
    created_at: "2026-03-01T10:00:00.000Z",
    updated_at: "2026-03-01T10:00:00.000Z",
  },
  {
    id: "note-child",
    title: "Child Folder Note",
    content: "",
    tags: [],
    folder_id: "java",
    created_at: "2026-03-02T10:00:00.000Z",
    updated_at: "2026-03-02T10:00:00.000Z",
  },
  {
    id: "note-free",
    title: "Loose Note",
    content: "",
    tags: [],
    folder_id: null,
    created_at: "2026-03-04T10:00:00.000Z",
    updated_at: "2026-03-04T10:00:00.000Z",
  },
];

describe("noteNavigation", () => {
  it("全部笔记视图按创建时间倒序返回所有笔记", () => {
    expect(resolveContextNotes(notes, { type: "all" }).map((note) => note.id)).toEqual([
      "note-free",
      "note-root-new",
      "note-child",
      "note-root-old",
    ]);
  });

  it("文件夹视图只返回该文件夹直属笔记并按创建时间倒序排列", () => {
    expect(resolveContextNotes(notes, { type: "folder", folderId: "backend" }).map((note) => note.id)).toEqual([
      "note-root-new",
      "note-root-old",
    ]);
  });

  it("左侧树只保留文件夹树，并把直属笔记挂到各自文件夹下", () => {
    const tree = buildSidebarFolderTree(folders, notes);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe("backend");
    expect(tree[0]?.notes.map((note) => note.id)).toEqual(["note-root-new", "note-root-old"]);
    expect(tree[0]?.children[0]?.id).toBe("java");
    expect(tree[0]?.children[0]?.notes.map((note) => note.id)).toEqual(["note-child"]);
    expect(tree.flatMap((node) => node.notes).some((note) => note.id === "note-free")).toBe(false);
  });

  it("右侧列表标题只保留全部笔记和文件夹标题，不再生成未分类入口", () => {
    expect(resolveCollectionTitle(folders, { type: "all" })).toBe("全部笔记");
    expect(resolveCollectionTitle(folders, { type: "folder", folderId: "backend" })).toBe("Backend");
  });
});