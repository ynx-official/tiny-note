import type { Note } from "./db";

export interface ArticleAIDraft {
  noteId: string;
  title: string;
  content: string;
  folderId: string | null;
}

export function buildArticleAIDraft(
  note: Note,
  draft?: { title?: string; content?: string },
): ArticleAIDraft {
  return {
    noteId: note.id,
    title: draft?.title?.trim() ? draft.title : note.title,
    content: draft?.content?.trim() ? draft.content : note.content,
    folderId: note.folder_id,
  };
}