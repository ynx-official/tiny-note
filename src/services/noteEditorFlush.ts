type FlushEditor = () => Promise<boolean>
let activeEditor: FlushEditor | null = null

export function registerNoteEditorFlush(flush: FlushEditor) {
  activeEditor = flush
  return () => { if (activeEditor === flush) activeEditor = null }
}

export async function flushOpenNoteEditor(): Promise<boolean> {
  return activeEditor ? activeEditor() : true
}
