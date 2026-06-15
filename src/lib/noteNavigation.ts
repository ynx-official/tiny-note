import type { Folder, Note } from "./db";

export type NavTarget =
  | { type: "all" }
  | { type: "folder"; folderId: string }
  | { type: "note"; noteId: string; folderId: string | null };

export type SearchScope = "browse" | "search-results" | "search-detail";

export interface SidebarFolderNode extends Folder {
  children: SidebarFolderNode[];
  notes: Note[];
}

const byCreatedAtDesc = (a: Note, b: Note) =>
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

const byFolderCreatedAtDesc = (a: Folder, b: Folder) =>
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

export const normalizeSearchKeyword = (value: string) => value.trim().toLowerCase();

export const matchesNoteSearch = (note: Note, keyword: string) => {
  if (!keyword) return true;
  return note.title.toLowerCase().includes(keyword) || note.content.toLowerCase().includes(keyword);
};

export const buildSearchExcerpt = (content: string, keyword: string, radius = 32) => {
  const normalizedContent = content.replace(/\s+/g, " ").trim();
  if (!normalizedContent) return "";

  if (!keyword) {
    return normalizedContent.length <= radius * 2
      ? normalizedContent
      : `${normalizedContent.slice(0, radius * 2).trimEnd()}…`;
  }

  const normalizedKeyword = normalizeSearchKeyword(keyword);
  const matchIndex = normalizedContent.toLowerCase().indexOf(normalizedKeyword);

  if (matchIndex === -1) {
    return normalizedContent.length <= radius * 2
      ? normalizedContent
      : `${normalizedContent.slice(0, radius * 2).trimEnd()}…`;
  }

  const start = Math.max(0, matchIndex - radius);
  const end = Math.min(normalizedContent.length, matchIndex + normalizedKeyword.length + radius);

  return `${start > 0 ? "…" : ""}${normalizedContent.slice(start, end).trim()}${end < normalizedContent.length ? "…" : ""}`;
};

export const resolveRecentNotes = (notes: Note[], limit = 8) => {
  return [...notes].sort(byCreatedAtDesc).slice(0, limit);
};

export const shouldForceCollectionView = (search: string) => normalizeSearchKeyword(search).length > 0;

export const resolveSearchScope = (search: string, selectedNoteId: string | null): SearchScope => {
  if (!shouldForceCollectionView(search)) {
    return "browse";
  }

  return selectedNoteId ? "search-detail" : "search-results";
};

export const shouldResetSearchSelection = (previousSearch: string, nextSearch: string, selectedNoteId: string | null) => {
  if (!selectedNoteId) return false;
  if (!shouldForceCollectionView(previousSearch) || !shouldForceCollectionView(nextSearch)) return false;
  return normalizeSearchKeyword(previousSearch) !== normalizeSearchKeyword(nextSearch);
};

export const resolveSearchNavigation = (previousSearch: string, nextSearch: string, selectedNoteId: string | null) => {
  const currentSearchMode = shouldForceCollectionView(previousSearch);
  const nextSearchMode = shouldForceCollectionView(nextSearch);
  const shouldResetSelection = shouldResetSearchSelection(previousSearch, nextSearch, selectedNoteId);
  const currentScope = resolveSearchScope(previousSearch, selectedNoteId);
  const nextSelectedNoteId = shouldResetSelection ? null : selectedNoteId;
  const nextScope = resolveSearchScope(nextSearch, nextSelectedNoteId);

  return {
    currentSearchMode,
    nextSearchMode,
    currentScope,
    nextScope,
    shouldResetSelection,
    shouldShowCollectionView: nextSelectedNoteId === null,
  };
};

export const shouldShowCollectionView = (_search: string, selectedNoteId: string | null) => {
  return selectedNoteId === null;
};

export function resolveContextNotes(notes: Note[], navTarget: NavTarget, search = ""): Note[] {
  const keyword = normalizeSearchKeyword(search);
  if (keyword) {
    return notes.filter((note) => matchesNoteSearch(note, keyword)).sort(byCreatedAtDesc);
  }

  if (navTarget.type === "folder") {
    return notes.filter((note) => note.folder_id === navTarget.folderId).sort(byCreatedAtDesc);
  }

  return [...notes].sort(byCreatedAtDesc);
}

export function resolveCollectionTitle(folders: Folder[], navTarget: NavTarget, search = ""): string {
  if (shouldForceCollectionView(search)) {
    return "搜索结果";
  }

  if (navTarget.type === "folder") {
    return folders.find((folder) => folder.id === navTarget.folderId)?.name ?? "当前文件夹";
  }

  return "全部笔记";
}

function filterSidebarFolderNode(node: SidebarFolderNode, keyword: string): SidebarFolderNode | null {
  const filteredChildren = node.children
    .map((child) => filterSidebarFolderNode(child, keyword))
    .filter((child): child is SidebarFolderNode => child !== null);
  const filteredNotes = node.notes.filter((note) => matchesNoteSearch(note, keyword));
  const folderMatched = node.name.toLowerCase().includes(keyword);

  if (!folderMatched && filteredChildren.length === 0 && filteredNotes.length === 0) {
    return null;
  }

  return {
    ...node,
    children: filteredChildren,
    notes: filteredNotes,
  };
}

export function buildSidebarFolderTree(folders: Folder[], notes: Note[], search = ""): SidebarFolderNode[] {
  const map = new Map<string, SidebarFolderNode>();
  const roots: SidebarFolderNode[] = [];
  const sortedFolders = [...folders].sort(byFolderCreatedAtDesc);

  for (const folder of sortedFolders) {
    map.set(folder.id, { ...folder, children: [], notes: [] });
  }

  for (const note of notes) {
    if (!note.folder_id) continue;
    map.get(note.folder_id)?.notes.push(note);
  }

  for (const node of map.values()) {
    node.notes.sort(byCreatedAtDesc);
  }

  for (const folder of sortedFolders) {
    const node = map.get(folder.id);
    if (!node) continue;
    if (folder.parent_id && map.has(folder.parent_id)) {
      map.get(folder.parent_id)?.children.push(node);
    } else {
      roots.push(node);
    }
  }

  for (const node of map.values()) {
    node.children.sort(byFolderCreatedAtDesc);
  }

  const keyword = normalizeSearchKeyword(search);
  if (!keyword) {
    return roots;
  }

  return roots
    .map((node) => filterSidebarFolderNode(node, keyword))
    .filter((node): node is SidebarFolderNode => node !== null);
}
