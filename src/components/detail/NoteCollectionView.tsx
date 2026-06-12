import type { Note } from "../../lib/db";
import type { AIContextAttachment } from "../layout/AIChatPanel/types";
import { NoteList } from "../shared/NoteList";

interface NoteCollectionViewProps {
  title: string;
  description?: string;
  notes: Note[];
  selectedId: string | null;
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  onSelectNote: (note: Note) => void;
  onDeselectNote: (noteId: string) => void;
  onDelete: (id: string) => void;
  folders: { id: string; name: string; parent_id: string | null }[];
  onMoveMultipleToFolder: (noteIds: string[], folderId: string | undefined) => void;
  onAddToAIContext: (attachments: AIContextAttachment[]) => void;
  onAddToNewAIContext: (attachments: AIContextAttachment[]) => void;
  onCreateFolder: () => void;
  onCreateNote: () => void;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
}

export function NoteCollectionView({
  title,
  description,
  notes,
  selectedId,
  selectedIds,
  onSelectedIdsChange,
  onSelectNote,
  onDeselectNote,
  onDelete,
  folders,
  onMoveMultipleToFolder,
  onAddToAIContext,
  onAddToNewAIContext,
  onCreateFolder,
  onCreateNote,
  emptyActionLabel,
  onEmptyAction,
}: NoteCollectionViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col min-w-0 bg-[var(--surface-content)] overflow-hidden">
      <div className="shrink-0 border-b border-[var(--border-soft)] bg-[var(--surface-content)] px-6 pt-6 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[28px] font-semibold tracking-tight text-ink">{title}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-ink-ghost">
              <span>{notes.length} 条</span>
              {description ? <span>{description}</span> : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onCreateFolder}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--surface-content)] px-3 text-xs font-medium text-ink-soft transition hover:border-accent/30 hover:text-accent hover:bg-[var(--surface-hover)]"
            >
              新建文件夹
            </button>
            <button
              type="button"
              onClick={onCreateNote}
              className="inline-flex h-9 items-center justify-center rounded-xl bg-accent px-3 text-xs font-medium text-white shadow-[0_10px_24px_rgba(86,138,106,0.22)] transition hover:opacity-95"
            >
              新建笔记
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="min-h-full rounded-[20px] border border-[var(--border-soft)]/70 bg-[var(--surface-content)]/42">
          {notes.length === 0 ? (
            <div className="flex min-h-full flex-col items-center justify-center px-8 py-12 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border-soft)]/70 bg-[var(--surface-content)]/88 text-ink-ghost shadow-[0_10px_24px_rgba(26,26,24,0.06)]">
                <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
                  <rect x="11" y="8" width="26" height="32" rx="5" stroke="currentColor" strokeWidth="2" />
                  <path d="M18 18h12M18 25h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-base font-semibold text-ink">这里还没有笔记</p>
              <p className="mt-2 max-w-[320px] text-xs leading-6 text-ink-ghost">
                {onEmptyAction ? "这个文件夹还是空的，现在可以直接新建第一条笔记。" : "当前范围暂时是空的。你可以稍后再回来查看。"}
              </p>
              {onEmptyAction && emptyActionLabel && (
                <button
                  type="button"
                  onClick={onEmptyAction}
                  className="mt-5 inline-flex h-10 items-center justify-center rounded-full border border-accent/18 bg-accent px-4 text-xs font-medium text-white shadow-[0_10px_24px_rgba(86,138,106,0.22)] transition hover:opacity-95"
                >
                  {emptyActionLabel}
                </button>
              )}
            </div>
          ) : (
            <NoteList
              notes={notes}
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSelectedIdsChange={onSelectedIdsChange}
              onSelect={onSelectNote}
              onDeselect={onDeselectNote}
              onDelete={onDelete}
              folders={folders}
              onMoveMultipleToFolder={onMoveMultipleToFolder}
              onAddToAIContext={onAddToAIContext}
              onAddToNewAIContext={onAddToNewAIContext}
            />
          )}
        </div>
      </div>
    </div>
  );
}