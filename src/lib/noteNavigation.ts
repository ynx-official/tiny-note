import type { Folder, Note } from "./db";

export type NavTarget =
  | { type: "all" }
  | { type: "folder"; folderId: string }
  | { type: "note"; noteId: string; folderId: string | null };

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

export const shouldForceCollectionView = (search: string) => normalizeSearchKeyword(search).length > 0;

export const shouldResetSearchSelection = (previousSearch: string, nextSearch: string, selectedNoteId: string | null) => {
  if (!selectedNoteId) return false;
  if (!shouldForceCollectionView(previousSearch) || !shouldForceCollectionView(nextSearch)) return false;
  return normalizeSearchKeyword(previousSearch) !== normalizeSearchKeyword(nextSearch);
};

export const shouldShowCollectionView = (search: string, selectedNoteId: string | null) => {
  if (!shouldForceCollectionView(search)) return selectedNoteId === null;
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
