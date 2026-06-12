import { useState, useEffect } from "react";
import type { Note, SyncStatus } from "../lib/db";
import type { NoteSaveStatus } from "../lib/noteSaveStatus";
import { loadFontSize } from "../lib/theme";
import { loadZoom } from "../lib/zoom";
import { describeSyncErrorCategory, resolveSyncStatusCopy } from "../lib/syncStatusCopy";
import type { SyncRunDiagnostics } from "../lib/sync";

interface StatusBarProps {
  selectedNote: Note | null;
  noteCount: number;
  noteSaveStatus: NoteSaveStatus | null;
  syncStatus: SyncStatus | null;
  failedSyncCount: number;
  isCloudLoggedIn: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncError: string | null;
  lastSyncDiagnostics: SyncRunDiagnostics | null;
  onRetrySync: () => void;
}

export function StatusBar({ selectedNote, noteCount, noteSaveStatus, syncStatus, failedSyncCount, isCloudLoggedIn, isOnline, isSyncing, lastSyncError, lastSyncDiagnostics, onRetrySync }: StatusBarProps) {
  const [fontSize, setFontSize] = useState(loadFontSize);
  const [zoom, setZoom] = useState(() => Math.round(loadZoom() * 100));

  const pendingSyncCount = syncStatus?.pending_changes ?? 0;
  const conflictCount = syncStatus?.conflict_count ?? 0;
  const lastSyncedAt = syncStatus?.last_synced_at
    ? new Date(syncStatus.last_synced_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "未同步";
  const lastRunText = lastSyncDiagnostics
    ? `${lastSyncDiagnostics.runId} · ${lastSyncDiagnostics.status}${lastSyncDiagnostics.error ? ` · ${lastSyncDiagnostics.error.category}` : ""}`
    : `最近同步 ${lastSyncedAt}`;
  const syncCopy = resolveSyncStatusCopy({
    isCloudLoggedIn,
    isOnline,
    isSyncing,
    failedSyncCount,
    pendingSyncCount,
    conflictCount,
    lastSyncError,
    lastSyncDiagnostics,
    lastSyncedAt,
  });
  const syncToneClass = syncCopy.tone === "danger"
    ? "text-red-500 hover:text-red-400"
    : syncCopy.tone === "warning"
      ? "text-amber-600 hover:text-amber-500"
      : syncCopy.tone === "success"
        ? "hover:text-accent"
        : "text-ink-ghost hover:text-ink-soft";
  const syncDetailText = lastSyncDiagnostics?.status === "failed"
    ? describeSyncErrorCategory(lastSyncDiagnostics.error?.category)
    : lastSyncDiagnostics?.status === "skipped"
      ? describeSyncErrorCategory(lastSyncDiagnostics.error?.category)
      : syncCopy.detail;
  const noteSaveToneClass = noteSaveStatus?.tone === "danger"
    ? "text-red-500"
    : noteSaveStatus?.tone === "warning"
      ? "text-amber-600"
      : noteSaveStatus?.tone === "success"
        ? "text-accent"
        : "text-ink-ghost";

  useEffect(() => {
    const handler = (e: Event) => {
      const { key, value } = (e as CustomEvent).detail;
      if (key === "font-size") setFontSize(value);
      if (key === "zoom") setZoom(Math.round(value * 100));
    };
    window.addEventListener("fp-settings-changed", handler);
    return () => window.removeEventListener("fp-settings-changed", handler);
  }, []);

  return (
    <div className="h-8 px-4 flex items-center justify-between gap-4 text-[11px] border-t border-[var(--border-soft)] bg-[var(--surface-panel)]/92 text-ink-ghost shrink-0">
      <div className="min-w-0 truncate flex items-center gap-2">
        {selectedNote ? (
          <>
            <span className="text-ink-soft">{(selectedNote.title + selectedNote.content).length} 字</span>
            <span className="hidden md:inline">{fontSize}px · {zoom}%</span>
          </>
        ) : (
          <span>{noteCount} 条笔记</span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0 min-w-0">
        <span className={isOnline ? "text-ink-ghost" : "text-amber-600"}>{isOnline ? "在线" : "离线"}</span>
        {selectedNote && noteSaveStatus && (
          <span className={noteSaveToneClass} title={noteSaveStatus.detail ?? noteSaveStatus.longLabel}>
            {noteSaveStatus.shortLabel}
          </span>
        )}
        <button
          type="button"
          onClick={onRetrySync}
          disabled={isSyncing || !isOnline}
          title={syncCopy.detail || lastRunText}
          className={`rounded-full border border-transparent px-2 py-0.5 transition-colors ${syncToneClass} disabled:opacity-60 disabled:hover:text-inherit`}
        >
          {syncCopy.label}
        </button>
        {(lastSyncDiagnostics?.status === "failed" || lastSyncDiagnostics?.status === "skipped" || conflictCount > 0 || !isCloudLoggedIn) && (
          <span className={`hidden lg:inline truncate max-w-44 ${syncCopy.tone === "danger" ? "text-red-500" : "text-amber-600"}`}>
            {syncDetailText}
          </span>
        )}
        <span className="hidden md:inline">最近同步 {lastSyncedAt}</span>
        {selectedNote && <span className="hidden xl:inline">最后保存 {new Date(selectedNote.updated_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
      </div>
    </div>
  );
}
