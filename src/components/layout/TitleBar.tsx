import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ThemeMode } from "../../lib/theme";
import type { CloudUser } from "../../lib/cloudApi";

const appWindow = getCurrentWindow();

interface TitleBarProps {
  settingsOpen: boolean;
  loginOpen: boolean;
  aiOpen: boolean;
  closeToTray: boolean;
  mode: ThemeMode;
  cloudUser?: CloudUser | null;
  isCloudLoggedIn?: boolean;
  isSyncing?: boolean;
  onToggleMode: () => void;
  onToggleSettings: () => void;
  onToggleLogin: () => void;
  onToggleAI: () => void;
  onSync?: () => void;
}

export function TitleBar({ settingsOpen, loginOpen, aiOpen, closeToTray, mode, cloudUser, isCloudLoggedIn, isSyncing, onToggleMode, onToggleSettings, onToggleLogin, onToggleAI, onSync }: TitleBarProps) {
  const [pinned, setPinned] = useState(() => {
    const saved = localStorage.getItem("fp-pinned");
    return saved === "true";
  });

  // Sync alwaysOnTop on mount (in case HMR reset state)
  useEffect(() => {
    if (pinned) appWindow.setAlwaysOnTop(true);
  }, []);

  const handleTogglePin = async () => {
    const next = !pinned;
    await appWindow.setAlwaysOnTop(next);
    setPinned(next);
    localStorage.setItem("fp-pinned", String(next));
  };

  const cloudDisplayName = cloudUser?.nickname || cloudUser?.username || "Kova 云同步";
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const avatarUrl = cloudUser?.avatarUrl && cloudUser.avatarUrl !== failedAvatarUrl ? cloudUser.avatarUrl : null;

  return (
    <div
      data-tauri-drag-region
      className="h-11 flex items-center justify-between px-4 bg-paper/55 backdrop-blur-sm border-b border-paper-deep shrink-0"
    >
      <span className="text-sm font-medium text-accent tracking-wide select-none">
        Kova
      </span>
      <div className="flex items-center gap-1">
        {/* Theme toggle */}
        <button
          type="button"
          onClick={onToggleMode}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-paper-deep text-ink-faint hover:text-ink-soft transition-colors"
          title={mode === "light" ? "切换深色模式" : "切换浅色模式"}
        >
          {mode === "light" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          )}
        </button>
        {/* Pin */}
        <button
          type="button"
          onClick={handleTogglePin}
          className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
            pinned ? "bg-accent-mist text-accent" : "hover:bg-paper-deep text-ink-faint hover:text-ink-soft"
          }`}
          title={pinned ? "取消置顶" : "置顶窗口"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1z"/>
          </svg>
        </button>
        {/* AI */}
        <button
          type="button"
          onClick={onToggleAI}
          className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
            aiOpen ? "bg-accent-mist text-accent" : "hover:bg-paper-deep text-ink-faint hover:text-ink-soft"
          }`}
          title="AI 助手"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/>
            <path d="M19 13l.75 2.25L22 16l-2.25.75L19 19l-.75-2.25L16 16l2.25-.75L19 13z"/>
            <path d="M5 17l.5 1.5L7 19l-1.5.5L5 21l-.5-1.5L3 19l1.5-.5L5 17z"/>
          </svg>
        </button>
        {/* Sync */}
        {isCloudLoggedIn ? (
          <button
            type="button"
            onClick={onSync}
            disabled={isSyncing}
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              isSyncing ? "bg-accent-mist text-accent cursor-wait" : "hover:bg-paper-deep text-ink-faint hover:text-ink-soft"
            }`}
            title={isSyncing ? "同步中" : "立即同步"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isSyncing ? "animate-spin" : ""}>
              <path d="M21 12a9 9 0 0 1-15.64 6.12"/>
              <path d="M3 12A9 9 0 0 1 18.64 5.88"/>
              <path d="M21 3v6h-6"/>
              <path d="M3 21v-6h6"/>
            </svg>
          </button>
        ) : null}
        {/* Login */}
        <button
          type="button"
          onClick={onToggleLogin}
          className={`relative h-7 flex items-center justify-center transition-colors overflow-hidden ${
            isCloudLoggedIn
              ? `max-w-36 gap-1.5 rounded-full border px-1.5 pr-2 ${loginOpen ? "border-accent/35 bg-accent-mist text-accent" : "border-paper-deep/70 bg-cloud/70 text-ink-soft hover:border-accent/35 hover:bg-accent-mist/70"}`
              : `w-7 rounded ${loginOpen ? "bg-accent-mist text-accent" : "hover:bg-paper-deep text-ink-faint hover:text-ink-soft"}`
          }`}
          title={isCloudLoggedIn ? cloudDisplayName : "登录"}
        >
          {isCloudLoggedIn ? (
            <>
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={cloudDisplayName}
                  onError={() => setFailedAvatarUrl(avatarUrl)}
                  className="w-5 h-5 rounded-full object-cover shrink-0"
                />
              ) : null}
              <span className="min-w-0 truncate text-[11px] font-medium">
                {cloudDisplayName}
              </span>
            </>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21a8 8 0 0 0-16 0" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          )}
        </button>
        {/* Settings */}
        <button
          type="button"
          onClick={onToggleSettings}
          className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
            settingsOpen ? "bg-accent-mist text-accent" : "hover:bg-paper-deep text-ink-faint hover:text-ink-soft"
          }`}
          title="设置"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
        <div className="w-px h-4 bg-paper-deep mx-0.5" />
        {/* Minimize */}
        <button type="button" onClick={() => appWindow.minimize()}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-paper-deep text-ink-faint hover:text-ink-soft transition-colors">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
        {/* Maximize */}
        <button type="button" onClick={() => appWindow.toggleMaximize()}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-paper-deep text-ink-faint hover:text-ink-soft transition-colors">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="2" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/></svg>
        </button>
        {/* Close */}
        <button type="button" onClick={() => closeToTray ? appWindow.hide() : appWindow.close()}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-danger-bg text-ink-faint hover:text-danger transition-colors">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      </div>
    </div>
  );
}
