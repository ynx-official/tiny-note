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
}: NoteCollectionViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col min-w-0 bg-[var(--surface-content)] overflow-hidden">
      <div className="shrink-0 border-b border-[var(--border-soft)] bg-[var(--surface-content)] px-6 pt-6 pb-4">
        <div className="text-[28px] font-semibold tracking-tight text-ink">{title}</div>
        <div className="mt-1 flex items-center gap-2 text-xs text-ink-ghost">
          <span>{notes.length} 条</span>
          {description ? <span>{description}</span> : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="min-h-full rounded-[20px] border border-[var(--border-soft)]/70 bg-[var(--surface-content)]/42">
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
        </div>
      </div>
    </div>
  );
}