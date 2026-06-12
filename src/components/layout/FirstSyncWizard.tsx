interface FirstSyncWizardProps {
  hasCompletedFirstSync: boolean;
  onClose: () => void;
  onSelect: (action: "upload" | "restore" | "merge") => void;
}

const OPTIONS: Array<{
  id: "upload" | "restore" | "merge";
  title: string;
  summary: string;
  risk: string;
  actionLabel: string;
}> = [
  {
    id: "upload",
    title: "以本机为起点",
    summary: "把当前这台设备上的笔记先推到云端，适合首次把本地库接入同步。",
    risk: "适合这台设备的数据最完整时使用。若云端已有旧数据，后续需要再处理重复或冲突。",
    actionLabel: "从本机开始同步",
  },
  {
    id: "restore",
    title: "以云端为起点",
    summary: "先去云端快照里恢复，再让本机接入已有数据。",
    risk: "适合云端才是主版本时使用。本机会先走恢复路径，避免直接覆盖后难以回退。",
    actionLabel: "先恢复云端数据",
  },
  {
    id: "merge",
    title: "手动确认后再合并",
    summary: "先进入冲突处理入口，按笔记逐条判断保留本地、保留云端或手动合并。",
    risk: "适合两边都已有有效数据，但需要更多人工判断。速度慢一些，安全性更高。",
    actionLabel: "进入手动合并",
  },
];

export function FirstSyncWizard({ hasCompletedFirstSync, onClose, onSelect }: FirstSyncWizardProps) {
  return (
    <section className="w-[720px] max-w-[calc(100vw-32px)] rounded-3xl border border-paper-deep/70 bg-paper shadow-2xl overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-paper-deep/50 bg-cloud/40 px-6 py-5">
        <div>
          <h2 className="text-base font-medium text-ink-soft">
            {hasCompletedFirstSync ? "重新选择同步起点" : "首次同步向导"}
          </h2>
          <p className="mt-1 text-xs leading-5 text-ink-ghost max-w-[520px]">
            先决定“谁是第一份可信数据”，再进入同步。这样能把上传、恢复、合并三条路径的风险说清楚，避免一上来就误操作。
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-paper-deep hover:text-ink-soft"
          title="关闭"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      <div className="grid gap-3 px-6 py-6 md:grid-cols-3">
        {OPTIONS.map((option) => (
          <div key={option.id} className="flex min-h-[240px] flex-col rounded-2xl border border-paper-deep/55 bg-paper-warm/35 p-4">
            <div className="text-sm font-medium text-ink-soft">{option.title}</div>
            <p className="mt-2 text-xs leading-5 text-ink-faint">{option.summary}</p>
            <div className="mt-4 rounded-xl border border-accent/15 bg-accent-mist/30 px-3 py-2.5 text-[11px] leading-5 text-ink-ghost">
              {option.risk}
            </div>
            <button
              type="button"
              onClick={() => onSelect(option.id)}
              className={`mt-auto h-9 rounded-xl text-sm transition ${
                option.id === "upload"
                  ? "bg-accent text-white hover:opacity-90"
                  : "border border-paper-deep/60 text-ink-soft hover:border-accent/35 hover:text-accent hover:bg-paper"
              }`}
            >
              {option.actionLabel}
            </button>
          </div>
        ))}
      </div>

      <div className="border-t border-paper-deep/40 bg-paper/50 px-6 py-4 text-[11px] leading-5 text-ink-ghost">
        建议顺序：先确认哪一边更可信，再开始同步；如果两边都已经有数据，优先走“手动确认后再合并”。
      </div>
    </section>
  );
}