import type { Folder, Note } from "../../../lib/db";

export interface FolderNode extends Folder {
  children: FolderNode[];
  notes: Note[];
}
