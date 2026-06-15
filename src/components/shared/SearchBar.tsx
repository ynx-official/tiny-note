interface SearchBarProps {
  value: string;
  isActive?: boolean;
  onChange: (value: string) => void;
  onClear: () => void;
  onCommit: (value: string) => void;
  onFocus?: () => void;
  onClose?: () => void;
}

export function SearchBar({
  value,
  isActive = false,
  onChange,
  onClear,
  onCommit,
  onFocus,
  onClose,
}: SearchBarProps) {
  const keyword = value.trim();
  const isFiltering = keyword.length > 0;
  const showCloseButton = !isFiltering && isActive && onClose;

  return (
    <div className="shrink-0 px-3 pt-3 pb-3 border-b border-[var(--border-soft)] bg-[var(--surface-panel)]/96">
      <div className="px-1 flex items-center justify-between gap-2">
        <div className="flex-1">
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
              onFocus={onFocus}
              onChange={(e) => onChange(e.target.value)}
              onBlur={() => onCommit(value)}
              placeholder="按标题和正文搜索笔记..."
              className={`h-10 w-full rounded-xl border bg-[var(--surface-content)] pl-9 pr-10 text-xs text-ink-soft shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] transition-colors placeholder:text-ink-ghost focus:outline-none ${isActive ? "border-accent/40 ring-2 ring-accent/10" : "border-[var(--border-soft)] focus:border-accent/30"}`}
            />
            {(isFiltering || showCloseButton) ? (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={isFiltering ? onClear : onClose}
                className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-ghost transition hover:bg-[var(--surface-hover)] hover:text-ink-soft"
                title={isFiltering ? "清空搜索" : "关闭搜索"}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
