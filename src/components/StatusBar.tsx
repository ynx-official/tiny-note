import { useState, useEffect } from "react";
import type { Note, SyncStatus } from "../lib/db";
import { loadFontSize, loadFontWeight, loadTabSize } from "../lib/theme";
import { loadZoom } from "../lib/zoom";
import type { SyncRunDiagnostics } from "../lib/sync";

interface StatusBarProps {
  selectedNote: Note | null;
  noteCount: number;
  syncStatus: SyncStatus | null;
  failedSyncCount: number;
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncError: string | null;
  lastSyncDiagnostics: SyncRunDiagnostics | null;
  onRetrySync: () => void;
}

export function StatusBar({ selectedNote, noteCount, syncStatus, failedSyncCount, isOnline, isSyncing, lastSyncError, lastSyncDiagnostics, onRetrySync }: StatusBarProps) {
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
  const syncText = isSyncing
    ? "同步中"
    : !isOnline
      ? "离线"
      : failedSyncCount > 0
        ? `${failedSyncCount} 条失败`
        : pendingSyncCount > 0
          ? `${pendingSyncCount} 条待同步`
          : "已同步";

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
        <button
          type="button"
          onClick={onRetrySync}
          disabled={isSyncing || !isOnline}
          title={lastSyncError ?? lastRunText}
          className={`transition-colors ${failedSyncCount > 0 || lastSyncError ? "text-red-500 hover:text-red-400" : pendingSyncCount > 0 || conflictCount > 0 ? "text-amber-600 hover:text-amber-500" : "hover:text-accent"} disabled:opacity-60 disabled:hover:text-inherit`}
        >
          {syncText}{conflictCount > 0 ? ` · ${conflictCount} 条冲突` : ""}
        </button>
        {lastSyncDiagnostics?.status === "failed" && (
          <span className="text-red-500">{lastSyncDiagnostics.error?.category ?? "unknown"} · {lastSyncDiagnostics.runId.slice(-6)}</span>
        )}
        <span>最近同步 {lastSyncedAt}</span>
        {selectedNote && <span>最后保存 {new Date(selectedNote.updated_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
        <span>Kova v0.1.0 · {zoom}%</span>
      </div>
    </div>
  );
}
