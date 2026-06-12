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
    <div className="shrink-0 space-y-2 px-3 pt-3 pb-2">
      <form
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          onCommit(value);
        }}
      >
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-ghost" width="13" height="13" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onCommit(value)}
          placeholder="按标题和正文搜索笔记..."
          className="h-8 w-full rounded-lg border border-paper-deep/25 bg-paper-warm/45 pl-8 pr-16 text-xs text-ink-soft transition-colors placeholder:text-ink-ghost focus-within:border-accent/30 focus:outline-none"
        />
        {isFiltering && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-ghost transition-colors hover:text-ink-soft"
            title="清空搜索"
          >
            清空
          </button>
        )}
      </form>

      <div className="px-1">
        <div className={`rounded-lg border px-2.5 py-1.5 text-[10px] leading-4 ${
          isFiltering && resultCount === 0
            ? "border-amber-200/70 bg-amber-50/80 text-amber-700"
            : "border-paper-deep/30 bg-paper/55 text-ink-ghost"
        }`}>
          {summaryText}
        </div>
      </div>

    </div>
  );
}
