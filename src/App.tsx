import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { loadMode, saveMode, applyTheme, loadAllCustomFonts, loadKeepaliveSyncEnabled, loadKeepaliveSyncIntervalMinutes, saveKeepaliveSyncEnabled, saveKeepaliveSyncIntervalMinutes, type ThemeMode } from "./lib/theme";
import { loadZoom, saveZoom, getZoomDelta } from "./lib/zoom";
import { restoreWindowSize, listenWindowSize } from "./lib/windowState";
import { usePanelResize } from "./hooks/usePanelResize";
import { TitleBar } from "./components/layout/TitleBar";
import { Sidebar } from "./components/layout/Sidebar";
import { SettingsPanel } from "./components/layout/SettingsPanel";
import { LoginPanel } from "./components/layout/LoginPanel";
import { FirstSyncWizard } from "./components/layout/FirstSyncWizard";
import { SyncConflictDialog } from "./components/layout/SyncConflictDialog";
import { ConfirmDialog } from "./components/dialog/ConfirmDialog";
import { AIChatPanel } from "./components/layout/AIChatPanel";
import { NoteDetail } from "./components/detail/NoteDetail";
import { StatusBar } from "./components/StatusBar";
import { db } from "./lib/db";
import { getCloudSession, fetchCurrentUser, listKovaSyncConflicts } from "./lib/cloudApi";
import { createSkippedSyncDiagnostics, loadLastSyncDiagnostics, syncKovaCloud, type SyncRunDiagnostics } from "./lib/sync";
import { useNotes } from "./hooks/useNotes";
import type { Note } from "./lib/db";
import type { NoteSaveStatus } from "./lib/noteSaveStatus";
import type { AIContextAttachment } from "./components/layout/AIChatPanel/types";

// Init theme and fonts
applyTheme(loadMode());
db.getDataDir().then(dir => loadAllCustomFonts(dir));

// Init zoom
document.documentElement.style.fontSize = `${loadZoom() * 16}px`;

// Init window size
restoreWindowSize();
listenWindowSize();

const AUTO_SYNC_DEBOUNCE_MS = 8_000;
const AUTO_SYNC_STARTUP_DELAY_MS = 1_800;
const AUTO_SYNC_VISIBLE_DELAY_MS = 1_500;
const KEEPALIVE_BLOCKED_RETRY_MS = 60 * 1000;

const normalizeSearchKeyword = (value: string) => value.trim().toLowerCase();

const matchesNoteSearch = (note: Note, keyword: string) => {
  if (!keyword) return true;
  return note.title.toLowerCase().includes(keyword) || note.content.toLowerCase().includes(keyword);
};

const pickPreferredNote = (notes: Note[], preferredId?: string | null, fallbackId?: string | null) => {
  if (preferredId) {
    const preferred = notes.find((note) => note.id === preferredId);
    if (preferred) return preferred;
  }
  if (fallbackId) {
    const fallback = notes.find((note) => note.id === fallbackId);
    if (fallback) return fallback;
  }
  return notes[0] ?? null;
};

type PendingDraftActionDialog = {
  title: string;
  message: string;
  confirmLabel?: string;
};

export default function App() {
  const { notes, fetch, create, update, remove } = useNotes();
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<ThemeMode>(loadMode);
  const [showSettings, setShowSettings] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showFirstSyncWizard, setShowFirstSyncWizard] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [pendingAIContext, setPendingAIContext] = useState<{ id: number; attachments: AIContextAttachment[]; mode: "current" | "new" } | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<import("./lib/db").Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(() => {
    const saved = localStorage.getItem("fp-last-folder-id");
    return saved !== null ? saved : "";
  });

  const [closeToTray, setCloseToTray] = useState(() => localStorage.getItem("fp-close-to-tray") !== "false");
  const [cloudSession, setCloudSession] = useState(() => getCloudSession());
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<import("./lib/db").SyncStatus | null>(null);
  const [syncFailureCount, setSyncFailureCount] = useState(0);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [lastSyncDiagnostics, setLastSyncDiagnostics] = useState<SyncRunDiagnostics | null>(() => loadLastSyncDiagnostics());
  const [keepaliveSyncEnabled, setKeepaliveSyncEnabled] = useState(loadKeepaliveSyncEnabled);
  const [keepaliveSyncIntervalMinutes, setKeepaliveSyncIntervalMinutes] = useState(loadKeepaliveSyncIntervalMinutes);
  const [nextKeepaliveSyncAt, setNextKeepaliveSyncAt] = useState<number | null>(null);
  const [lastSuccessfulSyncAt, setLastSuccessfulSyncAt] = useState<string | null>(() => {
    const diagnostics = loadLastSyncDiagnostics();
    return diagnostics?.status === "success" ? (diagnostics.finishedAt ?? diagnostics.startedAt ?? null) : null;
  });
  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [noteSaveStatus, setNoteSaveStatus] = useState<NoteSaveStatus | null>(null);
  const [showConflicts, setShowConflicts] = useState(false);
  const [cloudConflictCount, setCloudConflictCount] = useState(0);
  const [pendingDraftActionDialog, setPendingDraftActionDialog] = useState<PendingDraftActionDialog | null>(null);

  const sidebar = usePanelResize({ storageKey: "kova-sidebar-width", defaultWidth: 260, minWidth: 180, maxWidth: 400, side: "right" });
  const ai = usePanelResize({ storageKey: "kova-ai-width", defaultWidth: 360, minWidth: 300, maxWidth: 600, side: "left" });
  const isDragging = sidebar.isDragging || ai.isDragging;
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSyncFailureRef = useRef(0);
  const nextAutoSyncAtRef = useRef(0);
  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepaliveSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncingRef = useRef(false);
  const isEditorDirtyRef = useRef(false);
  const searchRef = useRef(search);
  const pendingDraftActionRef = useRef<(() => void | Promise<void>) | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 1800);
  };

  const clearKeepaliveSyncTimer = useCallback(() => {
    if (keepaliveSyncTimerRef.current) {
      window.clearTimeout(keepaliveSyncTimerRef.current);
      keepaliveSyncTimerRef.current = null;
    }
  }, []);

  const closePendingDraftActionDialog = useCallback(() => {
    pendingDraftActionRef.current = null;
    setPendingDraftActionDialog(null);
  }, []);

  const runWithDraftGuard = useCallback((action: () => void | Promise<void>, dialog?: PendingDraftActionDialog) => {
    if (!isEditorDirtyRef.current) {
      void action();
      return;
    }
    pendingDraftActionRef.current = async () => {
      setIsEditorDirty(false);
      setNoteSaveStatus(null);
      await action();
      showToast("已放弃当前未保存内容");
    };
    setPendingDraftActionDialog(dialog ?? {
      title: "放弃未保存内容？",
      message: "当前笔记还有未保存内容，继续后会放弃这次本地编辑。",
      confirmLabel: "放弃并继续",
    });
  }, []);

  const applySearch = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const openFirstSyncWizard = useCallback(() => {
    setShowLogin(false);
    setShowFirstSyncWizard(true);
  }, []);

  const closeFirstSyncWizard = useCallback(() => {
    setShowFirstSyncWizard(false);
  }, []);

  const refreshSyncStatus = useCallback(async () => {
    try {
      const [status, pendingChanges] = await Promise.all([
        db.getSyncStatus(),
        db.listPendingSyncChanges(),
      ]);
      setSyncStatus(status);
      setSyncFailureCount(pendingChanges.filter((change) => change.status === "failed").length);
    } catch {
      setSyncStatus(null);
      setSyncFailureCount(0);
    }
  }, []);

  useEffect(() => {
    refreshSyncStatus();
  }, [refreshSyncStatus]);

  useEffect(() => {
    const handler = (event: Event) => {
      setLastSyncDiagnostics((event as CustomEvent<SyncRunDiagnostics>).detail ?? loadLastSyncDiagnostics());
    };
    window.addEventListener("kova-sync-diagnostics-changed", handler);
    return () => window.removeEventListener("kova-sync-diagnostics-changed", handler);
  }, []);

  useEffect(() => {
    isEditorDirtyRef.current = isEditorDirty;
  }, [isEditorDirty]);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    if (!isEditorDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isEditorDirty]);

  // Zoom with Ctrl+scroll, reset with Ctrl+0
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const next = getZoomDelta(loadZoom(), e.deltaY < 0 ? 1 : -1);
        saveZoom(next);
        getCurrentWebview().setZoom(next).catch(() => {});
        window.dispatchEvent(new CustomEvent("fp-settings-changed", { detail: { key: "zoom", value: next } }));
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        saveZoom(1);
        getCurrentWebview().setZoom(1).catch(() => {});
        window.dispatchEvent(new CustomEvent("fp-settings-changed", { detail: { key: "zoom", value: 1 } }));
      }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("wheel", onWheel); window.removeEventListener("keydown", onKey); };
  }, []);

  // Fetch folders on mount
  useEffect(() => {
    db.listFolders().then(setFolders);
  }, []);

  // Fetch notes when folder changes
  useEffect(() => {
    let cancelled = false;
    fetch(undefined, selectedFolderId ?? undefined).then((fetched: Note[]) => {
      if (cancelled) return;
      const keyword = normalizeSearchKeyword(searchRef.current);
      const visibleNotes = fetched.filter((note) => matchesNoteSearch(note, keyword));
      const lastId = localStorage.getItem("fp-last-note-id");
      setSelectedNote((current) => pickPreferredNote(visibleNotes, current?.id, lastId));
    });
    db.list().then((all: Note[]) => {
      if (!cancelled) setAllNotes(all);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedFolderId, fetch]);

  // Persist last selected note and folder
  useEffect(() => {
    if (selectedNote) localStorage.setItem("fp-last-note-id", selectedNote.id);
  }, [selectedNote]);
  useEffect(() => {
    if (selectedFolderId !== null) localStorage.setItem("fp-last-folder-id", selectedFolderId);
  }, [selectedFolderId]);

  // Listen for quick-note-saved events
  useEffect(() => {
    const unlisten = listen("quick-note-saved", () => {
      fetch(undefined, selectedFolderId ?? undefined);
      db.list().then((all: Note[]) => setAllNotes(all));
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [selectedFolderId, fetch]);

  // Listen for close-to-tray setting changes
  useEffect(() => {
    const handler = (e: Event) => {
      const { key, value } = (e as CustomEvent).detail;
      if (key === "close-to-tray") setCloseToTray(value);
    };
    window.addEventListener("fp-settings-changed", handler);
    return () => window.removeEventListener("fp-settings-changed", handler);
  }, []);

  // Keep cloud session and user info fresh
  useEffect(() => {
    const handler = () => setCloudSession(getCloudSession());
    window.addEventListener("kova-cloud-session-changed", handler);
    return () => window.removeEventListener("kova-cloud-session-changed", handler);
  }, []);

  useEffect(() => {
    if (!cloudSession || cloudSession.user) return;

    let cancelled = false;
    fetchCurrentUser()
      .then(() => {
        if (!cancelled) setCloudSession(getCloudSession());
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [cloudSession]);

  const refreshCloudConflictCount = async () => {
    if (!getCloudSession()) {
      setCloudConflictCount(0);
      return;
    }
    try {
      const conflicts = await listKovaSyncConflicts("pending");
      setCloudConflictCount(conflicts.length);
    } catch {
      setCloudConflictCount(0);
    }
  };

  useEffect(() => {
    refreshCloudConflictCount();
  }, [cloudSession]);

  // Listen for AI tool data changes
  useEffect(() => {
    const unlisten = listen("ai-stream", (event) => {
      const payload = event.payload as { type: string; data: string; conversation_id: string };
      if (payload.type === "data_changed") {
        fetch(undefined, selectedFolderId ?? undefined);
        db.list().then((all: Note[]) => setAllNotes(all));
        db.listFolders().then(setFolders);
        void refreshSyncStatus();
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [selectedFolderId, fetch]);

  // Listen for external file drops
  useEffect(() => {
    const SUPPORTED_EXT = [".md", ".txt", ".html", ".htm"];
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "enter") {
        const hasSupported = event.payload.paths.some((p: string) =>
          SUPPORTED_EXT.some(ext => p.toLowerCase().endsWith(ext))
        );
        setDraggingFiles(hasSupported);
        return;
      }
      if (event.payload.type === "leave" || event.payload.type === "over") {
        if (event.payload.type === "leave") setDraggingFiles(false);
        return;
      }
      if (event.payload.type !== "drop") return;
      setDraggingFiles(false);
      const paths = event.payload.paths.filter((p: string) =>
        SUPPORTED_EXT.some(ext => p.toLowerCase().endsWith(ext))
      );
      if (paths.length === 0) return;
      const targetFolderId = selectedFolderId && selectedFolderId !== "" ? selectedFolderId : undefined;
      (async () => {
        for (const path of paths) {
          try {
            if (targetFolderId) {
              const note = await db.importFile(path);
              await db.moveToFolder(note.id, targetFolderId);
            } else {
              await db.importFile(path);
            }
          } catch (e) {
            console.error("Failed to import dropped file:", path, e);
          }
        }
        fetch(undefined, selectedFolderId ?? undefined);
        db.list().then((all: Note[]) => setAllNotes(all));
      })();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [selectedFolderId, fetch]);

  const handleToggleMode = () => {
    const next = mode === "light" ? "dark" : "light";
    setMode(next);
    saveMode(next);
    applyTheme(next);
  };

  const handleCreateNote = async (folderId?: string) => {
    runWithDraftGuard(async () => {
      const targetFolderId = folderId ?? selectedFolderId ?? undefined;
      const normalizedFolderId = targetFolderId ?? "";
      const note = await create("", "", [], targetFolderId);
      applySearch("");
      setSelectedFolderId(normalizedFolderId);
      setSelectedNote(note);
      setSelectedIds(new Set());
      await refreshSyncStatus();
      await fetch(undefined, targetFolderId);
      db.list().then((all: Note[]) => setAllNotes(all));
      showToast("笔记已新建");
    }, {
      title: "放弃当前草稿并新建笔记？",
      message: "当前笔记还有未保存内容，继续后会放弃这次本地编辑，并打开新笔记。",
      confirmLabel: "放弃并新建",
    });
  };

  const handleAddToAIContext = (attachments: AIContextAttachment[]) => {
    setShowSettings(false);
    setShowAI(true);
    setPendingAIContext({ id: Date.now(), attachments, mode: "current" });
  };

  const handleAddToNewAIContext = (attachments: AIContextAttachment[]) => {
    setShowSettings(false);
    setShowAI(true);
    setPendingAIContext({ id: Date.now(), attachments, mode: "new" });
  };

  const handleOpenNoteFromAI = async (noteId: string) => {
    const notesSnapshot = allNotes.length > 0 ? allNotes : await db.list();
    const note = notesSnapshot.find((item) => item.id === noteId);
    if (!note || selectedNote?.id === note.id) return;
    const folderId = note.folder_id ?? "";
    runWithDraftGuard(async () => {
      applySearch("");
      setSelectedFolderId(folderId);
      setSelectedNote(note);
      setSelectedIds(new Set());
      await fetch(undefined, folderId || undefined);
    }, {
      title: "放弃当前草稿并跳转笔记？",
      message: "当前笔记还有未保存内容，继续后会放弃这次本地编辑，并跳转到 AI 选中的笔记。",
      confirmLabel: "放弃并跳转",
    });
  };

  const handleOpenFolderFromAI = async (folderId: string) => {
    if (selectedFolderId === folderId) return;
    runWithDraftGuard(async () => {
      applySearch("");
      setSelectedFolderId(folderId);
      setSelectedNote(null);
      setSelectedIds(new Set());
      await fetch(undefined, folderId);
    }, {
      title: "放弃当前草稿并切换文件夹？",
      message: "当前笔记还有未保存内容，继续后会放弃这次本地编辑，并切换到 AI 选中的文件夹。",
      confirmLabel: "放弃并切换",
    });
  };

  const handleDelete = (id: string) => {
    remove(id).then(() => {
      refreshSyncStatus();
      const nextIds = new Set(selectedIds);
      nextIds.delete(id);
      setSelectedIds(nextIds);
      db.list().then(setAllNotes);
      if (selectedNote?.id === id) {
        fetch(undefined, selectedFolderId ?? undefined).then((remaining) => {
          const keyword = normalizeSearchKeyword(search);
          const visibleRemaining = remaining.filter((note) => matchesNoteSearch(note, keyword));
          setSelectedNote(visibleRemaining[0] ?? null);
        });
      }
      showToast("笔记已删除");
    });
  };

  const handleDeselectNote = (noteId: string) => {
    const next = new Set(selectedIds);
    next.delete(noteId);
    setSelectedIds(next);

    if (selectedNote?.id !== noteId) return;

    const nextNote = [...next]
      .map(id => allNotes.find(n => n.id === id))
      .find((note): note is Note => Boolean(note));
    setSelectedNote(nextNote ?? null);
  };

  const handleUpdateTitle = (id: string, title: string) => {
    const promise = update(id, { title }).finally(refreshSyncStatus);
    if (selectedNote?.id === id) {
      const now = new Date().toISOString();
      setSelectedNote((prev) => prev ? { ...prev, title, updated_at: now } : null);
    }
    return promise;
  };

  const handleUpdateContent = (id: string, content: string) => {
    const promise = update(id, { content }).finally(refreshSyncStatus);
    if (selectedNote?.id === id) {
      const now = new Date().toISOString();
      setSelectedNote((prev) => prev ? { ...prev, content, updated_at: now } : null);
    }
    return promise;
  };

  const handleSync = useCallback(async (options?: { silent?: boolean; trigger?: SyncRunDiagnostics["trigger"] }) => {
    const trigger = options?.trigger ?? "manual";
    if (isSyncingRef.current) return false;
    if (!getCloudSession()) {
      const diagnostics = createSkippedSyncDiagnostics(trigger, "请先登录", "auth");
      setLastSyncDiagnostics(diagnostics);
      if (!options?.silent) showToast("请先登录");
      return false;
    }
    if (!navigator.onLine) {
      setIsOnline(false);
      const diagnostics = createSkippedSyncDiagnostics(trigger, "当前离线，稍后自动重试", "network");
      setLastSyncDiagnostics(diagnostics);
      if (!options?.silent) showToast("当前离线，稍后自动重试");
      return false;
    }
    isSyncingRef.current = true;
    setIsSyncing(true);
    setLastSyncError(null);
    try {
      const result = await syncKovaCloud(trigger);
      autoSyncFailureRef.current = 0;
      nextAutoSyncAtRef.current = 0;
      setLastSyncDiagnostics(result.diagnostics);
      setLastSuccessfulSyncAt(result.diagnostics.finishedAt ?? result.diagnostics.startedAt ?? new Date().toISOString());
      const refreshed = await fetch(undefined, selectedFolderId ?? undefined);
      if (selectedNote) {
        const nextSelected = refreshed.find((note) => note.id === selectedNote.id) ?? null;
        if (!isEditorDirty) {
          setSelectedNote(nextSelected);
        } else if (!nextSelected) {
          showToast("当前笔记已在云端删除，本地编辑内容暂不覆盖");
        }
      }
      db.list().then((all: Note[]) => setAllNotes(all));
      db.listFolders().then(setFolders);
      await refreshCloudConflictCount();
      await refreshSyncStatus();
      if (result.conflicts > 0) {
        setCloudConflictCount(result.conflicts);
        setShowConflicts(true);
        showToast(`同步完成，${result.conflicts} 条冲突待处理`);
      } else if (result.skipped > 0) {
        showToast(`同步完成，已保护 ${result.skipped} 条本地未同步内容`);
      } else if (!options?.silent && (result.pushed > 0 || result.pulled > 0)) {
        showToast(`同步完成：推送 ${result.pushed}，拉取 ${result.pulled}`);
      } else if (!options?.silent) {
        showToast("已是最新");
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "同步失败";
      setLastSyncError(message);
      await refreshSyncStatus();
      if (!options?.silent) showToast(message);
      return false;
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [fetch, isEditorDirty, refreshSyncStatus, selectedFolderId, selectedNote]);

  useEffect(() => {
    if (!keepaliveSyncEnabled || !cloudSession || !isOnline) {
      clearKeepaliveSyncTimer();
      setNextKeepaliveSyncAt(null);
      return;
    }

    let cancelled = false;
    const intervalMs = keepaliveSyncIntervalMinutes * 60 * 1000;

    const scheduleKeepaliveAttempt = (delayMs: number) => {
      clearKeepaliveSyncTimer();
      const normalizedDelay = Math.max(0, delayMs);
      setNextKeepaliveSyncAt(Date.now() + normalizedDelay);
      keepaliveSyncTimerRef.current = window.setTimeout(() => {
        keepaliveSyncTimerRef.current = null;
        if (cancelled) return;
        if (document.visibilityState !== "visible" || isEditorDirtyRef.current || isSyncingRef.current) {
          scheduleKeepaliveAttempt(Math.min(KEEPALIVE_BLOCKED_RETRY_MS, intervalMs));
          return;
        }
        void (async () => {
          const ok = await handleSync({ silent: true, trigger: "interval" });
          if (cancelled || ok) return;
          autoSyncFailureRef.current += 1;
          const delay = Math.min(30 * 60 * 1000, 60 * 1000 * 2 ** Math.min(autoSyncFailureRef.current, 5));
          nextAutoSyncAtRef.current = Date.now() + delay;
          scheduleKeepaliveAttempt(delay);
        })();
      }, normalizedDelay);
    };

    scheduleKeepaliveAttempt(intervalMs);

    return () => {
      cancelled = true;
      clearKeepaliveSyncTimer();
    };
  }, [clearKeepaliveSyncTimer, cloudSession, handleSync, isOnline, keepaliveSyncEnabled, keepaliveSyncIntervalMinutes, lastSuccessfulSyncAt]);

  const scheduleAutoSyncAttempt = useCallback((delayMs: number, trigger: SyncRunDiagnostics["trigger"]) => {
    if (autoSyncTimerRef.current) {
      window.clearTimeout(autoSyncTimerRef.current);
      autoSyncTimerRef.current = null;
    }
    if (!cloudSession || !isOnline) return;

    autoSyncTimerRef.current = window.setTimeout(() => {
      autoSyncTimerRef.current = null;

      if (document.visibilityState !== "visible" || isEditorDirty) return;

      const now = Date.now();
      if (now < nextAutoSyncAtRef.current) {
        scheduleAutoSyncAttempt(nextAutoSyncAtRef.current - now, trigger);
        return;
      }

      void (async () => {
        const ok = await handleSync({ silent: true, trigger });
        if (ok) return;
        autoSyncFailureRef.current += 1;
        const delay = Math.min(30 * 60 * 1000, 60 * 1000 * 2 ** Math.min(autoSyncFailureRef.current, 5));
        nextAutoSyncAtRef.current = Date.now() + delay;
        scheduleAutoSyncAttempt(delay, "interval");
      })();
    }, Math.max(0, delayMs));
  }, [cloudSession, handleSync, isEditorDirty, isOnline]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      refreshSyncStatus();
      autoSyncFailureRef.current = 0;
      nextAutoSyncAtRef.current = 0;

      const pendingCount = syncStatus?.pending_changes ?? 0;
      const hasPendingWork = pendingCount > 0 || syncFailureCount > 0;
      if (hasPendingWork) {
        scheduleAutoSyncAttempt(AUTO_SYNC_VISIBLE_DELAY_MS, "online");
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      if (autoSyncTimerRef.current) {
        window.clearTimeout(autoSyncTimerRef.current);
        autoSyncTimerRef.current = null;
      }
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshSyncStatus, scheduleAutoSyncAttempt, syncFailureCount, syncStatus]);

  useEffect(() => {
    if (!cloudSession || !isOnline) return;

    const pendingCount = syncStatus?.pending_changes ?? 0;
    const hasPendingWork = pendingCount > 0 || syncFailureCount > 0;
    if (hasPendingWork) {
      scheduleAutoSyncAttempt(AUTO_SYNC_STARTUP_DELAY_MS, "startup");
    }

    return () => {
      if (autoSyncTimerRef.current) {
        window.clearTimeout(autoSyncTimerRef.current);
        autoSyncTimerRef.current = null;
      }
    };
  }, [cloudSession, isOnline, scheduleAutoSyncAttempt, syncFailureCount, syncStatus]);

  useEffect(() => {
    if (!cloudSession || !isOnline || isEditorDirty) return;
    const pendingCount = syncStatus?.pending_changes ?? 0;
    const hasPendingWork = pendingCount > 0 || syncFailureCount > 0;
    if (!hasPendingWork) return;
    scheduleAutoSyncAttempt(AUTO_SYNC_DEBOUNCE_MS, "interval");
  }, [cloudSession, isEditorDirty, isOnline, scheduleAutoSyncAttempt, syncFailureCount, syncStatus]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible" || !cloudSession || !isOnline) return;
      const pendingCount = syncStatus?.pending_changes ?? 0;
      const hasPendingWork = pendingCount > 0 || syncFailureCount > 0;
      if (hasPendingWork) {
        scheduleAutoSyncAttempt(AUTO_SYNC_VISIBLE_DELAY_MS, "interval");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [cloudSession, isOnline, scheduleAutoSyncAttempt, syncFailureCount, syncStatus]);

  const handleFirstSyncAction = useCallback((action: "upload" | "restore" | "merge") => {
    setShowFirstSyncWizard(false);
    setShowLogin(false);
    if (action === "upload") {
      void handleSync();
      return;
    }
    if (action === "restore") {
      setShowSettings(true);
      setShowAI(false);
      showToast("请在设置页打开云备份列表并选择快照恢复");
      return;
    }
    setShowConflicts(true);
  }, [handleSync]);

  const filteredNotes = useMemo(() => {
    const keyword = normalizeSearchKeyword(search);
    return keyword
      ? notes.filter((note) => matchesNoteSearch(note, keyword))
      : notes;
  }, [notes, search]);

  const hasCompletedFirstSync = Boolean(syncStatus?.last_synced_at || lastSuccessfulSyncAt);
  const selectedNoteVisibleInList = selectedNote ? filteredNotes.some((note) => note.id === selectedNote.id) : false;

  const visibleSelectedIds = useMemo(
    () => new Set([...selectedIds].filter((id) => filteredNotes.some((note) => note.id === id))),
    [filteredNotes, selectedIds],
  );

  return (
    <div className="h-screen flex flex-col bg-paper">
      <TitleBar settingsOpen={showSettings} loginOpen={showLogin} aiOpen={showAI} closeToTray={closeToTray} mode={mode} cloudUser={cloudSession?.user} isCloudLoggedIn={Boolean(cloudSession)} isSyncing={isSyncing} conflictCount={cloudConflictCount} onToggleMode={handleToggleMode} onToggleSettings={() => { setShowSettings((v) => !v); setShowAI(false); }} onToggleLogin={() => setShowLogin((v) => !v)} onToggleAI={() => { setShowAI((v) => !v); setShowSettings(false); }} onSync={handleSync} onOpenConflicts={() => setShowConflicts(true)} />

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div className="relative shrink-0 flex overflow-hidden" style={{ width: showSidebar ? sidebar.width : 0, transition: isDragging ? "none" : "width 0.5s cubic-bezier(0.22,1,0.36,1)" }}>
          <div className="h-full shrink-0 overflow-hidden" style={{ width: sidebar.width - 4 }}>
            <Sidebar
              search={search}
              filteredNotes={filteredNotes}
              noteCount={notes.length}
              selectedId={selectedNote?.id ?? null}
              selectedIds={visibleSelectedIds}
              onSelectedIdsChange={setSelectedIds}
              folders={folders}
              selectedFolderId={selectedFolderId}
              onSearchChange={applySearch}
              onSearchCommit={applySearch}
              onSelectNote={(note) => {
                if (selectedNote?.id === note.id) {
                  setSelectedIds(new Set());
                  return;
                }
                runWithDraftGuard(() => {
                  setSelectedNote(note);
                  setSelectedIds(new Set());
                }, {
                  title: "放弃当前草稿并切换笔记？",
                  message: "当前笔记还有未保存内容，继续后会放弃这次本地编辑，并切换到另一条笔记。",
                  confirmLabel: "放弃并切换",
                });
              }}
              onCreateNote={handleCreateNote}
              onDelete={handleDelete}
              onFolderSelect={(folderId) => {
                if (selectedFolderId === folderId) return;
                runWithDraftGuard(() => {
                  setSelectedFolderId(folderId);
                }, {
                  title: "放弃当前草稿并切换文件夹？",
                  message: "当前笔记还有未保存内容，继续后会放弃这次本地编辑，并切换当前列表范围。",
                  confirmLabel: "放弃并切换",
                });
              }}
              onFolderCreate={async (baseName, parentId) => {
                const siblings = folders.filter(f => f.parent_id === (parentId ?? null));
                const names = new Set(siblings.map(f => f.name));
                let name = baseName;
                if (names.has(name)) {
                  let i = 1;
                  while (names.has(`${baseName}${i}`)) i++;
                  name = `${baseName}${i}`;
                }
                await db.createFolder(name, parentId);
                db.listFolders().then(setFolders);
                await refreshSyncStatus();
                showToast("文件夹已新建");
              }}
              onFolderRename={async (id, name) => { await db.updateFolder(id, name); db.listFolders().then(setFolders); await refreshSyncStatus(); showToast("文件夹已重命名"); }}
              onFolderDelete={async (id) => {
                await db.deleteFolder(id);
                db.listFolders().then((updated) => {
                  setFolders(updated);
                  if (selectedFolderId === id) {
                    setSelectedFolderId(updated.length > 0 ? updated[0].id : "");
                  }
                });
                await refreshSyncStatus();
                showToast("文件夹已删除");
              }}
              onMoveToFolder={async (noteId, folderId) => {
                await db.moveToFolder(noteId, folderId ?? undefined);
                const updated = await fetch(undefined, selectedFolderId ?? undefined);
                if (selectedNote?.id === noteId) {
                  const keyword = normalizeSearchKeyword(search);
                  const visibleUpdated = updated.filter((note) => matchesNoteSearch(note, keyword));
                  const movedIntoCurrentFolder = visibleUpdated.find((note) => note.id === noteId) ?? null;
                  setSelectedNote(movedIntoCurrentFolder ?? visibleUpdated[0] ?? null);
                }
                await refreshSyncStatus();
                db.list().then((all: Note[]) => setAllNotes(all));
                showToast("笔记已移动");
              }}
              onMoveMultipleToFolder={async (noteIds, folderId) => {
                for (const id of noteIds) { await db.moveToFolder(id, folderId ?? undefined); }
                const updated = await fetch(undefined, selectedFolderId ?? undefined);
                if (selectedNote && noteIds.includes(selectedNote.id)) {
                  const keyword = normalizeSearchKeyword(search);
                  const visibleUpdated = updated.filter((note) => matchesNoteSearch(note, keyword));
                  setSelectedNote(visibleUpdated[0] ?? null);
                }
                db.list().then((all: Note[]) => setAllNotes(all));
                await refreshSyncStatus();
                showToast(noteIds.length > 1 ? `${noteIds.length} 条笔记已移动` : "笔记已移动");
              }}
              onDeselectNote={handleDeselectNote}
              onImported={() => { fetch(undefined, selectedFolderId ?? undefined); db.list().then((all: Note[]) => setAllNotes(all)); void refreshSyncStatus(); }}
              onAddToAIContext={handleAddToAIContext}
              onAddToNewAIContext={handleAddToNewAIContext}
            />
          </div>
          <div className="w-1 shrink-0 bg-paper-deep/30 cursor-col-resize hover:bg-accent/40 transition-colors" onMouseDown={sidebar.handleMouseDown} />
        </div>

        {/* Detail */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedNote ? (
            <>
              {!selectedNoteVisibleInList && search.trim() && (
                <div className="flex items-center justify-between gap-3 border-b border-amber-200/60 bg-amber-50/70 px-4 py-2 text-xs text-amber-700">
                  <span>当前正在编辑的笔记不在这次筛选结果里，列表已只显示匹配项。</span>
                  <button
                    type="button"
                    onClick={() => applySearch("")}
                    className="shrink-0 rounded-full border border-amber-300/70 px-2.5 py-1 text-[11px] transition hover:bg-white/80"
                  >
                    清空筛选
                  </button>
                </div>
              )}
              <NoteDetail note={selectedNote} onToggleSidebar={() => setShowSidebar((v) => !v)} onDelete={handleDelete} onUpdateTitle={handleUpdateTitle} onUpdateContent={handleUpdateContent} onDirtyChange={setIsEditorDirty} onSaveStatusChange={setNoteSaveStatus} />
            </>
          ) : (
            <>
              <div className="flex items-center justify-between px-4 h-10 border-b border-paper-deep/20 shrink-0 bg-paper/20">
                <span className="text-xs text-ink-ghost">选择一条笔记查看</span>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center text-ink-ghost">
                <svg width="56" height="56" viewBox="0 0 56 56" fill="none" className="mb-3 opacity-20">
                  <rect x="10" y="7" width="36" height="42" rx="5" stroke="currentColor" strokeWidth="2"/>
                  <path d="M19 18h18M19 26h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <p className="text-sm">Kova</p>
                <p className="text-xs mt-1">灵感来了，记一笔</p>
              </div>
            </>
          )}
          <StatusBar
            selectedNote={selectedNote}
            noteCount={filteredNotes.length}
            noteSaveStatus={selectedNote ? noteSaveStatus : null}
            syncStatus={syncStatus}
            failedSyncCount={syncFailureCount}
            isCloudLoggedIn={Boolean(cloudSession)}
            isOnline={isOnline}
            isSyncing={isSyncing}
            lastSyncError={lastSyncError}
            lastSyncDiagnostics={lastSyncDiagnostics}
            onRetrySync={() => void handleSync()}
          />
        </div>

        {/* AI panel */}
        <div className="relative shrink-0 flex overflow-hidden" style={{ width: showAI ? ai.width : 0, transition: isDragging ? "none" : "width 0.5s cubic-bezier(0.22,1,0.36,1)" }}>
          <div className="w-1 shrink-0 bg-paper-deep/30 cursor-col-resize hover:bg-accent/40 transition-colors" onMouseDown={ai.handleMouseDown} />
          <div className="h-full shrink-0" style={{ width: ai.width - 4 }}>
            <AIChatPanel
              onClose={() => {
                setShowAI(false);
                setPendingAIContext(null);
              }}
              pendingContext={pendingAIContext}
              onOpenNote={handleOpenNoteFromAI}
              onOpenFolder={handleOpenFolderFromAI}
            />
          </div>
        </div>
      </div>

      {showSettings && !showAI && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          mode={mode}
          onImported={() => { fetch(undefined, selectedFolderId ?? undefined); db.list().then((all: Note[]) => setAllNotes(all)); }}
          keepaliveSyncEnabled={keepaliveSyncEnabled}
          keepaliveSyncIntervalMinutes={keepaliveSyncIntervalMinutes}
          lastSyncAt={lastSyncDiagnostics?.finishedAt ?? lastSyncDiagnostics?.startedAt ?? null}
          nextSyncAt={nextKeepaliveSyncAt ? new Date(nextKeepaliveSyncAt).toISOString() : null}
          onKeepaliveSyncEnabledChange={(enabled) => {
            setKeepaliveSyncEnabled(enabled);
            saveKeepaliveSyncEnabled(enabled);
          }}
          onKeepaliveSyncIntervalMinutesChange={(minutes) => {
            const normalized = Math.max(1, Math.round(minutes));
            setKeepaliveSyncIntervalMinutes(normalized);
            saveKeepaliveSyncIntervalMinutes(normalized);
          }}
        />
      )}

      {showLogin && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/25 px-4" onMouseDown={() => setShowLogin(false)}>
          <div onMouseDown={(event) => event.stopPropagation()}>
            <LoginPanel
              onClose={() => setShowLogin(false)}
              hasCompletedFirstSync={hasCompletedFirstSync}
              onOpenFirstSyncWizard={openFirstSyncWizard}
            />
          </div>
        </div>
      )}

      {showFirstSyncWizard && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/35 px-4" onMouseDown={closeFirstSyncWizard}>
          <div onMouseDown={(event) => event.stopPropagation()}>
            <FirstSyncWizard
              hasCompletedFirstSync={hasCompletedFirstSync}
              onClose={closeFirstSyncWizard}
              onSelect={handleFirstSyncAction}
            />
          </div>
        </div>
      )}

      {showConflicts && (
        <SyncConflictDialog
          onClose={() => setShowConflicts(false)}
          onResolved={refreshCloudConflictCount}
        />
      )}

      {pendingDraftActionDialog && (
        <ConfirmDialog
          title={pendingDraftActionDialog.title}
          message={pendingDraftActionDialog.message}
          confirmLabel={pendingDraftActionDialog.confirmLabel ?? "放弃并继续"}
          cancelLabel="继续编辑"
          danger
          onCancel={closePendingDraftActionDialog}
          onConfirm={() => {
            const pendingAction = pendingDraftActionRef.current;
            closePendingDraftActionDialog();
            if (!pendingAction) return;
            void pendingAction();
          }}
        />
      )}

      {toast && (
        <div className="fixed left-1/2 bottom-10 z-[70] -translate-x-1/2 rounded-full border border-paper-deep/60 bg-cloud/95 px-4 py-2 text-xs text-ink-soft shadow-lg animate-toast-in pointer-events-none">
          {toast}
        </div>
      )}

      {/* File drop overlay */}
      {draggingFiles && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-accent/10 backdrop-blur-sm pointer-events-none border-2 border-dashed border-accent/40 rounded-xl m-2">
          <div className="flex flex-col items-center gap-2">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent animate-bounce">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <p className="text-sm text-accent font-medium">释放以导入笔记</p>
            <p className="text-[11px] text-ink-ghost">支持 .md .txt .html 文件</p>
          </div>
        </div>
      )}
    </div>
  );
}
