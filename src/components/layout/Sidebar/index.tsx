import { useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { db } from "../../../lib/db";
import type { Folder, Note } from "../../../lib/db";
import { buildSidebarFolderTree } from "../../../lib/noteNavigation";
import { SearchBar } from "../../shared/SearchBar";
import { ContextMenu, type ContextMenuItem } from "../../dialog/ContextMenu";
import { ConfirmDialog } from "../../dialog/ConfirmDialog";
import { FolderItem } from "./FolderItem";
import { FolderInfoDialog } from "./FolderInfoDialog";
import type { FolderNode } from "./types";
import type { AIContextAttachment } from "../AIChatPanel/types";

const EXPANDED_FOLDERS_STORAGE_KEY = "fp-sidebar-expanded-folders";

interface SidebarProps {
  search: string;
  currentNotes: Note[];
  allNotes: Note[];
  selectedId: string | null;
  folders: Folder[];
  selectedFolderId: string | null;
  onSearchChange: (value: string) => void;
  onSearchCommit: (value: string) => void;
  onSelectNote: (note: Note) => void;
  onSelectAll: () => void;
  onCreateNote: (folderId?: string) => void;
  onFolderSelect: (folderId: string) => void;
  onFolderCreate: (name: string, parentId?: string) => void;
  onFolderRename: (id: string, name: string) => void;
  onFolderDelete: (id: string) => Promise<void>;
  onMoveToFolder: (noteId: string, folderId: string | null) => void;
  onImported: () => void;
  onAddToAIContext: (attachments: AIContextAttachment[]) => void;
  onAddToNewAIContext: (attachments: AIContextAttachment[]) => void;
}

export function Sidebar({
  search,
  currentNotes,
  allNotes,
  selectedId,
  folders,
  selectedFolderId,
  onSearchChange,
  onSearchCommit,
  onSelectNote,
  onSelectAll,
  onCreateNote,
  onFolderSelect,
  onFolderCreate,
  onFolderRename,
  onFolderDelete,
  onMoveToFolder,
  onImported,
  onAddToAIContext,
  onAddToNewAIContext,
}: SidebarProps) {
  const folderTree = useMemo(() => buildSidebarFolderTree(folders, allNotes), [folders, allNotes]);
  const [folderMenuPos, setFolderMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [folderMenuNode, setFolderMenuNode] = useState<FolderNode | null>(null);
  const [folderConfirm, setFolderConfirm] = useState<{ title: string; message: string; onConfirm: () => void | Promise<void>; danger?: boolean; confirmLabel?: string } | null>(null);
  const [folderInfoNode, setFolderInfoNode] = useState<FolderNode | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_FOLDERS_STORAGE_KEY);
      if (!raw) return new Set();
      const ids = JSON.parse(raw);
      return Array.isArray(ids) ? new Set(ids.filter((id): id is string => typeof id === "string")) : new Set();
    } catch {
      return new Set();
    }
  });
  const [exportNotice, setExportNotice] = useState<{ status: "loading" | "success"; message: string } | null>(null);
  const exportNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const contextTotalCount = useMemo(
    () => (selectedFolderId ? allNotes.filter((note) => note.folder_id === selectedFolderId).length : allNotes.length),
    [allNotes, selectedFolderId],
  );

  const uncategorizedNotes = useMemo(
    () => allNotes
      .filter((note) => !note.folder_id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [allNotes],
  );

  const scopeLabel = selectedFolderId
    ? (folders.find((folder) => folder.id === selectedFolderId)?.name ?? "当前文件夹")
    : "全部笔记";

  const toggleExpandedFolder = (folderId: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const showExportNotice = (status: "loading" | "success", message: string) => {
    setExportNotice({ status, message });
    if (exportNoticeTimer.current) clearTimeout(exportNoticeTimer.current);
    if (status === "success") {
      exportNoticeTimer.current = setTimeout(() => setExportNotice(null), 1800);
    }
  };

  useEffect(() => {
    return () => {
      if (exportNoticeTimer.current) clearTimeout(exportNoticeTimer.current);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(EXPANDED_FOLDERS_STORAGE_KEY, JSON.stringify([...expandedFolderIds]));
  }, [expandedFolderIds]);

  useEffect(() => {
    const path = new Set<string>();
    const selectedNote = selectedId ? allNotes.find((note) => note.id === selectedId) : null;
    const activeFolderId = selectedFolderId ?? selectedNote?.folder_id ?? null;
    if (!activeFolderId) return;

    let current = folders.find((folder) => folder.id === activeFolderId) ?? null;
    while (current) {
      path.add(current.id);
      current = current.parent_id ? (folders.find((folder) => folder.id === current?.parent_id) ?? null) : null;
    }

    if (path.size > 0) {
      setExpandedFolderIds((prev) => new Set([...prev, ...path]));
    }
  }, [allNotes, folders, selectedFolderId, selectedId]);

  const handleFolderContextMenu = (e: React.MouseEvent, node: FolderNode) => {
    setFolderMenuPos({ x: e.clientX, y: e.clientY });
    setFolderMenuNode(node);
  };

  const closeFolderMenu = () => {
    setFolderMenuPos(null);
    setFolderMenuNode(null);
  };

  const handleDeleteSelected = () => {
    if (!folderMenuNode) return;
    setFolderConfirm({
      title: "删除文件夹",
      message: `确定删除「${folderMenuNode.name}」吗？其中的笔记将回到全部笔记列表中。`,
      danger: true,
      confirmLabel: "删除",
      onConfirm: async () => {
        await onFolderDelete(folderMenuNode.id);
        setFolderConfirm(null);
      },
    });
  };

  const handleExportFolder = async () => {
    if (!folderMenuNode) return;
    const notes = await db.list(undefined, folderMenuNode.id);
    if (notes.length === 0) {
      setFolderConfirm({ title: "导出文件夹", message: "该文件夹下没有笔记。", onConfirm: () => setFolderConfirm(null) });
      return;
    }
    const destDir = await open({ directory: true });
    if (!destDir) return;
    const paths: string[] = [];
    showExportNotice("loading", `正在导出 ${notes.length} 条笔记...`);
    for (const note of notes) {
      const path = await db.exportNote(note.id, destDir as string);
      paths.push(path);
    }
    showExportNotice("success", `已导出 ${paths.length} 条笔记`);
    db.openPath(destDir as string).catch(console.error);
  };

  const buildSelectedFolderAttachments = async (): Promise<AIContextAttachment[]> => {
    if (!folderMenuNode) return [];
    const notes = await db.list(undefined, folderMenuNode.id);
    return [{
      type: "folder",
      id: folderMenuNode.id,
      name: folderMenuNode.name,
      noteCount: notes.length,
      notes: notes.map((note) => ({ id: note.id, title: note.title || note.content.split("\n")[0] || "无标题笔记" })),
    }];
  };

  const handleAddFolderToAIContext = async () => {
    const attachments = await buildSelectedFolderAttachments();
    if (attachments.length === 0) return;
    onAddToAIContext(attachments);
  };

  const handleAddFolderToNewAIContext = async () => {
    const attachments = await buildSelectedFolderAttachments();
    if (attachments.length === 0) return;
    onAddToNewAIContext(attachments);
  };

  const getFolderMenuItems = (): ContextMenuItem[] => {
    if (!folderMenuNode) return [];

    return [
      {
        label: "添加到当前 AI 对话",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v6M9 10h6"/></svg>,
        onClick: handleAddFolderToAIContext,
      },
      {
        label: "添加到新建 AI 对话",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v6M9 10h6"/></svg>,
        onClick: handleAddFolderToNewAIContext,
      },
      {
        label: "查看详情",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>,
        onClick: () => setFolderInfoNode(folderMenuNode),
      },
      {
        label: "重命名",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
        onClick: () => setRenamingFolderId(folderMenuNode.id),
      },
      {
        label: "新建笔记",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>,
        onClick: () => onCreateNote(folderMenuNode.id),
      },
      {
        label: "新建子文件夹",
        icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M14 13a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13V5.5A1.5 1.5 0 0 1 3.5 4H6l1.5 2h5A1.5 1.5 0 0 1 14 7.5z"/><path d="M8 7v5M5.5 9.5h5" strokeWidth="1.1"/></svg>,
        onClick: () => onFolderCreate("新建子文件夹", folderMenuNode.id),
      },
      {
        label: "导出文件夹",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
        onClick: handleExportFolder,
      },
      {
        label: "删除",
        danger: true,
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
        onClick: handleDeleteSelected,
      },
    ];
  };

  const handleImport = async () => {
    const path = await open({ multiple: false, filters: [{ name: "Markdown/TXT/HTML", extensions: ["md", "txt", "html", "htm"] }] });
    if (!path || Array.isArray(path)) return;
    await db.importFile(path);
    onImported();
  };

  return (
    <div className="h-full flex flex-col bg-[var(--surface-panel)]/98">
      <div className="px-3 pt-3 pb-2 shrink-0 border-b border-[var(--border-soft)]/70 bg-[var(--surface-panel)]/92">
        <SearchBar
          value={search}
          resultCount={currentNotes.length}
          totalCount={contextTotalCount}
          scopeLabel={scopeLabel}
          onChange={onSearchChange}
          onClear={() => onSearchChange("")}
          onCommit={onSearchCommit}
        />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable]">
        <div className="px-3 pt-2 pb-3">
          <div className="px-1 pt-1 pb-2 flex items-center justify-between shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-ghost/80">导航</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onFolderCreate("新建文件夹")}
                className="w-7 h-7 rounded-xl flex items-center justify-center transition-colors text-ink-ghost hover:text-accent hover:bg-[var(--surface-hover)]"
                title="新建文件夹"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </button>
              <button
                type="button"
                onClick={() => onCreateNote(selectedFolderId ?? undefined)}
                className="w-7 h-7 rounded-xl flex items-center justify-center transition-colors text-ink-ghost hover:text-accent hover:bg-[var(--surface-hover)]"
                title="新建笔记"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <button
              type="button"
              onClick={onSelectAll}
              className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${selectedFolderId === null ? "bg-[var(--surface-active)]/80 text-accent" : "text-ink-soft hover:bg-[var(--surface-hover)]/80 hover:text-accent"}`}
            >
              <span className="truncate">全部笔记</span>
              <span className="ml-auto text-[11px] opacity-70">{allNotes.length}</span>
            </button>

            <div className="space-y-0.5 pt-1">
              {folderTree.map((node) => (
                <FolderItem
                  key={node.id}
                  node={node}
                  depth={0}
                  activeFolderId={selectedFolderId}
                  selectedNoteId={selectedId}
                  renamingFolderId={renamingFolderId}
                  expandedFolderIds={expandedFolderIds}
                  onSelectFolder={onFolderSelect}
                  onSelectNote={onSelectNote}
                  onRename={onFolderRename}
                  onRenameEnd={() => setRenamingFolderId(null)}
                  onDelete={onFolderDelete}
                  onCreateSub={(parentId) => onFolderCreate("新建子文件夹", parentId)}
                  onDrop={onMoveToFolder}
                  onContextMenu={handleFolderContextMenu}
                  onToggleExpand={toggleExpandedFolder}
                />
              ))}

              {uncategorizedNotes.length > 0 && (
                <div className="pt-2">
                  <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-ghost/75">
                    未分类
                  </div>
                  {uncategorizedNotes.map((note) => {
                    const isActiveNote = selectedId === note.id;
                    return (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => onSelectNote(note)}
                        className={`flex w-full items-center gap-2 rounded px-3 py-1.5 text-left transition-colors ${isActiveNote ? "bg-[var(--surface-active)] text-accent" : "text-ink-soft hover:bg-paper-warm"}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" />
                        <span className={`min-w-0 flex-1 truncate text-[11px] leading-5 ${isActiveNote ? "font-medium" : ""}`}>
                          {note.title || note.content.split("\n")[0] || "无标题笔记"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 pb-3 pt-2 shrink-0 border-t border-[var(--border-soft)]/70 bg-[var(--surface-panel)]/92">
        <button type="button" onClick={handleImport}
          className="w-full h-10 rounded-[18px] bg-[var(--surface-content)]/65 border border-[var(--border-soft)]/75 text-xs text-ink-soft hover:border-accent/25 hover:text-accent hover:bg-[var(--surface-hover)]/80 transition-colors flex items-center px-3 gap-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          导入笔记
        </button>
      </div>

      {folderMenuPos && folderMenuNode && (
        <ContextMenu x={folderMenuPos.x} y={folderMenuPos.y} items={getFolderMenuItems()} onClose={closeFolderMenu} />
      )}

      {exportNotice && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none">
          <div className="min-w-[220px] rounded-2xl border border-paper-deep bg-cloud/95 px-5 py-4 shadow-xl animate-view-fade flex items-center gap-3">
            {exportNotice.status === "loading" ? (
              <span className="w-5 h-5 rounded-full border-2 border-paper-deep border-t-accent animate-spin" />
            ) : (
              <span className="w-5 h-5 rounded-full bg-accent-mist text-accent flex items-center justify-center">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              </span>
            )}
            <div>
              <p className="text-xs font-medium text-ink-soft">{exportNotice.status === "loading" ? "导出中" : "导出成功"}</p>
              <p className="text-[11px] text-ink-ghost mt-0.5">{exportNotice.message}</p>
            </div>
          </div>
        </div>
      )}

      {folderConfirm && (
        <ConfirmDialog
          title={folderConfirm.title}
          message={folderConfirm.message}
          danger={Boolean(folderConfirm.danger)}
          confirmLabel={folderConfirm.confirmLabel ?? "确定"}
          onConfirm={folderConfirm.onConfirm}
          onCancel={() => setFolderConfirm(null)}
        />
      )}

      {folderInfoNode && (
        <FolderInfoDialog node={folderInfoNode} folders={folders} onClose={() => setFolderInfoNode(null)} />
      )}
    </div>
  );
}