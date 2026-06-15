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
  const showCloseButton = Boolean(isActive && onClose);
  const showActions = isFiltering || showCloseButton;
  const inputRightPadding = isFiltering && showCloseButton ? "pr-[4.6rem]" : isFiltering ? "pr-10" : showCloseButton ? "pr-10" : "pr-10";

  return (
    <div className="shrink-0 px-3 pt-3 pb-3 border-b border-[var(--border-soft)] bg-[var(--surface-panel)]/96">
      <div className="px-1">
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
            placeholder="按标题和正文搜索笔记"
            className={`h-10 w-full rounded-xl border bg-[var(--surface-content)] pl-9 ${inputRightPadding} text-xs text-ink-soft shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] transition-colors placeholder:text-ink-ghost focus:outline-none ${isActive ? "border-accent/40 ring-2 ring-accent/10" : "border-[var(--border-soft)] focus:border-accent/30"}`}
          />
          {showActions ? (
            <div className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5">
              {isFiltering ? (
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={onClear}
                  className="inline-flex h-5 items-center rounded-sm px-0.5 text-[9px] leading-none tracking-tight text-ink-ghost transition-colors hover:text-ink-soft"
                  title="清空搜索"
                >
                  清空
                </button>
              ) : null}
              {showCloseButton ? (
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={onClose}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-ink-ghost transition hover:bg-[var(--surface-hover)] hover:text-ink-soft"
                  title="关闭搜索"
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              ) : null}
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
