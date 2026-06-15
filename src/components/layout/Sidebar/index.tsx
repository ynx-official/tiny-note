import { useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { db } from "../../../lib/db";
import type { Folder, Note } from "../../../lib/db";
import { buildSearchExcerpt, buildSidebarFolderTree, matchesNoteSearch, normalizeSearchKeyword, resolveRecentNotes } from "../../../lib/noteNavigation";
import { SearchBar } from "../../shared/SearchBar";
import { ContextMenu, type ContextMenuItem } from "../../dialog/ContextMenu";
import { ConfirmDialog } from "../../dialog/ConfirmDialog";
import { FolderPicker } from "../../dialog/FolderPicker";
import { NoteProperties } from "../../dialog/NoteProperties";
import { FolderItem } from "./FolderItem";
import { FolderInfoDialog } from "./FolderInfoDialog";
import { applySidebarSelection, resolveSidebarDeletionIds, type SidebarSelectionState } from "./selection";
import type { FolderNode } from "./types";
import type { AIContextAttachment } from "../AIChatPanel/types";

const EXPANDED_FOLDERS_STORAGE_KEY = "fp-sidebar-expanded-folders";
const SEARCH_HISTORY_STORAGE_KEY = "fp-sidebar-search-history";
const SEARCH_HISTORY_VISIBLE_LIMIT = 5;
const SEARCH_HISTORY_MAX = 20;
const SEARCH_LATEST_VISIBLE_LIMIT = 8;
const SEARCH_RESULT_VISIBLE_LIMIT = 50;
const escapeSelector = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const EMPTY_SIDEBAR_SELECTION: SidebarSelectionState = {
  kind: null,
  ids: new Set(),
  anchorId: null,
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const renderHighlightedText = (text: string, keyword: string) => {
  if (!keyword) return text;
  const matcher = new RegExp(`(${escapeRegExp(keyword)})`, "ig");
  const segments = text.split(matcher).filter(Boolean);
  const normalizedKeyword = normalizeSearchKeyword(keyword);

  return segments.map((segment, index) => (
    normalizeSearchKeyword(segment) === normalizedKeyword
      ? <mark key={`${segment}-${index}`} className="rounded-sm bg-accent/12 px-0.5 font-medium text-accent">{segment}</mark>
      : <span key={`${segment}-${index}`}>{segment}</span>
  ));
};

interface SidebarProps {
  search: string;
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
  onFolderCreate: (name: string, parentId?: string) => Promise<Folder>;
  onFolderRename: (id: string, name: string) => void;
  onFolderDelete: (id: string) => Promise<void>;
  onFolderDeleteMany: (ids: string[]) => Promise<void>;
  onMoveToFolder: (noteId: string, folderId: string | null) => void;
  onDeleteNote: (noteId: string) => Promise<void>;
  onDeleteNotes: (noteIds: string[]) => Promise<void>;
  onAddToAIContext: (attachments: AIContextAttachment[]) => void;
  onAddToNewAIContext: (attachments: AIContextAttachment[]) => void;
}

export function Sidebar({
  search,
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
  onFolderDeleteMany,
  onMoveToFolder,
  onDeleteNote,
  onDeleteNotes,
  onAddToAIContext,
  onAddToNewAIContext,
}: SidebarProps) {
  const searchKeyword = normalizeSearchKeyword(search);
  const isSearchFiltering = searchKeyword.length > 0;
  const folderTree = useMemo(() => buildSidebarFolderTree(folders, allNotes, search), [folders, allNotes, search]);
  const [folderMenuPos, setFolderMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [folderMenuNode, setFolderMenuNode] = useState<FolderNode | null>(null);
  const [folderConfirm, setFolderConfirm] = useState<{ title: string; message: string; onConfirm: () => void | Promise<void>; danger?: boolean; confirmLabel?: string } | null>(null);
  const [noteMenuPos, setNoteMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [noteMenuNote, setNoteMenuNote] = useState<Note | null>(null);
  const [noteProperties, setNoteProperties] = useState<Note | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [moveNoteId, setMoveNoteId] = useState<string | null>(null);
  const [pdfExportState, setPdfExportState] = useState<{
    noteId: string;
    watermarkEnabled: boolean;
    watermark: string;
    watermarkOpacity: number;
  } | null>(null);
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
  const [sidebarSelection, setSidebarSelection] = useState<SidebarSelectionState>(EMPTY_SIDEBAR_SELECTION);
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string").slice(0, SEARCH_HISTORY_MAX)
        : [];
    } catch {
      return [];
    }
  });
  const exportNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navScrollRef = useRef<HTMLDivElement | null>(null);
  const searchPanelRef = useRef<HTMLDivElement | null>(null);

  const uncategorizedNotes = useMemo(
    () => allNotes
      .filter((note) => !note.folder_id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [allNotes],
  );

  const latestNotes = useMemo(
    () => resolveRecentNotes(allNotes, SEARCH_LATEST_VISIBLE_LIMIT),
    [allNotes],
  );

  const searchResults = useMemo(
    () => isSearchFiltering
      ? resolveRecentNotes(allNotes.filter((note) => matchesNoteSearch(note, searchKeyword)), SEARCH_RESULT_VISIBLE_LIMIT)
      : [],
    [allNotes, isSearchFiltering, searchKeyword],
  );

  const folderNameById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder.name])),
    [folders],
  );

  const visibleSearchHistory = useMemo(
    () => searchHistory.slice(0, SEARCH_HISTORY_VISIBLE_LIMIT),
    [searchHistory],
  );

  const isSearchPanelVisible = isSearchPanelOpen || isSearchFiltering;

  const effectiveExpandedFolderIds = useMemo(() => {
    if (!isSearchFiltering) return expandedFolderIds;
    const next = new Set<string>();
    const walk = (nodes: FolderNode[]) => {
      for (const node of nodes) {
        next.add(node.id);
        if (node.children.length > 0) {
          walk(node.children);
        }
      }
    };
    walk(folderTree as FolderNode[]);
    return next;
  }, [expandedFolderIds, folderTree, isSearchFiltering]);

  const visibleFolderIds = useMemo(() => {
    const ids: string[] = [];
    const walk = (nodes: FolderNode[]) => {
      for (const node of nodes) {
        ids.push(node.id);
        if (effectiveExpandedFolderIds.has(node.id)) {
          walk(node.children);
        }
      }
    };
    walk(folderTree as FolderNode[]);
    return ids;
  }, [effectiveExpandedFolderIds, folderTree]);

  const visibleNoteIds = useMemo(() => {
    const ids: string[] = [];
    const walk = (nodes: FolderNode[]) => {
      for (const node of nodes) {
        if (!effectiveExpandedFolderIds.has(node.id)) continue;
        for (const note of node.notes) {
          ids.push(note.id);
        }
        walk(node.children);
      }
    };
    walk(folderTree as FolderNode[]);
    for (const note of uncategorizedNotes) {
      ids.push(note.id);
    }
    return ids;
  }, [effectiveExpandedFolderIds, folderTree, uncategorizedNotes]);

  const selectedSidebarFolderIds = useMemo(
    () => sidebarSelection.kind === "folder" ? sidebarSelection.ids : new Set<string>(),
    [sidebarSelection],
  );

  const selectedSidebarNoteIds = useMemo(
    () => sidebarSelection.kind === "note" ? sidebarSelection.ids : new Set<string>(),
    [sidebarSelection],
  );

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
    localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(searchHistory));
  }, [searchHistory]);

  useEffect(() => {
    if (!isSearchPanelOpen || isSearchFiltering) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (searchPanelRef.current?.contains(event.target as Node)) return;
      setIsSearchPanelOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsSearchPanelOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSearchFiltering, isSearchPanelOpen]);

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

  useEffect(() => {
    if (!selectedId) return;
    const scrollRoot = navScrollRef.current;
    if (!scrollRoot) return;

    let attempts = 0;
    let cancelled = false;

    const revealSelectedNote = () => {
      if (cancelled) return;
      const noteElement = scrollRoot.querySelector<HTMLElement>(`[data-sidebar-note-id="${escapeSelector(selectedId)}"]`);
      if (noteElement) {
        noteElement.scrollIntoView({ block: "nearest" });
        return;
      }
      if (attempts >= 6) return;
      attempts += 1;
      requestAnimationFrame(revealSelectedNote);
    };

    requestAnimationFrame(revealSelectedNote);
    return () => {
      cancelled = true;
    };
  }, [effectiveExpandedFolderIds, selectedId]);

  const handleSearchFocus = () => {
    setIsSearchPanelOpen(true);
  };

  const handleSearchClose = () => {
    setIsSearchPanelOpen(false);
    onSearchChange("");
    onSearchCommit("");
  };

  const handleSearchCommit = (value: string) => {
    const trimmed = value.trim();
    onSearchCommit(value);

    if (!trimmed) return;

    setSearchHistory((prev) => {
      const deduped = prev.filter((item) => normalizeSearchKeyword(item) !== normalizeSearchKeyword(trimmed));
      return [trimmed, ...deduped].slice(0, SEARCH_HISTORY_MAX);
    });
  };

  const handleSearchHistorySelect = (keyword: string) => {
    setIsSearchPanelOpen(true);
    onSearchChange(keyword);
    handleSearchCommit(keyword);
  };

  const handleClearSearchHistory = () => {
    setSearchHistory([]);
  };

  const handleOpenSearchNote = (note: Note) => {
    onSelectNote(note);
  };

  const handleFolderContextMenu = (e: React.MouseEvent, node: FolderNode) => {
    setFolderMenuPos({ x: e.clientX, y: e.clientY });
    setFolderMenuNode(node);
  };

  const closeFolderMenu = () => {
    setFolderMenuPos(null);
    setFolderMenuNode(null);
  };

  const handleNoteContextMenu = (event: React.MouseEvent, note: Note) => {
    event.preventDefault();
    setNoteMenuPos({ x: event.clientX, y: event.clientY });
    setNoteMenuNote(note);
  };

  const closeNoteMenu = () => {
    setNoteMenuPos(null);
    setNoteMenuNote(null);
  };

  const handleSidebarFolderSelect = (event: React.MouseEvent, folderId: string) => {
    const additive = event.metaKey || event.ctrlKey;
    const range = event.shiftKey;

    setSidebarSelection((prev) => applySidebarSelection({
      selection: prev,
      clickedId: folderId,
      clickedKind: "folder",
      visibleIds: visibleFolderIds,
      additive,
      range,
    }));

    if (additive || range) return;
    onFolderSelect(folderId);
  };

  const handleSidebarNoteSelect = (event: React.MouseEvent, note: Note) => {
    const additive = event.metaKey || event.ctrlKey;
    const range = event.shiftKey;

    setSidebarSelection((prev) => applySidebarSelection({
      selection: prev,
      clickedId: note.id,
      clickedKind: "note",
      visibleIds: visibleNoteIds,
      additive,
      range,
    }));

    if (additive || range) return;
    onSelectNote(note);
  };

  const getSidebarDeleteIds = (clickedId: string, clickedKind: "folder" | "note") => resolveSidebarDeletionIds({
    selection: sidebarSelection,
    clickedId,
    clickedKind,
  });

  const handleFolderDeleteRequest = (folderId: string, folderName: string) => {
    const deleteIds = getSidebarDeleteIds(folderId, "folder");
    const folderCount = deleteIds.length;

    setFolderConfirm({
      title: "删除文件夹",
      message: folderCount > 1
        ? `确定删除选中的 ${folderCount} 个文件夹吗？其中的笔记将回到全部笔记列表中。`
        : `确定删除「${folderName}」吗？其中的笔记将回到全部笔记列表中。`,
      danger: true,
      confirmLabel: "删除",
      onConfirm: async () => {
        if (folderCount > 1) {
          await onFolderDeleteMany(deleteIds);
        } else {
          await onFolderDelete(folderId);
        }
        setSidebarSelection(EMPTY_SIDEBAR_SELECTION);
        setFolderConfirm(null);
      },
    });
  };

  const handleNoteDeleteRequest = (note: Note) => {
    const deleteIds = getSidebarDeleteIds(note.id, "note");
    const noteCount = deleteIds.length;
    const noteTitle = note.title || note.content.split("\n")[0] || "无标题笔记";

    setFolderConfirm({
      title: "确认删除",
      message: noteCount > 1
        ? `确定删除选中的 ${noteCount} 条笔记吗？`
        : `确定删除「${noteTitle}」吗？`,
      danger: true,
      confirmLabel: "删除",
      onConfirm: async () => {
        if (noteCount > 1) {
          await onDeleteNotes(deleteIds);
        } else {
          await onDeleteNote(note.id);
        }
        setSidebarSelection(EMPTY_SIDEBAR_SELECTION);
        setFolderConfirm(null);
      },
    });
  };

  const handleSidebarFolderCreate = async (baseName: string, parentId?: string) => {
    if (parentId) {
      setExpandedFolderIds((prev) => new Set([...prev, parentId]));
    }
    const folder = await onFolderCreate(baseName, parentId);
    setRenamingFolderId(folder.id);
  };

  const handleDeleteSelected = () => {
    if (!folderMenuNode) return;
    handleFolderDeleteRequest(folderMenuNode.id, folderMenuNode.name);
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

  const buildNoteAttachment = (note: Note): AIContextAttachment[] => [{
    type: "note",
    id: note.id,
    title: note.title || note.content.split("\n")[0] || "无标题笔记",
    folderId: note.folder_id,
  }];

  const handleMoveNote = (note: Note) => {
    setMoveNoteId(note.id);
    setShowFolderPicker(true);
  };

  const handleNoteFolderPick = (folderId: string) => {
    if (!moveNoteId) return;
    const folderName = folderId ? folders.find((folder) => folder.id === folderId)?.name ?? "目标文件夹" : "未分类";
    setFolderConfirm({
      title: "移动笔记",
      message: `确定移动到「${folderName}」吗？`,
      confirmLabel: "移动",
      onConfirm: () => {
        onMoveToFolder(moveNoteId, folderId || null);
        setMoveNoteId(null);
        setShowFolderPicker(false);
        setFolderConfirm(null);
      },
    });
  };

  const handleExportNote = async (note: Note, format: "md" | "html" | "txt" = "md") => {
    const destDir = await open({ directory: true });
    if (!destDir) return;
    const exportFn = format === "html" ? db.exportNoteHtml : format === "txt" ? db.exportNoteTxt : db.exportNote;
    showExportNotice("loading", "正在导出笔记...");
    try {
      await exportFn(note.id, destDir as string);
      showExportNotice("success", "笔记已导出");
      db.openPath(destDir as string).catch(console.error);
    } catch (error) {
      console.error(error);
      setFolderConfirm({
        title: "导出失败",
        message: error instanceof Error ? error.message : "导出失败",
        onConfirm: () => setFolderConfirm(null),
      });
    }
  };

  const handleExportNotePdf = async () => {
    if (!pdfExportState) return;
    const destDir = await open({ directory: true });
    if (!destDir) return;
    const watermark = pdfExportState.watermarkEnabled ? pdfExportState.watermark.trim() : "";
    const opacity = pdfExportState.watermarkEnabled ? pdfExportState.watermarkOpacity : 0.16;
    showExportNotice("loading", "正在导出 PDF...");
    try {
      await db.exportNotePdf(pdfExportState.noteId, destDir as string, watermark, opacity);
      setPdfExportState(null);
      showExportNotice("success", "PDF 已导出");
      db.openPath(destDir as string).catch(console.error);
    } catch (error) {
      console.error(error);
      setFolderConfirm({
        title: "导出失败",
        message: error instanceof Error ? error.message : "PDF 导出失败",
        onConfirm: () => setFolderConfirm(null),
      });
    }
  };

  const getNoteMenuItems = (): ContextMenuItem[] => {
    if (!noteMenuNote) return [];
    return [
      {
        label: "添加到当前 AI 对话",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v6M9 10h6"/></svg>,
        onClick: () => onAddToAIContext(buildNoteAttachment(noteMenuNote)),
      },
      {
        label: "添加到新建 AI 对话",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v6M9 10h6"/></svg>,
        onClick: () => onAddToNewAIContext(buildNoteAttachment(noteMenuNote)),
      },
      {
        label: "查看详情",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>,
        onClick: () => setNoteProperties(noteMenuNote),
      },
      {
        label: "复制标题",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>,
        onClick: () => { void navigator.clipboard.writeText(noteMenuNote.title || noteMenuNote.content.split("\n")[0] || "无标题笔记"); },
      },
      {
        label: "移动到文件夹",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
        onClick: () => handleMoveNote(noteMenuNote),
      },
      {
        label: "导出 Markdown",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
        onClick: () => void handleExportNote(noteMenuNote, "md"),
      },
      {
        label: "导出 HTML",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>,
        onClick: () => void handleExportNote(noteMenuNote, "html"),
      },
      {
        label: "导出 TXT",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
        onClick: () => void handleExportNote(noteMenuNote, "txt"),
      },
      {
        label: "导出 PDF",
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M9 13h1.5a1.5 1.5 0 0 1 0 3H9v-6h1.5a1.5 1.5 0 0 1 0 3H9" /><path d="M14 10h2a2 2 0 0 1 0 4h-2v2" /></svg>,
        onClick: () => setPdfExportState({ noteId: noteMenuNote.id, watermarkEnabled: false, watermark: "", watermarkOpacity: 0.16 }),
      },
      {
        label: "删除",
        danger: true,
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
        onClick: () => handleNoteDeleteRequest(noteMenuNote),
      },
    ];
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
        onClick: () => handleSidebarFolderCreate("新建子文件夹", folderMenuNode.id),
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

  return (
    <div ref={searchPanelRef} className="h-full flex flex-col bg-[var(--surface-panel)]/98">
      <div className="px-3 pt-3 pb-2 shrink-0 border-b border-[var(--border-soft)]/70 bg-[var(--surface-panel)]/92">
        <SearchBar
          value={search}
          isActive={isSearchPanelVisible}
          onFocus={handleSearchFocus}
          onChange={onSearchChange}
          onClear={() => {
            onSearchChange("");
            onSearchCommit("");
          }}
          onClose={handleSearchClose}
          onCommit={handleSearchCommit}
        />
      </div>

      <div ref={navScrollRef} className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable]">
        {isSearchPanelVisible ? (
          <div className="px-3 py-4 space-y-5">
            {!isSearchFiltering ? (
              <>
                <section className="space-y-2.5">
                  <div className="flex items-center justify-between px-1">
                    <div>
                      <div className="text-[11px] font-medium tracking-[0.08em] text-ink-faint">最近搜索</div>
                      <div className="mt-0.5 text-[10px] text-ink-ghost">快速回到最近查过的内容</div>
                    </div>
                    {searchHistory.length > 0 ? (
                      <button
                        type="button"
                        onClick={handleClearSearchHistory}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-ink-ghost transition hover:bg-[var(--surface-hover)] hover:text-ink-soft"
                        title="清空搜索历史"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                  {visibleSearchHistory.length > 0 ? (
                    <div className="rounded-2xl border border-[var(--border-soft)]/65 bg-[var(--surface-content)]/52 p-1.5">
                      <div className="space-y-0.5">
                        {visibleSearchHistory.map((keyword) => (
                          <button
                            key={keyword}
                            type="button"
                            onClick={() => handleSearchHistorySelect(keyword)}
                            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] text-ink-soft transition hover:bg-[var(--surface-hover)]/80 hover:text-accent"
                          >
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="shrink-0 text-ink-ghost">
                              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
                              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                            <span className="truncate">{keyword}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[var(--border-soft)]/75 bg-[var(--surface-content)]/40 px-4 py-4 text-xs leading-6 text-ink-ghost">
                      还没有搜索记录。
                    </div>
                  )}
                </section>

                <section className="space-y-2.5">
                  <div className="px-1">
                    <div className="text-[11px] font-medium tracking-[0.08em] text-ink-faint">最新笔记</div>
                    <div className="mt-0.5 text-[10px] text-ink-ghost">先从最近更新的内容开始看</div>
                  </div>
                  <div className="space-y-2">
                    {latestNotes.map((note) => {
                      const folderName = note.folder_id ? (folderNameById.get(note.folder_id) ?? "未命名文件夹") : "未分类";
                      const noteTitle = note.title || note.content.split("\n")[0] || "无标题笔记";
                      const noteExcerpt = buildSearchExcerpt(note.content || noteTitle, "", 36);
                      const isActiveNote = selectedId === note.id;

                      return (
                        <button
                          key={note.id}
                          type="button"
                          onClick={() => handleOpenSearchNote(note)}
                          className={`w-full rounded-2xl border px-3 py-3 text-left transition ${isActiveNote ? "border-accent/30 bg-[var(--surface-active)]/78 shadow-[0_10px_24px_rgba(86,138,106,0.10)]" : "border-[var(--border-soft)]/65 bg-[var(--surface-content)]/60 hover:border-accent/20 hover:bg-[var(--surface-hover)]/72"}`}
                        >
                          <div className="text-sm font-medium text-ink line-clamp-1">{noteTitle}</div>
                          <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-ink-ghost">{noteExcerpt || "暂无正文预览"}</div>
                          <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-ghost">
                            <span className="truncate">{folderName}</span>
                            <span>·</span>
                            <span>{new Date(note.updated_at).toLocaleDateString("zh-CN")}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              </>
            ) : (
              <section className="space-y-2.5">
                <div className="flex items-end justify-between px-1">
                  <div>
                    <div className="text-[11px] font-medium tracking-[0.08em] text-ink-faint">搜索结果</div>
                    <div className="mt-0.5 text-[10px] text-ink-ghost">标题优先，正文只展示命中附近片段</div>
                  </div>
                  <div className="rounded-full bg-[var(--surface-content)]/75 px-2 py-0.5 text-[10px] text-ink-ghost">
                    {searchResults.length} 条命中
                  </div>
                </div>
                {searchResults.length > 0 ? (
                  <div className="space-y-2">
                    {searchResults.map((note) => {
                      const noteTitle = note.title || note.content.split("\n")[0] || "无标题笔记";
                      const noteExcerpt = buildSearchExcerpt(note.content || noteTitle, searchKeyword, 36);
                      const folderName = note.folder_id ? (folderNameById.get(note.folder_id) ?? "未命名文件夹") : "未分类";
                      const isActiveNote = selectedId === note.id;

                      return (
                        <button
                          key={note.id}
                          type="button"
                          onClick={() => handleOpenSearchNote(note)}
                          className={`w-full rounded-2xl border px-3 py-3 text-left transition ${isActiveNote ? "border-accent/30 bg-[var(--surface-active)]/78 shadow-[0_10px_24px_rgba(86,138,106,0.10)]" : "border-[var(--border-soft)]/65 bg-[var(--surface-content)]/60 hover:border-accent/20 hover:bg-[var(--surface-hover)]/72"}`}
                        >
                          <div className="text-sm font-medium text-ink line-clamp-1">{renderHighlightedText(noteTitle, searchKeyword)}</div>
                          <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-ink-ghost">{renderHighlightedText(noteExcerpt || "标题命中，正文暂无可预览片段", searchKeyword)}</div>
                          <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-ghost">
                            <span className="truncate">{folderName}</span>
                            <span>·</span>
                            <span>{new Date(note.updated_at).toLocaleDateString("zh-CN")}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-[var(--border-soft)]/75 bg-[var(--surface-content)]/40 px-4 py-7 text-center text-xs leading-6 text-ink-ghost">
                    没有找到和“{search.trim()}”相关的笔记。
                  </div>
                )}
              </section>
            )}
          </div>
        ) : (
          <div className="px-3 py-3">
            <div className="space-y-1">
              <div className="sticky top-0 z-10 -mx-1 px-1 py-1 bg-[var(--surface-panel)]/96 backdrop-blur supports-[backdrop-filter]:bg-[var(--surface-panel)]/88">
                <div className={`flex items-center gap-1 rounded-xl px-1 py-1 transition-colors ${selectedFolderId === null && !selectedId ? "bg-[var(--surface-active)]/80 text-accent" : "text-ink-soft hover:bg-[var(--surface-hover)]/80 hover:text-accent"}`}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      navScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                      onSelectAll();
                    }}
                    className="flex min-w-0 flex-1 items-center px-2 py-1.5 text-left text-sm font-medium"
                  >
                    <span className="truncate">全部笔记</span>
                    <span className="ml-auto text-[11px] opacity-70">{allNotes.length}</span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleSidebarFolderCreate("新建文件夹");
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-black/5"
                      title="新建文件夹"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                    </button>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={(event) => {
                        event.stopPropagation();
                        onCreateNote(undefined);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-black/5"
                      title="新建笔记"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-0.5 pt-1">
                {folderTree.map((node) => (
                  <FolderItem
                    key={node.id}
                    node={node}
                    depth={0}
                    activeFolderId={selectedFolderId}
                    selectedNoteId={selectedId}
                    selectedFolderIds={selectedSidebarFolderIds}
                    selectedNoteIds={selectedSidebarNoteIds}
                    renamingFolderId={renamingFolderId}
                    expandedFolderIds={effectiveExpandedFolderIds}
                    onSelectFolder={handleSidebarFolderSelect}
                    onSelectNote={handleSidebarNoteSelect}
                    onRename={onFolderRename}
                    onRenameEnd={() => setRenamingFolderId(null)}
                    onDelete={(folderId) => {
                  const targetFolder = folders.find((folder) => folder.id === folderId);
                  handleFolderDeleteRequest(folderId, targetFolder?.name ?? "未命名文件夹");
                }}
                    onCreateSub={(parentId) => {
                      void handleSidebarFolderCreate("新建子文件夹", parentId);
                    }}
                    onDrop={onMoveToFolder}
                    onContextMenu={handleFolderContextMenu}
                    onNoteContextMenu={handleNoteContextMenu}
                    onToggleExpand={toggleExpandedFolder}
                  />
                ))}

                {uncategorizedNotes.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {uncategorizedNotes.map((note) => {
                      const isActiveNote = selectedId === note.id;
                      const isSelectedNote = selectedSidebarNoteIds.has(note.id);
                      return (
                        <button
                          key={note.id}
                          type="button"
                          data-sidebar-note-id={note.id}
                          onClick={(event) => handleSidebarNoteSelect(event, note)}
                          onContextMenu={(event) => handleNoteContextMenu(event, note)}
                          className={`flex w-full items-center gap-2 rounded px-3 py-1.5 text-left transition-colors ${isActiveNote ? "bg-[var(--surface-active)] text-accent" : isSelectedNote ? "bg-[var(--surface-active)]/55 text-accent" : "text-ink-soft hover:bg-paper-warm"}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" />
                          <span className={`min-w-0 flex-1 truncate text-[11px] leading-5 ${isActiveNote || isSelectedNote ? "font-medium" : ""}`}>
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
        )}
      </div>

      {folderMenuPos && folderMenuNode && (
        <ContextMenu x={folderMenuPos.x} y={folderMenuPos.y} items={getFolderMenuItems()} onClose={closeFolderMenu} />
      )}

      {noteMenuPos && noteMenuNote && (
        <ContextMenu x={noteMenuPos.x} y={noteMenuPos.y} items={getNoteMenuItems()} onClose={closeNoteMenu} />
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

      {noteProperties && <NoteProperties note={noteProperties} onClose={() => setNoteProperties(null)} />}

      {showFolderPicker && (
        <FolderPicker
          folders={folders}
          onClose={() => {
            setShowFolderPicker(false);
            setMoveNoteId(null);
          }}
          onSelect={handleNoteFolderPick}
        />
      )}

      {pdfExportState && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20" onClick={() => setPdfExportState(null)}>
          <div className="bg-cloud rounded-xl border border-paper-deep shadow-xl w-[340px] animate-view-fade" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center h-10 px-4 border-b border-paper-deep/25">
              <h3 className="text-[13px] font-medium text-ink-soft">导出 PDF</h3>
            </div>
            <div className="px-4 py-4 space-y-3">
              <label className="flex items-center justify-between h-8 rounded-lg bg-paper-warm/45 border border-paper-deep/25 px-3">
                <span className="text-xs text-ink-soft">启用水印</span>
                <input
                  type="checkbox"
                  checked={pdfExportState.watermarkEnabled}
                  onChange={(e) => setPdfExportState((prev) => prev ? { ...prev, watermarkEnabled: e.target.checked } : null)}
                />
              </label>
              {pdfExportState.watermarkEnabled && (
                <>
                  <input
                    type="text"
                    value={pdfExportState.watermark}
                    onChange={(e) => setPdfExportState((prev) => prev ? { ...prev, watermark: e.target.value } : null)}
                    placeholder="输入水印文字"
                    className="w-full h-9 rounded-lg border border-paper-deep/25 bg-paper px-3 text-xs text-ink-soft outline-none focus:border-accent/40"
                  />
                  <label className="block space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-ink-ghost">
                      <span>水印透明度</span>
                      <span>{Math.round(pdfExportState.watermarkOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.05"
                      max="0.4"
                      step="0.01"
                      value={pdfExportState.watermarkOpacity}
                      onChange={(e) => setPdfExportState((prev) => prev ? { ...prev, watermarkOpacity: Number(e.target.value) } : null)}
                      className="w-full"
                    />
                  </label>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 px-4 pb-4">
              <button
                type="button"
                onClick={() => setPdfExportState(null)}
                className="px-3 py-1.5 text-xs text-ink-soft bg-paper-warm/60 border border-paper-deep/30 rounded-lg hover:bg-paper-warm transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleExportNotePdf()}
                className="px-3 py-1.5 text-xs text-white bg-accent rounded-lg hover:opacity-90 transition-colors"
              >
                导出
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}