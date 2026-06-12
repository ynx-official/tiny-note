import { useEffect, useState } from "react";
import type { Note } from "../../../lib/db";
import type { FolderNode } from "./types";

interface FolderItemProps {
  node: FolderNode;
  depth: number;
  activeFolderId: string | null;
  selectedNoteId: string | null;
  renamingFolderId: string | null;
  expandedFolderIds: Set<string>;
  onSelectFolder: (folderId: string) => void;
  onSelectNote: (note: Note) => void;
  onRename: (id: string, name: string) => void;
  onRenameEnd: () => void;
  onDelete: (id: string) => void;
  onCreateSub: (parentId: string) => void;
  onDrop: (noteId: string, folderId: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FolderNode) => void;
  onNoteContextMenu: (e: React.MouseEvent, note: Note) => void;
  onToggleExpand: (folderId: string) => void;
}

export function FolderItem({
  node,
  depth,
  activeFolderId,
  selectedNoteId,
  renamingFolderId,
  expandedFolderIds,
  onSelectFolder,
  onSelectNote,
  onRename,
  onRenameEnd,
  onDelete,
  onCreateSub,
  onDrop,
  onContextMenu,
  onNoteContextMenu,
  onToggleExpand,
}: FolderItemProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);
  const [dragOver, setDragOver] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (renamingFolderId === node.id) {
      setEditing(true);
      setEditName(node.name);
    }
  }, [node.id, node.name, renamingFolderId]);

  const expanded = expandedFolderIds.has(node.id);
  const hasChildren = node.children.length > 0 || node.notes.length > 0;
  const isHighlighted = activeFolderId === node.id;

  return (
    <div>
      <div
        className={`group flex items-center rounded transition-colors cursor-pointer ${isHighlighted ? "bg-accent-mist text-accent" : "text-ink-soft hover:bg-paper-warm"} ${dragOver ? "ring-1 ring-accent/50" : ""}`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => {
          onSelectFolder(node.id);
          if (!expanded) onToggleExpand(node.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e, node);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          const noteId = e.dataTransfer.getData("text/note-id");
          if (noteId) onDrop(noteId, node.id);
        }}
      >
        <button
          type="button"
          className="w-4 h-4 flex items-center justify-center shrink-0 text-ink-ghost cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            if (!hasChildren) return;
            onToggleExpand(node.id);
          }}
        >
          {hasChildren ? (
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${expanded ? "rotate-90" : ""}`}><path d="M2 1l4 3-4 3z"/></svg>
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-paper-deep/40" />
          )}
        </button>

        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-1 shrink-0 text-ink-faint">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>

        {editing ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter" && editName.trim()) {
                onRename(node.id, editName.trim());
                setEditing(false);
                onRenameEnd();
              }
              if (e.key === "Escape") {
                setEditName(node.name);
                setEditing(false);
                onRenameEnd();
              }
            }}
            onBlur={() => {
              if (editName.trim() && editName !== node.name) onRename(node.id, editName.trim());
              setEditing(false);
              onRenameEnd();
            }}
            className="flex-1 min-w-0 h-7 px-1.5 text-xs font-medium leading-5 bg-transparent focus:outline-none"
            autoFocus
          />
        ) : (
          <span className="flex-1 min-w-0 px-1.5 py-1.5 text-xs font-medium leading-5 truncate">{node.name}</span>
        )}

        <div className="invisible group-hover:visible flex items-center gap-0.5 pr-1 shrink-0">
          <button type="button" onClick={(e) => { e.stopPropagation(); onCreateSub(node.id); }} title="新建子文件夹"
            className="w-4 h-4 flex items-center justify-center text-ink-faint hover:text-accent transition-colors">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M14 13a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13V5.5A1.5 1.5 0 0 1 3.5 4H6l1.5 2h5A1.5 1.5 0 0 1 14 7.5z"/><path d="M8 7v5M5.5 9.5h5" strokeWidth="1.1"/></svg>
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(true); setEditName(node.name); }} title="重命名"
            className="w-4 h-4 flex items-center justify-center text-ink-faint hover:text-accent transition-colors">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }} title="删除"
            className="w-4 h-4 flex items-center justify-center text-ink-faint hover:text-danger transition-colors">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>

      {expanded && node.notes.map((note) => {
        const isActiveNote = selectedNoteId === note.id;
        return (
          <button
            key={note.id}
            type="button"
            data-sidebar-note-id={note.id}
            onClick={() => onSelectNote(note)}
            onContextMenu={(event) => onNoteContextMenu(event, note)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${isActiveNote ? "bg-[var(--surface-active)] text-accent" : "text-ink-soft hover:bg-paper-warm"}`}
            style={{ paddingLeft: `${(depth + 1) * 12 + 28}px` }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" />
            <span className={`min-w-0 flex-1 truncate text-[11px] leading-5 ${isActiveNote ? "font-medium" : ""}`}>
              {note.title || note.content.split("\n")[0] || "无标题笔记"}
            </span>
          </button>
        );
      })}

      {expanded && node.children.map((child) => (
        <FolderItem
          key={child.id}
          node={child}
          depth={depth + 1}
          activeFolderId={activeFolderId}
          selectedNoteId={selectedNoteId}
          renamingFolderId={renamingFolderId}
          expandedFolderIds={expandedFolderIds}
          onSelectFolder={onSelectFolder}
          onSelectNote={onSelectNote}
          onRename={onRename}
          onRenameEnd={onRenameEnd}
          onDelete={onDelete}
          onCreateSub={onCreateSub}
          onDrop={onDrop}
          onContextMenu={onContextMenu}
          onNoteContextMenu={onNoteContextMenu}
          onToggleExpand={onToggleExpand}
        />
      ))}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setConfirmDelete(false)}>
          <div className="bg-cloud rounded-xl border border-paper-deep shadow-xl p-4 w-[280px] animate-view-fade" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-ink-soft mb-3">确定删除文件夹「{node.name}」吗？其中的笔记将移至全部笔记列表中。</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(false)}
                className="px-3 py-1 text-xs text-ink-soft bg-paper-warm/60 border border-paper-deep/30 rounded-lg hover:bg-paper-warm transition-colors">取消</button>
              <button type="button" onClick={() => { onDelete(node.id); setConfirmDelete(false); }}
                className="px-3 py-1 text-xs text-white bg-danger rounded-lg hover:opacity-90 transition-colors">删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}