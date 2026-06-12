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

export function resolveContextNotes(notes: Note[], navTarget: NavTarget): Note[] {
  if (navTarget.type === "folder") {
    return notes.filter((note) => note.folder_id === navTarget.folderId).sort(byCreatedAtDesc);
  }

  return [...notes].sort(byCreatedAtDesc);
}

export function resolveCollectionTitle(folders: Folder[], navTarget: NavTarget): string {
  if (navTarget.type === "folder") {
    return folders.find((folder) => folder.id === navTarget.folderId)?.name ?? "当前文件夹";
  }

  return "全部笔记";
}

export function buildSidebarFolderTree(folders: Folder[], notes: Note[]): SidebarFolderNode[] {
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

  return roots;
}