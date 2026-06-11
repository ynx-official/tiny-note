import { db, type SyncAck, type SyncAttachmentIndexItem, type SyncChange, type SyncFolderSnapshot, type SyncNoteSnapshot } from "./db";
import { archiveMarkdownImages } from "./assetArchive";
import {
  getCloudSession,
  pullKovaSyncChanges,
  pushKovaSyncChanges,
  registerKovaDevice,
  type KovaAttachmentSyncItem,
  type KovaFolderSyncItem,
  type KovaNoteSyncItem,
  type KovaSettingSyncItem,
  type KovaSyncPushResult,
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

export type SyncEntityStats = {
  notes: number;
  folders: number;
  attachments: number;
  settings: number;
};

export type SyncAssetStats = {
  archived: number;
  restored: number;
  uploadReused: number;
  downloadReused: number;
};

export type SyncErrorCategory = "auth" | "network" | "server" | "local" | "asset" | "conflict" | "unknown";

export type SyncRunDiagnostics = {
  runId: string;
  status: "running" | "success" | "failed" | "skipped";
  trigger: "manual" | "startup" | "online" | "interval" | "unknown";
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  online: boolean;
  deviceId?: string;
  cursors: {
    beforePush: number;
    afterPush: number;
    beforePull: number;
    afterPull: number;
  };
  queue: {
    pending: number;
    failed: number;
  };
  pushed: SyncEntityStats;
  pulled: SyncEntityStats;
  skipped: SyncEntityStats;
  conflicts: SyncEntityStats;
  assets: SyncAssetStats;
  error?: {
    category: SyncErrorCategory;
    message: string;
  };
};

export type CloudSyncResult = {
  runId: string;
  pushed: number;
  pulled: number;
  skipped: number;
  conflicts: number;
  cursor: number;
  diagnostics: SyncRunDiagnostics;
};

export const SYNC_DIAGNOSTICS_STORAGE_KEY = "kova-sync-last-diagnostics";

const emptyEntityStats = (): SyncEntityStats => ({ notes: 0, folders: 0, attachments: 0, settings: 0 });

function sumEntityStats(stats: SyncEntityStats) {
  return stats.notes + stats.folders + stats.attachments + stats.settings;
}

function createRunId() {
  return `sync-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function classifySyncError(error: unknown): SyncErrorCategory {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  if (message.includes("登录") || message.includes("认证") || message.includes("unauthorized") || message.includes("401") || message.includes("403")) return "auth";
  if (message.includes("network") || message.includes("fetch") || message.includes("timeout") || message.includes("离线")) return "network";
  if (message.includes("500") || message.includes("502") || message.includes("503") || message.includes("server")) return "server";
  if (message.includes("附件") || message.includes("asset") || message.includes("image")) return "asset";
  if (message.includes("冲突") || message.includes("conflict")) return "conflict";
  if (message.includes("sqlite") || message.includes("数据库") || message.includes("本地")) return "local";
  return "unknown";
}

export function loadLastSyncDiagnostics(): SyncRunDiagnostics | null {
  try {
    const raw = localStorage.getItem(SYNC_DIAGNOSTICS_STORAGE_KEY);
    return raw ? JSON.parse(raw) as SyncRunDiagnostics : null;
  } catch {
    return null;
  }
}

export function saveLastSyncDiagnostics(diagnostics: SyncRunDiagnostics) {
  localStorage.setItem(SYNC_DIAGNOSTICS_STORAGE_KEY, JSON.stringify(diagnostics, null, 2));
  window.dispatchEvent(new CustomEvent("kova-sync-diagnostics-changed", { detail: diagnostics }));
}

export function createSkippedSyncDiagnostics(trigger: SyncRunDiagnostics["trigger"], message: string, category: SyncErrorCategory = "unknown") {
  const now = new Date().toISOString();
  const diagnostics: SyncRunDiagnostics = {
    runId: createRunId(),
    status: "skipped",
    trigger,
    startedAt: now,
    finishedAt: now,
    durationMs: 0,
    online: navigator.onLine,
    cursors: { beforePush: 0, afterPush: 0, beforePull: 0, afterPull: 0 },
    queue: { pending: 0, failed: 0 },
    pushed: emptyEntityStats(),
    pulled: emptyEntityStats(),
    skipped: emptyEntityStats(),
    conflicts: emptyEntityStats(),
    assets: { archived: 0, restored: 0, uploadReused: 0, downloadReused: 0 },
    error: { category, message },
  };
  saveLastSyncDiagnostics(diagnostics);
  return diagnostics;
}

function finishDiagnostics(diagnostics: SyncRunDiagnostics, status: SyncRunDiagnostics["status"], error?: unknown) {
  const finishedAt = new Date().toISOString();
  const finished: SyncRunDiagnostics = {
    ...diagnostics,
    status,
    finishedAt,
    durationMs: Math.max(0, new Date(finishedAt).getTime() - new Date(diagnostics.startedAt).getTime()),
    error: error ? {
      category: classifySyncError(error),
      message: error instanceof Error ? error.message : String(error),
    } : diagnostics.error,
  };
  saveLastSyncDiagnostics(finished);
  return finished;
}

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

function attachmentIndexToSyncItem(item: SyncAttachmentIndexItem, noteMap: Map<string, KovaNoteSyncItem>): KovaAttachmentSyncItem | null {
  const note = noteMap.get(item.note_id);
  if (!note) return null;
  if (!item.cloud_url || item.upload_status !== "uploaded") return null;
  return {
    noteCloudId: note.cloudId ?? null,
    noteClientId: item.note_id,
    assetPath: item.asset_path,
    fileName: item.file_name,
    mimeType: item.mime_type,
    fileSize: item.file_size,
    sha256: item.sha256,
    storageKey: item.cloud_url,
    fileId: item.cloud_file_id,
    deletedAt: item.deleted_at,
  };
}

function guessAttachmentFileName(item: SyncAttachmentIndexItem) {
  const raw = item.file_name || item.asset_path.split("/").pop() || "attachment";
  return raw.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "attachment";
}

async function restoreMissingAttachmentFiles() {
  const items = await db.listAttachmentIndex();
  const existingAssetPathBySha = new Map<string, string>();
  const restoredByCloudUrl = new Map<string, Promise<string | null>>();
  let restored = 0;
  let downloadReused = 0;

  for (const item of items) {
    if (!item.deleted_at && item.sha256 && item.asset_path.startsWith("kova-asset://")) {
      try {
        await db.readAttachment(item.asset_path);
        existingAssetPathBySha.set(item.sha256, item.asset_path);
      } catch {
        // 当前索引文件缺失，后续继续补齐。
      }
    }
  }

  for (const item of items) {
    if (!item.cloud_url || item.deleted_at) continue;
    if (item.asset_path.startsWith("kova-asset://")) {
      try {
        await db.readAttachment(item.asset_path);
        if (item.sha256) existingAssetPathBySha.set(item.sha256, item.asset_path);
        continue;
      } catch {
        // 索引存在但本地文件缺失，继续从云端补齐。
      }
    }

    const reusableLocalAssetPath = item.sha256 ? existingAssetPathBySha.get(item.sha256) ?? null : null;
    if (reusableLocalAssetPath) {
      await db.upsertAttachmentIndex({
        asset_path: reusableLocalAssetPath,
        note_id: item.note_id,
        file_name: guessAttachmentFileName(item),
        mime_type: item.mime_type,
        file_size: item.file_size,
        sha256: item.sha256,
        cloud_url: item.cloud_url,
        cloud_file_id: item.cloud_file_id,
        upload_status: "synced",
      });
      await db.replaceNoteAttachmentUrl(item.note_id, item.cloud_url, reusableLocalAssetPath);
      if (item.asset_path !== reusableLocalAssetPath) {
        await db.markAttachmentIndexDeleted([item.asset_path]);
      }
      downloadReused += 1;
      continue;
    }

    let restorePromise = restoredByCloudUrl.get(item.cloud_url);
    if (!restorePromise) {
      restorePromise = (async () => {
        const [bytes, mime] = await db.downloadRemoteImage(item.cloud_url as string);
        const localAssetPath = await db.saveAttachment(item.note_id, bytes, mime, guessAttachmentFileName(item));
        await db.upsertAttachmentIndex({
          asset_path: localAssetPath,
          note_id: item.note_id,
          file_name: guessAttachmentFileName(item),
          mime_type: mime,
          file_size: bytes.length,
          sha256: item.sha256,
          cloud_url: item.cloud_url,
          cloud_file_id: item.cloud_file_id,
          upload_status: "synced",
        });
        if (item.sha256) existingAssetPathBySha.set(item.sha256, localAssetPath);
        restored += 1;
        return localAssetPath;
      })().catch((error) => {
        restoredByCloudUrl.delete(item.cloud_url as string);
        throw error;
      });
      restoredByCloudUrl.set(item.cloud_url, restorePromise);
    } else {
      downloadReused += 1;
    }

    try {
      const localAssetPath = await restorePromise;
      if (!localAssetPath) continue;
      if (item.sha256) existingAssetPathBySha.set(item.sha256, localAssetPath);
      await db.upsertAttachmentIndex({
        asset_path: localAssetPath,
        note_id: item.note_id,
        file_name: guessAttachmentFileName(item),
        mime_type: item.mime_type,
        file_size: item.file_size,
        sha256: item.sha256,
        cloud_url: item.cloud_url,
        cloud_file_id: item.cloud_file_id,
        upload_status: "synced",
      });
      await db.replaceNoteAttachmentUrl(item.note_id, item.cloud_url, localAssetPath);
      if (item.asset_path !== localAssetPath) {
        await db.markAttachmentIndexDeleted([item.asset_path]);
      }
    } catch {
      // 缺失附件补齐失败不阻断笔记正文同步，下次同步继续尝试。
    }
  }

  return { restored, downloadReused };
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
  let archivedCount = 0;
  let uploadReused = 0;
  for (const note of notes) {
    const result = await archiveMarkdownImages(note.content ?? "", archiveCache, note.clientId).catch(() => ({
      content: note.content ?? "",
      changed: false,
      reused: 0,
    }));
    const nextNote = {
      ...note,
      content: result.content,
      contentHash: contentHash(result.content),
    };
    archived.push(nextNote);
    uploadReused += result.reused;
    if (result.changed) {
      archivedCount += 1;
      rewrites.set(note.clientId, nextNote);
    }
  }
  return { notes: archived, rewrites, archivedCount, uploadReused };
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

function normalizeEntityType(value: string) {
  if (value === "note" || value === "folder" || value === "attachment" || value === "setting") return value;
  return null;
}

async function applyPulledChanges(changes: unknown[]) {
  let applied = 0;
  let skipped = 0;
  const pulled = emptyEntityStats();
  const skippedByType = emptyEntityStats();
  for (const change of changes) {
    const normalized = normalizePulledChange(change);
    if (!normalized) continue;
    const entityType = normalizeEntityType(normalized.entityType);
    if (normalized.entityType === "setting") {
      try {
        if (applyPulledSetting(JSON.parse(normalized.payload) as PulledCloudChange)) {
          applied += 1;
          pulled.settings += 1;
        }
      } catch {
        // 忽略无法识别的设置变更。
      }
      continue;
    }
    const result = await db.applySyncPayload({ entity_type: normalized.entityType, payload: normalized.payload });
    if (result.applied) {
      applied += 1;
      if (entityType) pulled[`${entityType}s` as keyof SyncEntityStats] += 1;
    }
    if (result.skipped) {
      skipped += 1;
      if (entityType) skippedByType[`${entityType}s` as keyof SyncEntityStats] += 1;
    }
  }
  return { applied, skipped, pulled, skippedByType };
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

export async function syncKovaCloud(trigger: SyncRunDiagnostics["trigger"] = "manual"): Promise<CloudSyncResult> {
  const session = getCloudSession();
  if (!session) throw new Error("请先登录");

  const startedAt = new Date().toISOString();
  const runId = createRunId();
  const status = await db.getSyncStatus();
  const diagnostics: SyncRunDiagnostics = {
    runId,
    status: "running",
    trigger,
    startedAt,
    online: navigator.onLine,
    deviceId: status.device_id,
    cursors: {
      beforePush: status.last_push_cursor,
      afterPush: status.last_push_cursor,
      beforePull: status.last_pull_cursor,
      afterPull: status.last_pull_cursor,
    },
    queue: { pending: 0, failed: 0 },
    pushed: emptyEntityStats(),
    pulled: emptyEntityStats(),
    skipped: emptyEntityStats(),
    conflicts: emptyEntityStats(),
    assets: { archived: 0, restored: 0, uploadReused: 0, downloadReused: 0 },
  };
  saveLastSyncDiagnostics(diagnostics);

  try {
    await registerKovaDevice({
      deviceId: status.device_id,
      deviceName: getDeviceName(),
      platform: getPlatform(),
      appVersion: APP_VERSION,
    });

    const pending = await db.listPendingSyncChanges();
    diagnostics.queue = {
      pending: pending.filter((change) => change.status === "pending").length,
      failed: pending.filter((change) => change.status === "failed").length,
    };
    saveLastSyncDiagnostics(diagnostics);

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
    diagnostics.assets.archived = archivedNotes.archivedCount;
    diagnostics.assets.uploadReused = archivedNotes.uploadReused;

    const attachmentIndex = await db.listAttachmentIndex();
    const attachments = attachmentIndex
      .map((item) => attachmentIndexToSyncItem(item, noteMap))
      .filter((item): item is KovaAttachmentSyncItem => Boolean(item));
    const settings = collectSyncSettings();

    let pushCursor = status.last_push_cursor;
    let acknowledgements: SyncAck[] = [];
    if (folders.length > 0 || notes.length > 0 || attachments.length > 0 || settings.length > 0) {
      const pushedChangeIds = pending
        .filter((change) => change.entity_type === "folder" || change.entity_type === "note")
        .map((change) => change.id);
      let pushed: KovaSyncPushResult;
      try {
        pushed = await pushKovaSyncChanges({
          deviceId: status.device_id,
          folders,
          notes,
          attachments,
          settings,
        });
      } catch (error) {
        await db.markSyncPushFailed(pushedChangeIds, String(error));
        throw error;
      }
      pushCursor = toNumber(pushed.cursor, pushCursor);
      diagnostics.cursors.afterPush = pushCursor;
      acknowledgements = pushed.acknowledgements.map(toLocalAck);
      diagnostics.pushed = {
        notes: acknowledgements.filter((ack) => ack.entity_type === "note" && ack.status !== "conflict").length,
        folders: acknowledgements.filter((ack) => ack.entity_type === "folder" && ack.status !== "conflict").length,
        attachments: acknowledgements.filter((ack) => ack.entity_type === "attachment" && ack.status !== "conflict").length,
        settings: acknowledgements.filter((ack) => ack.entity_type === "setting" && ack.status !== "conflict").length,
      };
      diagnostics.conflicts = {
        notes: acknowledgements.filter((ack) => ack.entity_type === "note" && ack.status === "conflict").length,
        folders: acknowledgements.filter((ack) => ack.entity_type === "folder" && ack.status === "conflict").length,
        attachments: acknowledgements.filter((ack) => ack.entity_type === "attachment" && ack.status === "conflict").length,
        settings: acknowledgements.filter((ack) => ack.entity_type === "setting" && ack.status === "conflict").length,
      };
      saveLastSyncDiagnostics(diagnostics);

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
    diagnostics.cursors.beforePull = pullCursor;
    let appliedPulled = 0;
    let skippedPulled = 0;
    let hasMore = true;
    while (hasMore) {
      const pulled = await pullKovaSyncChanges({
        deviceId: latestStatus.device_id,
        cursor: pullCursor,
        limit: 500,
      });
      const applied = await applyPulledChanges(pulled.changes);
      appliedPulled += applied.applied;
      skippedPulled += applied.skipped;
      diagnostics.pulled.notes += applied.pulled.notes;
      diagnostics.pulled.folders += applied.pulled.folders;
      diagnostics.pulled.attachments += applied.pulled.attachments;
      diagnostics.pulled.settings += applied.pulled.settings;
      diagnostics.skipped.notes += applied.skippedByType.notes;
      diagnostics.skipped.folders += applied.skippedByType.folders;
      diagnostics.skipped.attachments += applied.skippedByType.attachments;
      diagnostics.skipped.settings += applied.skippedByType.settings;
      pullCursor = toNumber(pulled.cursor, pullCursor);
      diagnostics.cursors.afterPull = pullCursor;
      hasMore = Boolean(pulled.hasMore && pulled.changes.length > 0);
      saveLastSyncDiagnostics(diagnostics);
    }
    await db.updatePullCursor(pullCursor);
    const restoredAssets = await restoreMissingAttachmentFiles();
    diagnostics.assets.restored = restoredAssets.restored;
    diagnostics.assets.downloadReused = restoredAssets.downloadReused;

    const finished = finishDiagnostics(diagnostics, "success");
    return {
      runId,
      pushed: sumEntityStats(finished.pushed),
      pulled: appliedPulled,
      skipped: skippedPulled,
      conflicts: sumEntityStats(finished.conflicts),
      cursor: Math.max(pushCursor, pullCursor),
      diagnostics: finished,
    };
  } catch (error) {
    finishDiagnostics(diagnostics, "failed", error);
    throw error;
  }
}