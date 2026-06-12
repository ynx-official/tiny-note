import { open } from "@tauri-apps/plugin-dialog";
import { db } from "../../../lib/db";

interface DataImportSectionProps {
  onImported?: () => void;
  onMessage: (text: string, type: "ok" | "err") => void;
}

export function DataImportSection({ onImported, onMessage }: DataImportSectionProps) {
  const handleImport = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Markdown/TXT/HTML", extensions: ["md", "txt", "html", "htm"] }],
    });
    if (!selected || Array.isArray(selected)) return;

    try {
      await db.importFile(selected);
      onImported?.();
      onMessage("导入成功", "ok");
    } catch (error) {
      onMessage(String(error), "err");
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void handleImport()}
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-paper-deep/45 text-[12px] text-ink-faint transition-colors hover:bg-accent-mist/50 hover:text-accent"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
        导入笔记
      </button>
      <p className="text-[10px] text-ink-ghost/75">支持 .md .txt .html 文件</p>
    </div>
  );
}