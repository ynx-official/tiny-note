import { type ReactNode, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { db } from "../../../lib/db";
import { getCloudSession, listKovaBackupSnapshots, listKovaDevices, registerKovaBackupSnapshot, revokeKovaDevice, updateKovaDevice, uploadKovaAsset, type KovaBackupSnapshot, type KovaDevice } from "../../../lib/cloudApi";
import { loadLastSyncDiagnostics, type SyncRunDiagnostics } from "../../../lib/sync";
import { ConfirmDialog } from "../../dialog/ConfirmDialog";
import { ColorRow, ToggleRow, SliderRow, FontRow, TabSizeRow, ViewModeRow } from "./ui-rows";
import { SETTINGS_CATEGORIES, type SettingsCategoryId } from "./settings-schema";
import {
  loadAccent, saveAccent,
  loadPaper, savePaper, applyTheme,
  loadFontSize, saveFontSize, loadLineHeight, saveLineHeight,
  loadFont, saveFont, loadFontWeight, saveFontWeight,
  loadCustomFonts, saveCustomFonts, loadCustomFont,
  loadAutoSave, saveAutoSave, loadAutoSaveDelay, saveAutoSaveDelay,
  loadTabSize, saveTabSize,
  loadViewMode, saveViewMode, loadSplitRatio, saveSplitRatio,
  loadQuickPinned, saveQuickPinned,
  loadQuickShortcut, saveQuickShortcut,
  DEFAULT_ACCENT_LIGHT, DEFAULT_PAPER_LIGHT, DEFAULT_ACCENT_DARK, DEFAULT_PAPER_DARK,
  DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT, DEFAULT_FONT_WEIGHT, DEFAULT_FONT,
  PRESET_FONTS, DOWNLOADABLE_FONTS,
  DEFAULT_AUTO_SAVE_DELAY, DEFAULT_TAB_SIZE,
  DEFAULT_VIEW_MODE, DEFAULT_SPLIT_RATIO, DEFAULT_QUICK_SHORTCUT,
  DEFAULT_KEEPALIVE_SYNC_INTERVAL_MINUTES,
  type ThemeMode,
} from "../../../lib/theme";

interface SettingsGroupProps {
  title: string;
  description?: string;
  children: ReactNode;
}

function SettingsGroup({ title, description, children }: SettingsGroupProps) {
  return (
    <section className="space-y-3 rounded-2xl border border-paper-deep/25 bg-paper-warm/30 p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-ink-soft">{title}</h3>
        {description ? <p className="text-[11px] leading-relaxed text-ink-ghost">{description}</p> : null}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

interface SettingsPanelProps {
  onClose: () => void;
  onImported?: () => void;
  mode: ThemeMode;
  keepaliveSyncEnabled: boolean;
  keepaliveSyncIntervalMinutes: number;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  onKeepaliveSyncEnabledChange: (enabled: boolean) => void;
  onKeepaliveSyncIntervalMinutesChange: (minutes: number) => void;
}

export function SettingsPanel({
  onClose,
  mode,
  keepaliveSyncEnabled,
  keepaliveSyncIntervalMinutes,
  lastSyncAt,
  nextSyncAt,
  onKeepaliveSyncEnabledChange,
  onKeepaliveSyncIntervalMinutesChange,
}: SettingsPanelProps) {
  const [autoStart, setAutoStart] = useState(() => localStorage.getItem("fp-autostart") === "true");
  const [closeToTray, setCloseToTray] = useState(() => localStorage.getItem("fp-close-to-tray") !== "false");
  const [dataDir, setDataDir] = useState("");
  const [accent, setAccent] = useState(() => loadAccent(mode));
  const [paper, setPaper] = useState(() => loadPaper(mode));
  const [fontSize, setFontSize] = useState(loadFontSize);
  const [lineHeight, setLineHeight] = useState(loadLineHeight);
  const [font, setFont] = useState(loadFont);
  const [fontWeight, setFontWeight] = useState(loadFontWeight);
  const [customFonts, setCustomFonts] = useState(loadCustomFonts);
  const [autoSave, setAutoSave] = useState(loadAutoSave);
  const [autoSaveDelay, setAutoSaveDelay] = useState(loadAutoSaveDelay);
  const [tabSize, setTabSize] = useState(loadTabSize);
  const [viewMode, setViewMode] = useState(loadViewMode);
  const [splitRatio, setSplitRatio] = useState(loadSplitRatio);
  const [quickPinned, setQuickPinned] = useState(loadQuickPinned);
  const [quickShortcut, setQuickShortcut] = useState(loadQuickShortcut);
  const [recording, setRecording] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "ok" | "err" } | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [restorePath, setRestorePath] = useState<string | null>(null);
  const [restoreInspection, setRestoreInspection] = useState<import("../../../lib/db").RestoreInspection | null>(null);
  const [cloudRestoreUrl, setCloudRestoreUrl] = useState<string | null>(null);
  const [cloudRestoreSnapshot, setCloudRestoreSnapshot] = useState<KovaBackupSnapshot | null>(null);
  const [cloudSnapshots, setCloudSnapshots] = useState<KovaBackupSnapshot[]>([]);
  const [cloudDevices, setCloudDevices] = useState<KovaDevice[]>([]);
  const [syncDiagnostics, setSyncDiagnostics] = useState<SyncRunDiagnostics | null>(() => loadLastSyncDiagnostics());
  const [busyAction, setBusyAction] = useState<"cloudBackup" | "cloudRestore" | "cleanup" | "devices" | null>(null);
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>(() => {
    const saved = localStorage.getItem("fp-settings-category") as SettingsCategoryId | null;
    return SETTINGS_CATEGORIES.some((item) => item.id === saved) ? saved! : "general";
  });

  useEffect(() => {
    const handler = (event: Event) => {
      setSyncDiagnostics((event as CustomEvent<SyncRunDiagnostics>).detail ?? loadLastSyncDiagnostics());
    };
    window.addEventListener("kova-sync-diagnostics-changed", handler);
    return () => window.removeEventListener("kova-sync-diagnostics-changed", handler);
  }, []);

  useEffect(() => {
    db.getDataDir().then(setDataDir);
  }, []);

  useEffect(() => {
    localStorage.setItem("fp-settings-category", activeCategory);
  }, [activeCategory]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const refreshCloudDevices = async () => {
    if (!getCloudSession()) {
      setCloudDevices([]);
      return;
    }
    const devices = await listKovaDevices();
    setCloudDevices(devices);
  };

  useEffect(() => {
    refreshCloudDevices().catch(() => setCloudDevices([]));
  }, []);

  useEffect(() => {
    localStorage.setItem("fp-autostart", String(autoStart));
  }, [autoStart]);

  useEffect(() => {
    localStorage.setItem("fp-close-to-tray", String(closeToTray));
    window.dispatchEvent(new CustomEvent("fp-settings-changed", { detail: { key: "close-to-tray", value: closeToTray } }));
  }, [closeToTray]);

  useEffect(() => {
    setAccent(loadAccent(mode));
    setPaper(loadPaper(mode));
  }, [mode]);

  const showMsg = (text: string, type: "ok" | "err") => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 2000);
  };

  const handleAccentChange = (hex: string) => {
    setAccent(hex);
    saveAccent(mode, hex);
    applyTheme(mode);
  };

  const handlePaperChange = (hex: string) => {
    setPaper(hex);
    savePaper(mode, hex);
    applyTheme(mode);
  };

  const handleFontSizeChange = (size: number) => {
    setFontSize(size);
    saveFontSize(size);
    applyTheme(mode);
    window.dispatchEvent(new CustomEvent("fp-settings-changed", { detail: { key: "font-size", value: size } }));
  };

  const handleLineHeightChange = (height: number) => {
    setLineHeight(height);
    saveLineHeight(height);
    applyTheme(mode);
  };

  const handleFontChange = (fontName: string) => {
    setFont(fontName);
    saveFont(fontName);
    const isCustom = customFonts.includes(fontName);
    if (isCustom) {
      showMsg("切换自定义字体需重启生效", "ok");
    } else {
      applyTheme(mode);
    }
  };

  const handleFontWeightChange = (weight: number) => {
    setFontWeight(weight);
    saveFontWeight(weight);
    applyTheme(mode);
    window.dispatchEvent(new CustomEvent("fp-settings-changed", { detail: { key: "font-weight", value: weight } }));
  };

  const handleAutoSaveChange = (enabled: boolean) => {
    setAutoSave(enabled);
    saveAutoSave(enabled);
  };

  const handleAutoSaveDelayChange = (delay: number) => {
    setAutoSaveDelay(delay);
    saveAutoSaveDelay(delay);
  };

  const handleTabSizeChange = (size: number) => {
    setTabSize(size);
    saveTabSize(size);
    window.dispatchEvent(new CustomEvent("fp-settings-changed", { detail: { key: "tab-size", value: size } }));
  };

  useEffect(() => {
    if (!recording) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        return;
      }
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      const key = e.key.toUpperCase();
      if (!["CONTROL", "SHIFT", "ALT", "META"].includes(key)) {
        parts.push(key === " " ? "Space" : key);
        const combo = parts.join("+");
        setQuickShortcut(combo);
        saveQuickShortcut(combo);
        setRecording(false);
        invoke("update_quick_shortcut", { shortcut: combo }).catch(() => { });
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [recording]);

  const handleViewModeChange = (m: string) => {
    setViewMode(m);
    saveViewMode(m);
    window.dispatchEvent(new CustomEvent("fp-settings-changed", { detail: { key: "view-mode", value: m } }));
  };

  const handleSplitRatioChange = (r: number) => {
    setSplitRatio(r);
    saveSplitRatio(r);
    window.dispatchEvent(new CustomEvent("fp-settings-changed", { detail: { key: "split-ratio", value: r } }));
  };

  const handleQuickPinnedChange = (pinned: boolean) => {
    setQuickPinned(pinned);
    saveQuickPinned(pinned);
  };

  const handleImportFont = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "字体文件", extensions: ["ttf", "otf", "woff", "woff2"] }],
    });
    if (!selected) return;
    try {
      const fontName = `Custom-${Date.now()}`;
      const dataDir = await db.getDataDir();
      const fileName = (selected as string).split(/[/\\]/).pop() || "font.ttf";
      const destPath = `${dataDir}/fonts/${fileName}`;
      await invoke("copy_file", { src: selected, dest: destPath });
      await loadCustomFont(fontName, destPath);
      const updated = [...customFonts, fontName];
      setCustomFonts(updated);
      saveCustomFonts(updated);
      setFont(fontName);
      saveFont(fontName);
      applyTheme(mode);
      showMsg("字体导入成功", "ok");
    } catch (e) {
      showMsg(String(e), "err");
    }
  };

  const handleDownloadFont = async (font: { name: string; file: string; url: string }) => {
    try {
      const dataDir = await db.getDataDir();
      const destPath = `${dataDir}/fonts/${font.file}`;
      await invoke("download_font", { url: font.url, dest: destPath });
      const fontName = font.name.replace(/\s+/g, "-");
      const updated = [...customFonts, fontName];
      setCustomFonts(updated);
      saveCustomFonts(updated);
      showMsg(`${font.name} 下载成功，选择后需重启生效`, "ok");
    } catch (e) {
      showMsg(String(e), "err");
    }
  };

  const handleChooseDir = async () => {
    const selected = await open({ directory: true });
    if (selected) {
      const newPath = await db.setDataDir(selected);
      setDataDir(newPath);
    }
  };

  const handleBackup = async () => {
    const destDir = await open({ directory: true });
    if (!destDir) return;
    try {
      const zipPath = await db.backupData(destDir as string, JSON.stringify(collectSettingsSnapshot(), null, 2));
      showMsg(`已备份到 ${zipPath}`, "ok");
    } catch (e) {
      showMsg(String(e), "err");
    }
  };

  const handleCleanupOrphanAttachments = async () => {
    setBusyAction("cleanup");
    try {
      const result = await db.cleanupOrphanAttachments();
      const mb = (result.bytes / 1024 / 1024).toFixed(2);
      window.dispatchEvent(new CustomEvent("kova-attachments-cleaned", { detail: result.assetPaths ?? [] }));
      showMsg(`已清理 ${result.removed} 个孤儿附件，释放 ${mb} MB`, "ok");
    } catch (e) {
      showMsg(String(e), "err");
    } finally {
      setBusyAction(null);
    }
  };

  const handleRefreshDevices = async () => {
    setBusyAction("devices");
    try {
      await refreshCloudDevices();
      showMsg("设备列表已刷新", "ok");
    } catch (e) {
      showMsg(String(e), "err");
    } finally {
      setBusyAction(null);
    }
  };

  const handleRenameDevice = async (device: KovaDevice) => {
    const nextName = window.prompt("设备名称", device.deviceName || device.deviceId);
    if (!nextName?.trim()) return;
    setBusyAction("devices");
    try {
      await updateKovaDevice(device.deviceId, nextName.trim());
      await refreshCloudDevices();
      showMsg("设备已重命名", "ok");
    } catch (e) {
      showMsg(String(e), "err");
    } finally {
      setBusyAction(null);
    }
  };

  const handleRevokeDevice = async (device: KovaDevice) => {
    if (!window.confirm(`确定撤销设备「${device.deviceName || device.deviceId}」吗？`)) return;
    setBusyAction("devices");
    try {
      await revokeKovaDevice(device.deviceId);
      await refreshCloudDevices();
      showMsg("设备已撤销", "ok");
    } catch (e) {
      showMsg(String(e), "err");
    } finally {
      setBusyAction(null);
    }
  };

  const collectSettingsSnapshot = () => {
    const settings: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("fp-")) settings[key] = localStorage.getItem(key) || "";
    }
    return settings;
  };

  const sha256Hex = async (bytes: Uint8Array) => {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  };

  const normalizeHash = (value?: string | null) => value?.trim().toLowerCase() || null;

  const validateDownloadedSnapshot = async (path: string, snapshot: KovaBackupSnapshot) => {
    const bytes = new Uint8Array(await db.readBinaryFile(path));
    if (snapshot.fileSize != null && snapshot.fileSize !== bytes.byteLength) {
      throw new Error(`云备份大小校验失败：登记 ${snapshot.fileSize} 字节，实际 ${bytes.byteLength} 字节`);
    }

    const expectedHash = normalizeHash(snapshot.sha256);
    if (expectedHash) {
      const actualHash = await sha256Hex(bytes);
      if (actualHash !== expectedHash) {
        throw new Error("云备份 SHA-256 校验失败，已拒绝恢复");
      }
    }
  };

  const applyRestoredSettingsJson = (content: string | null | undefined) => {
    if (!content) return;
    const settings = JSON.parse(content);
    if (settings && typeof settings === "object" && !Array.isArray(settings)) {
      for (const [key, value] of Object.entries(settings)) {
        if (key.startsWith("fp-") && typeof value === "string") {
          localStorage.setItem(key, value);
        }
      }
    }
  };

  const handleCloudBackup = async () => {
    const session = getCloudSession();
    if (!session) {
      showMsg("请先登录云端账号", "err");
      return;
    }
    setBusyAction("cloudBackup");
    try {
      const zipPath = await db.backupData(dataDir, JSON.stringify(collectSettingsSnapshot(), null, 2));
      const bytes = new Uint8Array(await db.readBinaryFile(zipPath));
      const fileName = zipPath.split(/[/\\]/).pop() || `kova-cloud-backup-${Date.now()}.zip`;
      const uploaded = await uploadKovaAsset(new Blob([bytes], { type: "application/zip" }), fileName);
      const [notes, folders] = await Promise.all([db.list(), db.listFolders()]);
      await registerKovaBackupSnapshot({
        snapshotId: crypto.randomUUID(),
        deviceId: undefined,
        snapshotName: fileName,
        storageKey: uploaded.url,
        fileSize: bytes.byteLength,
        sha256: await sha256Hex(bytes),
        noteCount: notes.length,
        folderCount: folders.length,
        attachmentCount: null,
        status: "available",
      });
      showMsg("云备份已完成", "ok");
    } catch (e) {
      showMsg(String(e), "err");
    } finally {
      setBusyAction(null);
    }
  };

  const handleCloudRestore = async () => {
    if (!getCloudSession()) {
      showMsg("请先登录云端账号", "err");
      return;
    }
    setBusyAction("cloudRestore");
    try {
      const snapshots = await listKovaBackupSnapshots(1, 20);
      setCloudSnapshots(snapshots.filter((item) => item.storageKey));
      if (snapshots.length === 0) showMsg("没有可恢复的云备份", "err");
    } catch (e) {
      showMsg(String(e), "err");
    } finally {
      setBusyAction(null);
    }
  };

  const handleSelectCloudSnapshot = async (snapshot: KovaBackupSnapshot) => {
    if (!snapshot.storageKey) {
      showMsg("该快照缺少可下载地址", "err");
      return;
    }
    setBusyAction("cloudRestore");
    try {
      const targetPath = await db.downloadFileToDataDir(snapshot.storageKey, `kova-cloud-restore-${Date.now()}.zip`);
      await validateDownloadedSnapshot(targetPath, snapshot);
      const inspection = await db.inspectRestoreData(targetPath);
      setCloudRestoreUrl(snapshot.storageKey);
      setCloudRestoreSnapshot(snapshot);
      setRestorePath(targetPath);
      setRestoreInspection(inspection);
      setConfirmRestore(snapshot.snapshotName || "云备份");
    } catch (e) {
      showMsg(String(e), "err");
    } finally {
      setBusyAction(null);
    }
  };

  const handleRestore = async () => {
    const selected = await open({
      filters: [{ name: "备份文件", extensions: ["zip", "db", "json"] }],
    });
    if (!selected) return;
    try {
      const targetPath = selected as string;
      const inspection = await db.inspectRestoreData(targetPath);
      setRestorePath(targetPath);
      setRestoreInspection(inspection);
      setCloudRestoreUrl(null);
      setCloudRestoreSnapshot(null);
      setConfirmRestore(targetPath);
    } catch (e) {
      showMsg(String(e), "err");
    }
  };

  const doRestore = async () => {
    try {
      let targetPath = restorePath;
      if (!targetPath && cloudRestoreUrl) {
        targetPath = await db.downloadFileToDataDir(cloudRestoreUrl, `kova-cloud-restore-${Date.now()}.zip`);
        if (cloudRestoreSnapshot) {
          await validateDownloadedSnapshot(targetPath, cloudRestoreSnapshot);
        }
      }
      if (!targetPath) return;

      const inspection = restoreInspection ?? await db.inspectRestoreData(targetPath);
      if (!inspection.can_restore) {
        throw new Error(inspection.summary);
      }

      const result = await db.restoreData(targetPath);
      applyRestoredSettingsJson(result.restored_settings_json);
      showMsg(`${result.message}；恢复前备份：${result.pre_restore_backup_path}`, "ok");
      setConfirmRestore(null);
      setRestorePath(null);
      setRestoreInspection(null);
      setCloudRestoreUrl(null);
      setCloudRestoreSnapshot(null);
      await relaunch();
    } catch (e) {
      showMsg(String(e), "err");
    }
  };

  const formatDateTime = (value?: string | null) => value
    ? new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "无记录";

  const formatNextSyncTime = (value?: string | null) => {
    if (!keepaliveSyncEnabled) return "已关闭";
    if (!value) return getCloudSession() ? "等待调度" : "登录后生效";
    return formatDateTime(value);
  };

  const formatEntityStats = (stats?: SyncRunDiagnostics["pushed"]) => {
    if (!stats) return "笔记 0 / 文件夹 0 / 附件 0 / 设置 0";
    return `笔记 ${stats.notes} / 文件夹 ${stats.folders} / 附件 ${stats.attachments} / 设置 ${stats.settings}`;
  };

  const handleCopySyncDiagnostics = async () => {
    const diagnostics = syncDiagnostics ?? loadLastSyncDiagnostics();
    if (!diagnostics) {
      showMsg("暂无同步诊断信息", "err");
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
      showMsg("同步诊断信息已复制", "ok");
    } catch (e) {
      showMsg(String(e), "err");
    }
  };

  const defaultAccent = mode === "dark" ? DEFAULT_ACCENT_DARK : DEFAULT_ACCENT_LIGHT;
  const defaultPaper = mode === "dark" ? DEFAULT_PAPER_DARK : DEFAULT_PAPER_LIGHT;
  const activeCategoryMeta = SETTINGS_CATEGORIES.find((item) => item.id === activeCategory) ?? SETTINGS_CATEGORIES[0];

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/30 px-4 py-6" onMouseDown={onClose}>
      <div
        className="flex h-[min(720px,calc(100vh-48px))] w-full max-w-5xl overflow-hidden rounded-3xl border border-paper-deep/50 bg-cloud/96 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl animate-view-fade"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <aside className="flex w-64 shrink-0 flex-col border-r border-paper-deep/25 bg-paper/72">
          <div className="border-b border-paper-deep/25 px-5 py-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-ink-ghost">Preferences</div>
            <h2 className="mt-1 text-base font-semibold text-ink-soft">应用设置</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-ghost">按类型整理设置项，减少长列表滚动和主界面挤压。</p>
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
            {SETTINGS_CATEGORIES.map((item) => {
              const active = item.id === activeCategory;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveCategory(item.id)}
                  className={`w-full rounded-2xl px-3 py-3 text-left transition-colors ${
                    active
                      ? "bg-accent-mist text-accent"
                      : "text-ink-soft hover:bg-paper-warm/70 hover:text-accent"
                  }`}
                >
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className={`mt-1 text-[11px] leading-relaxed ${active ? "text-accent/80" : "text-ink-ghost"}`}>
                    {item.description}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col bg-paper/92">
          <div className="flex items-start justify-between gap-4 border-b border-paper-deep/25 px-6 py-5">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-ink-ghost">{activeCategoryMeta.label}</div>
              <h3 className="mt-1 text-lg font-semibold text-ink-soft">{activeCategoryMeta.description}</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-ink-ghost transition-colors hover:bg-paper-warm hover:text-ink-soft"
              title="关闭设置"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2 2l8 8M10 2l-8 8" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="space-y-4">
              {activeCategory === "general" && (
                <>
                  <SettingsGroup title="启动与托盘" description="决定应用如何进入系统和如何响应关闭动作。">
                    <ToggleRow label="开机自启动" checked={autoStart} onChange={setAutoStart} />
                    <ToggleRow label="关闭时最小化到托盘" checked={closeToTray} onChange={setCloseToTray} />
                  </SettingsGroup>

                  <SettingsGroup title="窗口行为" description="控制主编辑区打开时的默认呈现方式。">
                    <ViewModeRow label="默认视图" value={viewMode} defaultVal={DEFAULT_VIEW_MODE} onChange={handleViewModeChange} />
                    <SliderRow label="分栏比例" value={splitRatio} min={30} max={70} step={5} unit="%" defaultVal={DEFAULT_SPLIT_RATIO} onChange={handleSplitRatioChange} />
                  </SettingsGroup>
                </>
              )}

              {activeCategory === "appearance" && (
                <>
                  <SettingsGroup title="主题" description="控制浅色、深色以及主题主色的视觉表现。">
                    <div className="flex items-center justify-between h-9 rounded-lg px-2.5 bg-paper-warm/45 border border-paper-deep/25">
                      <span className="text-[12px] text-ink-soft">当前模式</span>
                      <span className="text-[11px] text-ink-faint">{mode === "light" ? "浅色" : "深色"}</span>
                    </div>
                    <ColorRow label="背景色" value={paper} defaultVal={defaultPaper} onChange={handlePaperChange} />
                    <ColorRow label="主题色" value={accent} defaultVal={defaultAccent} onChange={handleAccentChange} />
                    <p className="text-[10px] text-ink-ghost/75">通过标题栏月亮图标切换深浅色模式。</p>
                  </SettingsGroup>

                  <SettingsGroup title="字体" description="统一控制编辑和阅读的字体风格。">
                    <FontRow label="字体" value={font} presetFonts={PRESET_FONTS} customFonts={customFonts} downloadableFonts={DOWNLOADABLE_FONTS} defaultVal={DEFAULT_FONT} onChange={handleFontChange} onImport={handleImportFont} onDownload={handleDownloadFont} />
                    <SliderRow label="字体大小" value={fontSize} min={12} max={20} step={1} unit="px" defaultVal={DEFAULT_FONT_SIZE} onChange={handleFontSizeChange} />
                    <SliderRow label="字体粗细" value={fontWeight} min={100} max={900} step={100} unit="" defaultVal={DEFAULT_FONT_WEIGHT} onChange={handleFontWeightChange} />
                    <SliderRow label="行高" value={lineHeight} min={1.4} max={2.4} step={0.1} unit="" defaultVal={DEFAULT_LINE_HEIGHT} onChange={handleLineHeightChange} />
                  </SettingsGroup>
                </>
              )}

              {activeCategory === "editor" && (
                <>
                  <SettingsGroup title="自动保存" description="设置输入后的自动落盘策略。">
                    <ToggleRow label="自动保存" checked={autoSave} onChange={handleAutoSaveChange} />
                    {autoSave && (
                      <SliderRow label="保存延迟" value={autoSaveDelay} min={500} max={2000} step={100} unit="ms" defaultVal={DEFAULT_AUTO_SAVE_DELAY} onChange={handleAutoSaveDelayChange} />
                    )}
                  </SettingsGroup>

                  <SettingsGroup title="缩进与视图" description="调整编辑器缩进和默认阅读布局。">
                    <TabSizeRow label="Tab 缩进" value={tabSize} defaultVal={DEFAULT_TAB_SIZE} onChange={handleTabSizeChange} />
                    <ViewModeRow label="默认视图" value={viewMode} defaultVal={DEFAULT_VIEW_MODE} onChange={handleViewModeChange} />
                  </SettingsGroup>
                </>
              )}

              {activeCategory === "quick" && (
                <>
                  <SettingsGroup title="默认行为" description="设置快捷便签窗口打开后的基础状态。">
                    <ToggleRow label="默认钉住" checked={quickPinned} onChange={handleQuickPinnedChange} />
                  </SettingsGroup>

                  <SettingsGroup title="全局快捷键" description="定义呼出快捷便签和常用缩放手势。">
                    <div className="flex items-center justify-between h-9 rounded-lg px-2.5 bg-paper-warm/45 border border-paper-deep/25">
                      <span className="text-[12px] text-ink-soft">打开便签</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[12px] font-mono px-2 py-0.5 rounded ${recording ? "bg-accent-mist text-accent animate-pulse" : "text-ink-soft"}`}>
                          {recording ? "按下快捷键..." : quickShortcut}
                        </span>
                        {recording ? (
                          <button type="button" onClick={() => setRecording(false)} className="text-[10px] text-ink-ghost hover:text-danger transition-colors">
                            取消
                          </button>
                        ) : (
                          <>
                            <button type="button" onClick={() => setRecording(true)} className="text-[10px] text-ink-ghost hover:text-accent transition-colors">
                              录制
                            </button>
                            {quickShortcut !== DEFAULT_QUICK_SHORTCUT && (
                              <button
                                type="button"
                                onClick={() => {
                                  setQuickShortcut(DEFAULT_QUICK_SHORTCUT);
                                  saveQuickShortcut(DEFAULT_QUICK_SHORTCUT);
                                  invoke("update_quick_shortcut", { shortcut: DEFAULT_QUICK_SHORTCUT }).catch(() => { });
                                }}
                                className="text-[10px] text-ink-ghost hover:text-accent transition-colors"
                              >
                                重置
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between h-9 rounded-lg px-2.5 bg-paper-warm/45 border border-paper-deep/25">
                      <span className="text-[12px] text-ink-soft">放大/缩小/重置</span>
                      <span className="text-[12px] font-mono text-ink-soft">Ctrl+滚轮/0</span>
                    </div>
                  </SettingsGroup>
                </>
              )}

              {activeCategory === "sync" && (
                <>
                  <SettingsGroup title="同步策略" description="控制保活巡检频率和下一次调度时间。">
                    <ToggleRow label="保活式巡检" checked={keepaliveSyncEnabled} onChange={onKeepaliveSyncEnabledChange} />
                    {keepaliveSyncEnabled && (
                      <SliderRow
                        label="巡检间隔"
                        value={keepaliveSyncIntervalMinutes}
                        min={1}
                        max={60}
                        step={1}
                        unit="分钟"
                        defaultVal={DEFAULT_KEEPALIVE_SYNC_INTERVAL_MINUTES}
                        onChange={onKeepaliveSyncIntervalMinutesChange}
                      />
                    )}
                    <div className="rounded-lg border border-paper-deep/25 bg-paper-warm/45 px-2.5 py-2 text-[11px] text-ink-soft space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-ink-ghost">上一次同步</span>
                        <span>{formatDateTime(lastSyncAt)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-ink-ghost">下一次同步</span>
                        <span>{formatNextSyncTime(nextSyncAt)}</span>
                      </div>
                    </div>
                  </SettingsGroup>

                  <SettingsGroup title="同步诊断" description="查看最近一次同步的运行轨迹与错误信息。">
                    <div className="flex items-center justify-end">
                      <button type="button" onClick={handleCopySyncDiagnostics} className="text-[10px] text-ink-ghost hover:text-accent transition-colors">
                        复制诊断信息
                      </button>
                    </div>
                    {syncDiagnostics ? (
                      <div className="rounded-lg border border-paper-deep/25 bg-paper-warm/45 px-2.5 py-2 text-[11px] text-ink-soft space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-ink-ghost">运行</span>
                          <span className="font-mono truncate">{syncDiagnostics.runId}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-ink-ghost">状态</span>
                          <span>{syncDiagnostics.status} · {syncDiagnostics.trigger} · {syncDiagnostics.online ? "在线" : "离线"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-ink-ghost">耗时</span>
                          <span>{formatDateTime(syncDiagnostics.finishedAt ?? syncDiagnostics.startedAt)} · {syncDiagnostics.durationMs ?? 0}ms</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-ink-ghost">队列</span>
                          <span>待同步 {syncDiagnostics.queue.pending} / 失败 {syncDiagnostics.queue.failed}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-ink-ghost">游标</span>
                          <span className="font-mono">P {syncDiagnostics.cursors.beforePush}→{syncDiagnostics.cursors.afterPush} / L {syncDiagnostics.cursors.beforePull}→{syncDiagnostics.cursors.afterPull}</span>
                        </div>
                        <div className="border-t border-paper-deep/20 pt-1.5 space-y-1">
                          <div>推送：{formatEntityStats(syncDiagnostics.pushed)}</div>
                          <div>拉取：{formatEntityStats(syncDiagnostics.pulled)}</div>
                          <div>保护：{formatEntityStats(syncDiagnostics.skipped)}</div>
                          <div>冲突：{formatEntityStats(syncDiagnostics.conflicts)}</div>
                          <div>附件：归档 {syncDiagnostics.assets.archived} / 补齐 {syncDiagnostics.assets.restored} / 上传复用 {syncDiagnostics.assets.uploadReused} / 下载复用 {syncDiagnostics.assets.downloadReused}</div>
                        </div>
                        {syncDiagnostics.error && (
                          <div className="border-t border-paper-deep/20 pt-1.5 text-danger break-words">
                            {syncDiagnostics.error.category}：{syncDiagnostics.error.message}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[10px] text-ink-ghost/75">完成一次同步后，会显示最近一次同步诊断。</p>
                    )}
                  </SettingsGroup>

                  <SettingsGroup title="云端设备" description="管理参与同步的设备身份。">
                    <div className="flex items-center justify-end">
                      <button type="button" onClick={handleRefreshDevices} disabled={busyAction !== null} className="text-[10px] text-ink-ghost hover:text-accent disabled:opacity-50 transition-colors">
                        {busyAction === "devices" ? "处理中..." : "刷新"}
                      </button>
                    </div>
                    {cloudDevices.length > 0 ? (
                      <div className="space-y-1.5">
                        {cloudDevices.map((device) => (
                          <div key={device.deviceId} className="rounded-lg border border-paper-deep/25 bg-paper-warm/45 px-2.5 py-2 text-[11px]">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-ink-soft">{device.deviceName || device.deviceId}</div>
                                <div className="truncate text-ink-ghost mt-0.5">{device.platform || "未知平台"} · {device.appVersion || "未知版本"}</div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button type="button" onClick={() => handleRenameDevice(device)} disabled={busyAction !== null} className="text-ink-ghost hover:text-accent disabled:opacity-50 transition-colors">重命名</button>
                                <button type="button" onClick={() => handleRevokeDevice(device)} disabled={busyAction !== null} className="text-ink-ghost hover:text-danger disabled:opacity-50 transition-colors">撤销</button>
                              </div>
                            </div>
                            <div className="mt-1 text-ink-ghost">
                              最近同步 {device.lastSyncTime ? new Date(device.lastSyncTime).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "无记录"}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-ink-ghost/75">登录并完成一次同步后，会显示云端设备列表。</p>
                    )}
                  </SettingsGroup>
                </>
              )}

              {activeCategory === "data" && (
                <>
                  <SettingsGroup title="数据目录" description="应用数据库、字体和附件所在的本地路径。">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={dataDir}
                        readOnly
                        title="数据存储目录"
                        className="min-w-0 flex-1 h-8 px-2.5 rounded-lg bg-paper-warm/45 border border-paper-deep/25 text-[11px] font-mono text-ink-soft truncate"
                      />
                      <button type="button" onClick={handleChooseDir} className="h-8 px-3 rounded-lg border border-paper-deep/45 text-[11px] text-ink-faint hover:text-accent hover:bg-accent-mist/50 transition-colors">
                        更改
                      </button>
                    </div>
                  </SettingsGroup>

                  <SettingsGroup title="备份与恢复" description="支持本地打包备份，也支持通过云端快照恢复。">
                    <div className="flex gap-2">
                      <button type="button" onClick={handleBackup} className="flex-1 h-9 rounded-lg border border-paper-deep/45 text-[12px] text-ink-faint hover:text-accent hover:bg-accent-mist/50 transition-colors flex items-center justify-center gap-1.5">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                        本地备份
                      </button>
                      <button type="button" onClick={handleRestore} className="flex-1 h-9 rounded-lg border border-paper-deep/45 text-[12px] text-ink-faint hover:text-accent hover:bg-accent-mist/50 transition-colors flex items-center justify-center gap-1.5">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                        本地恢复
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={handleCloudBackup} disabled={busyAction !== null} className="h-9 rounded-lg border border-paper-deep/45 text-[12px] text-ink-faint hover:text-accent hover:bg-accent-mist/50 disabled:opacity-50 transition-colors">
                        {busyAction === "cloudBackup" ? "备份中..." : "云备份"}
                      </button>
                      <button type="button" onClick={handleCloudRestore} disabled={busyAction !== null} className="h-9 rounded-lg border border-paper-deep/45 text-[12px] text-ink-faint hover:text-accent hover:bg-accent-mist/50 disabled:opacity-50 transition-colors">
                        {busyAction === "cloudRestore" ? "读取中..." : "云备份列表"}
                      </button>
                    </div>
                    {cloudSnapshots.length > 0 && (
                      <div className="space-y-1.5">
                        {cloudSnapshots.map((snapshot) => (
                          <button key={snapshot.snapshotId} type="button" onClick={() => handleSelectCloudSnapshot(snapshot)} className="w-full text-left rounded-lg border border-paper-deep/25 bg-paper-warm/45 px-2.5 py-2 hover:border-accent/40 hover:bg-accent-mist/30 transition-colors">
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="min-w-0 truncate text-ink-soft">{snapshot.snapshotName || snapshot.snapshotId}</span>
                              <span className="shrink-0 text-ink-ghost">{snapshot.fileSize ? `${(snapshot.fileSize / 1024 / 1024).toFixed(1)} MB` : "未知大小"}</span>
                            </div>
                            <div className="mt-1 text-[10px] text-ink-ghost truncate">
                              {snapshot.createTime ? new Date(snapshot.createTime).toLocaleString("zh-CN") : "未知时间"}
                              {" · "}{snapshot.noteCount ?? 0} 笔记 / {snapshot.folderCount ?? 0} 文件夹 / {snapshot.attachmentCount ?? 0} 附件
                            </div>
                            {snapshot.sha256 && <div className="mt-0.5 text-[10px] text-ink-ghost/70 truncate">SHA-256 {snapshot.sha256}</div>}
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-ink-ghost/75">设备恢复会先列出可用云备份，选择快照后再覆盖当前本地数据。</p>
                  </SettingsGroup>

                  <SettingsGroup title="本地清理" description="移除已经失去引用的附件文件。">
                    <button type="button" onClick={handleCleanupOrphanAttachments} disabled={busyAction !== null} className="w-full h-9 rounded-lg border border-paper-deep/45 text-[12px] text-ink-faint hover:text-accent hover:bg-accent-mist/50 disabled:opacity-50 transition-colors">
                      {busyAction === "cleanup" ? "清理中..." : "清理本地孤儿附件"}
                    </button>
                  </SettingsGroup>
                </>
              )}

              {activeCategory === "about" && (
                <>
                  <SettingsGroup title="应用信息" description="当前应用版本和产品定位。">
                    <div className="rounded-lg border border-paper-deep/25 bg-paper-warm/45 px-3 py-3 text-[12px] leading-relaxed text-ink-soft">
                      Kova v0.1.0 — 灵感来了，记一笔。
                    </div>
                  </SettingsGroup>

                  <SettingsGroup title="当前环境" description="帮助快速确认当前外观模式与数据目录。">
                    <div className="rounded-lg border border-paper-deep/25 bg-paper-warm/45 px-3 py-2 text-[11px] text-ink-soft space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-ink-ghost">主题模式</span>
                        <span>{mode === "light" ? "浅色" : "深色"}</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-ink-ghost shrink-0">数据目录</span>
                        <span className="font-mono text-right break-all">{dataDir || "未加载"}</span>
                      </div>
                    </div>
                  </SettingsGroup>
                </>
              )}

              {msg && (
                <div className={`text-[11px] px-3 py-2 rounded-lg ${msg.type === "ok" ? "text-accent bg-accent-mist" : "text-danger bg-danger-bg"}`}>
                  {msg.text}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmRestore && (
        <ConfirmDialog
          title="恢复数据"
          message={restoreInspection
            ? `${restoreInspection.summary}${restoreInspection.warnings.length ? `\n\n注意：${restoreInspection.warnings.join("；")}` : ""}\n\n恢复将覆盖当前本地数据，确定继续吗？`
            : "恢复将覆盖当前所有数据，确定继续吗？"}
          danger
          confirmLabel="恢复"
          onConfirm={doRestore}
          onCancel={() => {
            setConfirmRestore(null);
            setRestoreInspection(null);
          }}
        />
      )}
    </div>
  );
}
