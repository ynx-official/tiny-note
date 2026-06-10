import { invoke } from "@tauri-apps/api/core";

export interface SyncAck {
  entity_type: string;
  client_id: string;
  cloud_id: string;
  sync_version: number;
  status: string;
}

export interface SyncStatus {
  mode: string;
  device_id: string;
  pending_changes: number;
  conflict_count: number;
  last_push_cursor: number;
  last_pull_cursor: number;
  last_synced_at: string | null;
}

export interface SyncChange {
  id: string;
  entity_type: string;
  entity_id: string;
  operation: string;
  payload: string;
  base_version: number;
  device_id: string;
  status: string;
  created_at: string;
  synced_at: string | null;
  error: string | null;
}

export interface SyncFolderSnapshot {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  sync_version: number;
  cloud_id: string | null;
  deleted_at: string | null;
}

export interface SyncNoteSnapshot {
  id: string;
  title: string;
  content: string;
  tags: string[];
  folder_id: string | null;
  created_at: string;
  updated_at: string;
  sync_version: number;
  cloud_id: string | null;
  deleted_at: string | null;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  folder_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export const db = {
  create: (title: string, content: string, tags: string[] = [], folderId?: string) =>
    invoke<Note>("create_note", { title, content, tags, folderId: folderId ?? null }),

  list: (search?: string, folderId?: string) =>
    invoke<Note[]>("get_notes", { search: search ?? null, folderId: folderId ?? null }),

  update: (id: string, changes: Partial<{ title: string; content: string; tags: string[]; folder_id: string | null }>) =>
    invoke<void>("update_note", { id, ...changes }),

  delete: (id: string) =>
    invoke<void>("delete_note", { id }),

  // Folder operations
  createFolder: (name: string, parentId?: string) =>
    invoke<Folder>("create_folder", { name, parentId: parentId ?? null }),

  listFolders: () =>
    invoke<Folder[]>("get_folders"),

  updateFolder: (id: string, name: string) =>
    invoke<void>("update_folder", { id, name }),

  deleteFolder: (id: string) =>
    invoke<void>("delete_folder", { id }),

  moveToFolder: (id: string, folderId?: string) =>
    invoke<void>("move_note_to_folder", { id, folderId: folderId ?? null }),

  getSyncStatus: () =>
    invoke<SyncStatus>("get_sync_status"),

  listPendingSyncChanges: () =>
    invoke<SyncChange[]>("list_pending_sync_changes"),

  listSyncFolderSnapshots: () =>
    invoke<SyncFolderSnapshot[]>("list_sync_folder_snapshots"),

  listSyncNoteSnapshots: () =>
    invoke<SyncNoteSnapshot[]>("list_sync_note_snapshots"),

  acknowledgeSyncPush: (acknowledgements: SyncAck[], cursor: number) =>
    invoke<void>("acknowledge_sync_push", { acknowledgements, cursor: Number(cursor) }),

  updatePullCursor: (cursor: number) =>
    invoke<void>("update_pull_cursor", { cursor: Number(cursor) }),

  getDataDir: () =>
    invoke<string>("get_data_dir"),

  setDataDir: (newDir: string) =>
    invoke<string>("set_data_dir", { newDir }),

  importMd: (path: string) =>
    invoke<Note>("import_md_file", { path }),

  importFile: (path: string) =>
    invoke<Note>("import_file", { path }),

  exportNote: (id: string, destDir: string) =>
    invoke<string>("export_note", { id, destDir }),

  exportNoteHtml: (id: string, destDir: string) =>
    invoke<string>("export_note_html", { id, destDir }),

  exportNoteTxt: (id: string, destDir: string) =>
    invoke<string>("export_note_txt", { id, destDir }),

  exportNotePdf: (id: string, destDir: string, watermark: string, watermarkOpacity: number) =>
    invoke<string>("export_note_pdf", { id, destDir, watermark, watermarkOpacity }),

  openPath: (path: string) =>
    invoke<void>("open_path", { path }),

  saveAttachment: (noteId: string, bytes: number[], mime: string, fileName?: string) =>
    invoke<string>("save_attachment", { noteId, bytes, mime, fileName: fileName ?? null }),

  readAttachment: (assetPath: string) =>
    invoke<[number[], string]>("read_attachment", { assetPath }),
};
