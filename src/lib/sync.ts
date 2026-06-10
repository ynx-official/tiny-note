import { db, type SyncAck, type SyncChange, type SyncFolderSnapshot, type SyncNoteSnapshot } from "./db";
import { archiveMarkdownImages } from "./assetArchive";
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

const SYNC_SETTINGS_SNAPSHOT_KEY = "kova-sync-settings-snapshot";

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
  cloud_id?: string | null;
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
    cloudId: payload.cloud_id ?? undefined,
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
    cloudId: payload.cloud_id ?? undefined,
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

function collectSyncSettingsSnapshot() {
  const values = SYNC_SETTING_KEYS.flatMap((settingKey) => {
    const settingValue = localStorage.getItem(settingKey);
    if (settingValue === null) return [];
    return [[settingKey, settingValue] as const];
  });
  return JSON.stringify(values);
}

function collectSyncSettings(): KovaSettingSyncItem[] {
  const snapshot = collectSyncSettingsSnapshot();
  if (localStorage.getItem(SYNC_SETTINGS_SNAPSHOT_KEY) === snapshot) return [];

  return (JSON.parse(snapshot) as Array<readonly [string, string]>).map(([settingKey, settingValue]) => ({
    settingKey,
    settingValue,
    valueType: inferSettingValueType(settingValue),
  }));
}

function markSyncSettingsSnapshotSynced() {
  localStorage.setItem(SYNC_SETTINGS_SNAPSHOT_KEY, collectSyncSettingsSnapshot());
}

async function archiveNoteImagesForSyncPush(notes: KovaNoteSyncItem[]) {
  const archiveCache = new Map<string, Promise<string>>();
  const archived: KovaNoteSyncItem[] = [];
  const rewrites = new Map<string, KovaNoteSyncItem>();
  for (const note of notes) {
    const result = await archiveMarkdownImages(note.content ?? "", archiveCache).catch(() => ({
      content: note.content ?? "",
      changed: false,
    }));
    const nextNote = {
      ...note,
      content: result.content,
      contentHash: contentHash(result.content),
    };
    archived.push(nextNote);
    if (result.changed) {
      rewrites.set(note.clientId, nextNote);
    }
  }
  return { notes: archived, rewrites };
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

type PulledCloudChange = {
  entityType?: string;
  entity_type?: string;
  type?: string;
  payload?: unknown;
  serverPayload?: unknown;
  server_payload?: unknown;
  data?: unknown;
  settingKey?: string;
  setting_key?: string;
  settingValue?: string;
  setting_value?: string;
};

function toPayloadText(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return JSON.stringify(value);
  return "{}";
}

function normalizePulledChange(change: unknown) {
  if (!change || typeof change !== "object") return null;
  const item = change as PulledCloudChange;
  const entityType = item.entityType ?? item.entity_type ?? item.type;
  const payload = item.serverPayload ?? item.server_payload ?? item.payload ?? item.data ?? item;
  if (!entityType) return null;
  return { entityType, payload: toPayloadText(payload) };
}

function applyPulledSetting(change: PulledCloudChange) {
  const settingKey = change.settingKey ?? change.setting_key;
  const settingValue = change.settingValue ?? change.setting_value;
  if (!settingKey || typeof settingValue !== "string") return false;
  localStorage.setItem(settingKey, settingValue);
  return true;
}

async function applyPulledChanges(changes: unknown[]) {
  let applied = 0;
  for (const change of changes) {
    const normalized = normalizePulledChange(change);
    if (!normalized) continue;
    if (normalized.entityType === "setting") {
      try {
        if (applyPulledSetting(JSON.parse(normalized.payload) as PulledCloudChange)) applied += 1;
      } catch {
        // 忽略无法识别的设置变更。
      }
      continue;
    }
    const result = await db.applySyncPayload({ entity_type: normalized.entityType, payload: normalized.payload });
    if (result.applied) applied += 1;
  }
  return applied;
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
  const archivedNotes = await archiveNoteImagesForSyncPush([...noteMap.values()]);
  const notes = archivedNotes.notes;
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
    for (const ack of acknowledgements) {
      if (ack.entity_type !== "note" || ack.status === "conflict") continue;
      const rewrite = archivedNotes.rewrites.get(ack.client_id);
      if (!rewrite?.content) continue;
      await db.rewriteNoteContentAfterSync({
        client_id: ack.client_id,
        content: rewrite.content,
        sync_version: ack.sync_version,
        cloud_id: ack.cloud_id,
      });
    }
    if (settings.length > 0 && !acknowledgements.some((ack) => ack.entity_type === "setting" && ack.status === "conflict")) {
      markSyncSettingsSnapshotSynced();
    }
  }

  const latestStatus = await db.getSyncStatus();
  let pullCursor = latestStatus.last_pull_cursor;
  let appliedPulled = 0;
  let hasMore = true;
  while (hasMore) {
    const pulled = await pullKovaSyncChanges({
      deviceId: latestStatus.device_id,
      cursor: pullCursor,
      limit: 500,
    });
    appliedPulled += await applyPulledChanges(pulled.changes);
    pullCursor = toNumber(pulled.cursor, pullCursor);
    hasMore = Boolean(pulled.hasMore && pulled.changes.length > 0);
  }
  await db.updatePullCursor(pullCursor);

  return {
    pushed: acknowledgements.filter((ack) => ack.status !== "conflict").length,
    pulled: appliedPulled,
    conflicts: acknowledgements.filter((ack) => ack.status === "conflict").length,
    cursor: Math.max(pushCursor, pullCursor),
  };
}