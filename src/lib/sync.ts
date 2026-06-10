import { db, type SyncAck, type SyncChange, type SyncFolderSnapshot, type SyncNoteSnapshot } from "./db";
import {
  getCloudSession,
  pullKovaSyncChanges,
  pushKovaSyncChanges,
  registerKovaDevice,
  type KovaFolderSyncItem,
  type KovaNoteSyncItem,
  type KovaSettingSyncItem,
} from "./cloudApi";

const APP_VERSION = "0.1.0";

const SYNC_SETTING_KEYS = [
  "fp-mode",
  "fp-accent",
  "fp-font-size",
  "fp-line-height",
  "fp-font-family",
  "fp-editor-mode",
  "fp-preview-mode",
  "kova-sort-field",
  "kova-sort-dir",
] as const;

type PendingPayload = {
  id?: string;
  title?: string;
  content?: string;
  tags?: string[];
  folder_id?: string | null;
  name?: string;
  parent_id?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
};

export type CloudSyncResult = {
  pushed: number;
  pulled: number;
  conflicts: number;
  cursor: number;
};

function toNumber(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePayload(change: SyncChange): PendingPayload {
  try {
    return JSON.parse(change.payload) as PendingPayload;
  } catch {
    throw new Error(`同步变更内容格式错误：${change.entity_type}/${change.entity_id}`);
  }
}

function contentHash(content: string | null | undefined) {
  if (!content) return null;
  let hash = 0;
  for (let index = 0; index < content.length; index += 1) {
    hash = Math.imul(31, hash) + content.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

function toLocalDateTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 19);
}

function toFolderSyncItem(change: SyncChange): KovaFolderSyncItem {
  const payload = parsePayload(change);
  return {
    clientId: payload.id || change.entity_id,
    parentClientId: payload.parent_id ?? null,
    name: payload.name ?? null,
    baseVersion: change.base_version,
    clientCreatedAt: toLocalDateTime(payload.created_at),
    clientUpdatedAt: toLocalDateTime(payload.updated_at),
    deletedAt: toLocalDateTime(payload.deleted_at),
  };
}

function folderSnapshotToSyncItem(folder: SyncFolderSnapshot): KovaFolderSyncItem {
  return {
    cloudId: folder.cloud_id,
    clientId: folder.id,
    parentClientId: folder.parent_id,
    name: folder.name,
    baseVersion: folder.sync_version,
    syncVersion: folder.sync_version,
    clientCreatedAt: toLocalDateTime(folder.created_at),
    clientUpdatedAt: toLocalDateTime(folder.updated_at),
    deletedAt: toLocalDateTime(folder.deleted_at),
  };
}

function toNoteSyncItem(change: SyncChange): KovaNoteSyncItem {
  const payload = parsePayload(change);
  const content = payload.content ?? "";
  return {
    clientId: payload.id || change.entity_id,
    folderClientId: payload.folder_id ?? null,
    title: payload.title ?? "",
    content,
    tags: JSON.stringify(payload.tags ?? []),
    noteType: "note",
    done: 0,
    baseVersion: change.base_version,
    contentHash: contentHash(content),
    clientCreatedAt: toLocalDateTime(payload.created_at),
    clientUpdatedAt: toLocalDateTime(payload.updated_at),
    deletedAt: toLocalDateTime(payload.deleted_at),
  };
}

function noteSnapshotToSyncItem(note: SyncNoteSnapshot): KovaNoteSyncItem {
  return {
    cloudId: note.cloud_id,
    clientId: note.id,
    folderClientId: note.folder_id,
    title: note.title,
    content: note.content,
    tags: JSON.stringify(note.tags),
    noteType: "note",
    done: 0,
    baseVersion: note.sync_version,
    syncVersion: note.sync_version,
    contentHash: contentHash(note.content),
    clientCreatedAt: toLocalDateTime(note.created_at),
    clientUpdatedAt: toLocalDateTime(note.updated_at),
    deletedAt: toLocalDateTime(note.deleted_at),
  };
}

function inferSettingValueType(value: string): KovaSettingSyncItem["valueType"] {
  if (value === "true" || value === "false") return "boolean";
  if (value !== "" && Number.isFinite(Number(value))) return "number";
  try {
    JSON.parse(value);
    return "json";
  } catch {
    return "string";
  }
}

function collectSyncSettings(): KovaSettingSyncItem[] {
  return SYNC_SETTING_KEYS.flatMap((settingKey) => {
    const settingValue = localStorage.getItem(settingKey);
    if (settingValue === null) return [];
    return [{
      settingKey,
      settingValue,
      valueType: inferSettingValueType(settingValue),
      baseVersion: 0,
      syncVersion: 0,
    }];
  });
}

function toLocalAck(ack: { entityType: string; clientId: string; cloudId: string; syncVersion: number | string; status: string }): SyncAck {
  return {
    entity_type: ack.entityType,
    client_id: ack.clientId,
    cloud_id: ack.cloudId,
    sync_version: toNumber(ack.syncVersion),
    status: ack.status,
  };
}

function getDeviceName() {
  return navigator.userAgent.includes("Windows") ? "Windows 设备" : "Kova 设备";
}

function getPlatform() {
  if (navigator.userAgent.includes("Windows")) return "Windows";
  if (navigator.userAgent.includes("Mac")) return "macOS";
  if (navigator.userAgent.includes("Linux")) return "Linux";
  return "Desktop";
}

export async function syncKovaCloud(): Promise<CloudSyncResult> {
  const session = getCloudSession();
  if (!session) throw new Error("请先登录");

  const status = await db.getSyncStatus();
  await registerKovaDevice({
    deviceId: status.device_id,
    deviceName: getDeviceName(),
    platform: getPlatform(),
    appVersion: APP_VERSION,
  });

  const pending = await db.listPendingSyncChanges();
  const folderSnapshots = await db.listSyncFolderSnapshots();
  const noteSnapshots = await db.listSyncNoteSnapshots();
  const folderMap = new Map<string, KovaFolderSyncItem>();
  const noteMap = new Map<string, KovaNoteSyncItem>();

  folderSnapshots
    .filter((folder) => status.last_push_cursor === 0 || !folder.cloud_id)
    .forEach((folder) => {
      folderMap.set(folder.id, folderSnapshotToSyncItem(folder));
    });
  noteSnapshots
    .filter((note) => status.last_push_cursor === 0 || !note.cloud_id)
    .forEach((note) => {
      noteMap.set(note.id, noteSnapshotToSyncItem(note));
    });
  pending.filter((change) => change.entity_type === "folder").forEach((change) => {
    const item = toFolderSyncItem(change);
    folderMap.set(item.clientId, item);
  });
  pending.filter((change) => change.entity_type === "note").forEach((change) => {
    const item = toNoteSyncItem(change);
    noteMap.set(item.clientId, item);
  });

  const folders = [...folderMap.values()];
  const notes = [...noteMap.values()];
  const settings = collectSyncSettings();

  let pushCursor = status.last_push_cursor;
  let acknowledgements: SyncAck[] = [];
  if (folders.length > 0 || notes.length > 0 || settings.length > 0) {
    const pushed = await pushKovaSyncChanges({
      deviceId: status.device_id,
      folders,
      notes,
      attachments: [],
      settings,
    });
    pushCursor = toNumber(pushed.cursor, pushCursor);
    acknowledgements = pushed.acknowledgements.map(toLocalAck);
    await db.acknowledgeSyncPush(acknowledgements, pushCursor);
  }

  const latestStatus = await db.getSyncStatus();
  const pulled = await pullKovaSyncChanges({
    deviceId: latestStatus.device_id,
    cursor: latestStatus.last_pull_cursor,
    limit: 500,
  });
  const pullCursor = toNumber(pulled.cursor, latestStatus.last_pull_cursor);
  await db.updatePullCursor(pullCursor);

  return {
    pushed: acknowledgements.filter((ack) => ack.status !== "conflict").length,
    pulled: pulled.changes.length,
    conflicts: acknowledgements.filter((ack) => ack.status === "conflict").length,
    cursor: Math.max(pushCursor, pullCursor),
  };
}