interface SearchBarProps {
  value: string;
  resultCount: number;
  totalCount: number;
  scopeLabel: string;
  onChange: (value: string) => void;
  onClear: () => void;
  onCommit: (value: string) => void;
}

export function SearchBar({
  value,
  resultCount,
  totalCount,
  scopeLabel,
  onChange,
  onClear,
  onCommit,
}: SearchBarProps) {
  const keyword = value.trim();
  const isFiltering = keyword.length > 0;
  const summaryText = isFiltering
    ? resultCount > 0
      ? `找到 ${resultCount} / ${totalCount} 条 · ${scopeLabel}`
      : `当前范围没有匹配结果 · ${scopeLabel}`
    : `${totalCount} 条 · ${scopeLabel}`;

  return (
    <div className="shrink-0 space-y-3 px-3 pt-3 pb-3 border-b border-[var(--border-soft)] bg-[var(--surface-panel)]/96">
      <div className="px-1 flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium text-ink-soft">快速搜索</p>
          <p className="text-[10px] text-ink-ghost mt-0.5">标题和正文一起筛选</p>
        </div>
        {isFiltering ? (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-full border border-[var(--border-soft)] bg-[var(--surface-content)] px-2.5 py-1 text-[10px] text-ink-ghost transition-colors hover:text-ink-soft hover:border-accent/30"
            title="清空搜索"
          >
            清空
          </button>
        ) : null}
      </div>

      <form
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          onCommit(value);
        }}
      >
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-ghost" width="13" height="13" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onCommit(value)}
          placeholder="按标题和正文搜索笔记..."
          className="h-10 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-content)] pl-9 pr-4 text-xs text-ink-soft shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] transition-colors placeholder:text-ink-ghost focus:border-accent/30 focus:outline-none"
        />
      </form>

      <div className={`rounded-xl border px-3 py-2 text-[10px] leading-4 ${
        isFiltering && resultCount === 0
          ? "border-amber-200/70 bg-amber-50/80 text-amber-700"
          : "border-[var(--border-soft)] bg-[var(--surface-panel-muted)] text-ink-ghost"
      }`}>
        {summaryText}
      </div>
    </div>
  );
}
