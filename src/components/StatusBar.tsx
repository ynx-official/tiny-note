import { useState, useEffect } from "react";
import type { Note, SyncStatus } from "../lib/db";
import type { NoteSaveStatus } from "../lib/noteSaveStatus";
import { loadFontSize, loadFontWeight, loadTabSize } from "../lib/theme";
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
  const [fontWeight, setFontWeight] = useState(loadFontWeight);
  const [tabSize, setTabSize] = useState(loadTabSize);
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
      if (key === "font-weight") setFontWeight(value);
      if (key === "tab-size") setTabSize(value);
      if (key === "zoom") setZoom(Math.round(value * 100));
    };
    window.addEventListener("fp-settings-changed", handler);
    return () => window.removeEventListener("fp-settings-changed", handler);
  }, []);

  return (
    <div className="h-7 px-4 flex items-center justify-between gap-3 text-[11px] text-ink-ghost border-t border-paper-deep/20 bg-paper/30 shrink-0">
      <div className="min-w-0 truncate">
        {selectedNote ? (
          <span>{(selectedNote.title + selectedNote.content).length} 字 · {fontSize}px · 粗细 {fontWeight} · Tab {tabSize}</span>
        ) : (
          <span>{noteCount} 条笔记</span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={isOnline ? "text-ink-ghost" : "text-amber-600"}>{isOnline ? "在线" : "离线"}</span>
        {selectedNote && noteSaveStatus && (
          <span className={noteSaveToneClass} title={noteSaveStatus.detail ?? noteSaveStatus.longLabel}>
            {noteSaveStatus.longLabel}
          </span>
        )}
        <button
          type="button"
          onClick={onRetrySync}
          disabled={isSyncing || !isOnline}
          title={syncCopy.detail || lastRunText}
          className={`transition-colors ${syncToneClass} disabled:opacity-60 disabled:hover:text-inherit`}
        >
          {syncCopy.label}
        </button>
        {(lastSyncDiagnostics?.status === "failed" || lastSyncDiagnostics?.status === "skipped" || conflictCount > 0 || !isCloudLoggedIn) && (
          <span className={syncCopy.tone === "danger" ? "text-red-500" : "text-amber-600"}>
            {syncDetailText}
          </span>
        )}
        <span>最近同步 {lastSyncedAt}</span>
        {selectedNote && <span>最后保存 {new Date(selectedNote.updated_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
        <span>Kova v0.1.0 · {zoom}%</span>
      </div>
    </div>
  );
}
