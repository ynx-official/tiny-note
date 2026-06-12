import type { SyncErrorCategory, SyncRunDiagnostics } from "./sync";

export type SyncStatusTone = "success" | "warning" | "danger" | "muted";

export interface SyncStatusCopyInput {
  isCloudLoggedIn: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  failedSyncCount: number;
  pendingSyncCount: number;
  conflictCount: number;
  lastSyncError: string | null;
  lastSyncDiagnostics: SyncRunDiagnostics | null;
  lastSyncedAt: string;
}

export interface SyncStatusCopy {
  label: string;
  detail: string;
  tone: SyncStatusTone;
}

export function describeSyncErrorCategory(category: SyncErrorCategory | undefined) {
  switch (category) {
    case "auth":
      return "登录状态已失效，请重新登录";
    case "network":
      return "网络连接异常，稍后会自动重试";
    case "server":
      return "云端服务暂时不可用，请稍后再试";
    case "local":
      return "本地同步数据异常，请检查当前数据目录";
    case "asset":
      return "附件同步异常，请稍后重试";
    case "conflict":
      return "检测到同步冲突，请先处理冲突";
    default:
      return "同步出现异常，请稍后重试";
  }
}

export function resolveSyncStatusCopy(input: SyncStatusCopyInput): SyncStatusCopy {
  const {
    isCloudLoggedIn,
    isOnline,
    isSyncing,
    failedSyncCount,
    pendingSyncCount,
    conflictCount,
    lastSyncError,
    lastSyncDiagnostics,
    lastSyncedAt,
  } = input;

  if (!isCloudLoggedIn) {
    return {
      label: "未登录同步",
      detail: "登录后可在多端保持一致",
      tone: "muted",
    };
  }

  if (!isOnline) {
    return {
      label: "离线中",
      detail: "恢复网络后会继续同步",
      tone: "warning",
    };
  }

  if (isSyncing) {
    return {
      label: "正在同步",
      detail: "正在整理并上传最新更改",
      tone: "warning",
    };
  }

  if (conflictCount > 0) {
    return {
      label: `${conflictCount} 条冲突待处理`,
      detail: "请先处理冲突，再继续保持多端一致",
      tone: "danger",
    };
  }

  if (failedSyncCount > 0 || lastSyncError || lastSyncDiagnostics?.status === "failed") {
    return {
      label: failedSyncCount > 0 ? `${failedSyncCount} 条改动同步失败` : "同步失败",
      detail: lastSyncError ?? describeSyncErrorCategory(lastSyncDiagnostics?.error?.category),
      tone: "danger",
    };
  }

  if (lastSyncDiagnostics?.status === "skipped") {
    const detail = describeSyncErrorCategory(lastSyncDiagnostics.error?.category);
    const isAuthIssue = lastSyncDiagnostics.error?.category === "auth";
    return {
      label: isAuthIssue ? "需要登录" : "同步暂未执行",
      detail,
      tone: isAuthIssue ? "warning" : "muted",
    };
  }

  if (pendingSyncCount > 0) {
    return {
      label: `${pendingSyncCount} 条改动待同步`,
      detail: "空闲后会自动同步，也可以手动立即同步",
      tone: "warning",
    };
  }

  if (lastSyncedAt === "未同步") {
    return {
      label: "尚未完成首次同步",
      detail: "可以先手动同步一次，建立首个云端基线",
      tone: "muted",
    };
  }

  return {
    label: "已同步",
    detail: `上次同步 ${lastSyncedAt}`,
    tone: "success",
  };
}