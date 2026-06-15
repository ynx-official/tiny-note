import { describe, expect, it } from "vitest";
import type { Folder, Note } from "./db";
import { buildSearchExcerpt, buildSidebarFolderTree, resolveCollectionTitle, resolveContextNotes, resolveRecentNotes, resolveSearchNavigation, resolveSearchScope, shouldForceCollectionView, shouldResetSearchSelection, shouldShowCollectionView } from "./noteNavigation";

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
  {
    id: "frontend",
    name: "Frontend",
    parent_id: null,
    created_at: "2026-01-03T00:00:00.000Z",
    updated_at: "2026-01-03T00:00:00.000Z",
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
    content: "search keyword lives here",
    tags: [],
    folder_id: null,
    created_at: "2026-03-04T10:00:00.000Z",
    updated_at: "2026-03-04T10:00:00.000Z",
  },
  {
    id: "note-front",
    title: "Vue Screen",
    content: "ui rendering",
    tags: [],
    folder_id: "frontend",
    created_at: "2026-03-05T10:00:00.000Z",
    updated_at: "2026-03-05T10:00:00.000Z",
  },
];

describe("noteNavigation", () => {
  it("全部笔记视图按创建时间倒序返回所有笔记", () => {
    expect(resolveContextNotes(notes, { type: "all" }).map((note) => note.id)).toEqual([
      "note-front",
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

  it("搜索摘要会截取命中关键字附近的正文片段", () => {
    expect(buildSearchExcerpt("第一段 第二段 docker pull alpine 第三段 第四段", "docker", 10)).toBe("第一段 第二段 docker pull alpi…");
    expect(buildSearchExcerpt("这是一段很长的内容，但是没有命中关键词，所以只展示开头部分。", "missing", 8)).toBe("这是一段很长的内容，但是没有命中…");
  });

  it("默认最新笔记会按创建时间倒序截取前几条", () => {
    expect(resolveRecentNotes(notes, 3).map((note) => note.id)).toEqual([
      "note-front",
      "note-free",
      "note-root-new",
    ]);
  });

  it("左侧树只保留文件夹树，并把直属笔记挂到各自文件夹下", () => {
    const tree = buildSidebarFolderTree(folders, notes);

    expect(tree).toHaveLength(2);
    expect(tree[0]?.id).toBe("frontend");
    expect(tree[0]?.notes.map((note) => note.id)).toEqual(["note-front"]);
    expect(tree[1]?.id).toBe("backend");
    expect(tree[1]?.notes.map((note) => note.id)).toEqual(["note-root-new", "note-root-old"]);
    expect(tree[1]?.children[0]?.id).toBe("java");
    expect(tree[1]?.children[0]?.notes.map((note) => note.id)).toEqual(["note-child"]);
    expect(tree.flatMap((node) => node.notes).some((note) => note.id === "note-free")).toBe(false);
  });

  it("右侧搜索态忽略当前文件夹范围，切到全局搜索结果集合", () => {
    expect(resolveContextNotes(notes, { type: "folder", folderId: "backend" }, "search keyword").map((note) => note.id)).toEqual([
      "note-free",
    ]);
    expect(resolveCollectionTitle(folders, { type: "folder", folderId: "backend" }, "search keyword")).toBe("搜索结果");
    expect(shouldForceCollectionView("search keyword")).toBe(true);
  });

  it("搜索作用域会区分结果列表和正文详情", () => {
    expect(resolveSearchScope("", null)).toBe("browse");
    expect(resolveSearchScope("search keyword", null)).toBe("search-results");
    expect(resolveSearchScope("search keyword", "note-free")).toBe("search-detail");
  });

  it("搜索态下有选中文章时允许直接进入正文", () => {
    expect(shouldShowCollectionView("search keyword", null)).toBe(true);
    expect(shouldShowCollectionView("search keyword", "note-free")).toBe(false);
    expect(shouldShowCollectionView("", "note-free")).toBe(false);
  });

  it("搜索态里继续修改关键词时，应退出当前正文并回到结果列表", () => {
    expect(shouldResetSearchSelection("search", "search keyword", "note-free")).toBe(true);
    expect(shouldResetSearchSelection("search", "search", "note-free")).toBe(false);
    expect(shouldResetSearchSelection("", "search keyword", "note-free")).toBe(false);
    expect(shouldResetSearchSelection("search", "search keyword", null)).toBe(false);
  });

  it("搜索导航解析会返回统一的切换决策", () => {
    expect(resolveSearchNavigation("search", "search keyword", "note-free")).toEqual({
      currentSearchMode: true,
      nextSearchMode: true,
      currentScope: "search-detail",
      nextScope: "search-results",
      shouldResetSelection: true,
      shouldShowCollectionView: true,
    });
    expect(resolveSearchNavigation("", "search", "note-free")).toEqual({
      currentSearchMode: false,
      nextSearchMode: true,
      currentScope: "browse",
      nextScope: "search-detail",
      shouldResetSelection: false,
      shouldShowCollectionView: false,
    });
  });

  it("左侧搜索过滤会保留命中路径，并隐藏完全无关的文件夹分支", () => {
    const tree = buildSidebarFolderTree(folders, notes, "child");

    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe("backend");
    expect(tree[0]?.notes).toHaveLength(0);
    expect(tree[0]?.children.map((node) => node.id)).toEqual(["java"]);
    expect(tree[0]?.children[0]?.notes.map((note) => note.id)).toEqual(["note-child"]);
  });

  it("左侧搜索过滤允许仅按文件夹名命中显示目录", () => {
    const tree = buildSidebarFolderTree(folders, notes, "front");

    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe("frontend");
    expect(tree[0]?.notes.map((note) => note.id)).toEqual([]);
  });
});