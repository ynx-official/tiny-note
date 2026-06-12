import { describe, expect, it } from "vitest";
import { describeSyncErrorCategory, resolveSyncStatusCopy } from "./syncStatusCopy";

describe("resolveSyncStatusCopy", () => {
  it("未登录时优先提示先登录同步", () => {
    expect(resolveSyncStatusCopy({
      isCloudLoggedIn: false,
      isOnline: true,
      isSyncing: false,
      failedSyncCount: 0,
      pendingSyncCount: 0,
      conflictCount: 0,
      lastSyncError: null,
      lastSyncDiagnostics: null,
      lastSyncedAt: "未同步",
    })).toMatchObject({
      label: "未登录同步",
      detail: "登录后可在多端保持一致",
      tone: "muted",
    });
  });

  it("离线时优先返回离线状态", () => {
    expect(resolveSyncStatusCopy({
      isCloudLoggedIn: true,
      isOnline: false,
      isSyncing: false,
      failedSyncCount: 0,
      pendingSyncCount: 3,
      conflictCount: 0,
      lastSyncError: null,
      lastSyncDiagnostics: null,
      lastSyncedAt: "未同步",
    })).toMatchObject({
      label: "离线中",
      detail: "恢复网络后会继续同步",
      tone: "warning",
    });
  });

  it("冲突优先于普通待同步状态", () => {
    expect(resolveSyncStatusCopy({
      isCloudLoggedIn: true,
      isOnline: true,
      isSyncing: false,
      failedSyncCount: 0,
      pendingSyncCount: 5,
      conflictCount: 2,
      lastSyncError: null,
      lastSyncDiagnostics: null,
      lastSyncedAt: "06/11 10:00",
    })).toMatchObject({
      label: "2 条冲突待处理",
      detail: "请先处理冲突，再继续保持多端一致",
      tone: "danger",
    });
  });

  it("失败时保留更可读的错误说明", () => {
    expect(resolveSyncStatusCopy({
      isCloudLoggedIn: true,
      isOnline: true,
      isSyncing: false,
      failedSyncCount: 1,
      pendingSyncCount: 0,
      conflictCount: 0,
      lastSyncError: null,
      lastSyncDiagnostics: {
        runId: "sync-demo",
        status: "failed",
        trigger: "manual",
        startedAt: "2026-06-11T10:00:00.000Z",
        online: true,
        cursors: { beforePush: 0, afterPush: 0, beforePull: 0, afterPull: 0 },
        queue: { pending: 0, failed: 1 },
        pushed: { notes: 0, folders: 0, attachments: 0, settings: 0 },
        pulled: { notes: 0, folders: 0, attachments: 0, settings: 0 },
        skipped: { notes: 0, folders: 0, attachments: 0, settings: 0 },
        conflicts: { notes: 0, folders: 0, attachments: 0, settings: 0 },
        assets: { archived: 0, restored: 0, uploadReused: 0, downloadReused: 0 },
        error: { category: "network", message: "timeout" },
      },
      lastSyncedAt: "06/11 10:00",
    })).toMatchObject({
      label: "1 条改动同步失败",
      detail: "网络连接异常，稍后会自动重试",
      tone: "danger",
    });
  });

  it("跳过同步时返回人话化说明", () => {
    expect(resolveSyncStatusCopy({
      isCloudLoggedIn: true,
      isOnline: true,
      isSyncing: false,
      failedSyncCount: 0,
      pendingSyncCount: 0,
      conflictCount: 0,
      lastSyncError: null,
      lastSyncDiagnostics: {
        runId: "sync-demo",
        status: "skipped",
        trigger: "manual",
        startedAt: "2026-06-11T10:00:00.000Z",
        online: true,
        cursors: { beforePush: 0, afterPush: 0, beforePull: 0, afterPull: 0 },
        queue: { pending: 0, failed: 0 },
        pushed: { notes: 0, folders: 0, attachments: 0, settings: 0 },
        pulled: { notes: 0, folders: 0, attachments: 0, settings: 0 },
        skipped: { notes: 0, folders: 0, attachments: 0, settings: 0 },
        conflicts: { notes: 0, folders: 0, attachments: 0, settings: 0 },
        assets: { archived: 0, restored: 0, uploadReused: 0, downloadReused: 0 },
        error: { category: "local", message: "db locked" },
      },
      lastSyncedAt: "未同步",
    })).toMatchObject({
      label: "同步暂未执行",
      detail: "本地同步数据异常，请检查当前数据目录",
      tone: "muted",
    });
  });

  it("无待办时返回已同步", () => {
    expect(resolveSyncStatusCopy({
      isCloudLoggedIn: true,
      isOnline: true,
      isSyncing: false,
      failedSyncCount: 0,
      pendingSyncCount: 0,
      conflictCount: 0,
      lastSyncError: null,
      lastSyncDiagnostics: null,
      lastSyncedAt: "06/11 10:00",
    })).toMatchObject({
      label: "已同步",
      detail: "上次同步 06/11 10:00",
      tone: "success",
    });
  });
});

describe("describeSyncErrorCategory", () => {
  it("返回可读的认证错误文案", () => {
    expect(describeSyncErrorCategory("auth")).toBe("登录状态已失效，请重新登录");
  });
});