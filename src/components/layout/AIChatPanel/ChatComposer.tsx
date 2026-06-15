interface ChatComposerProps {
  input: string;
  onInputChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onSend: () => void | Promise<void>;
  onStop: () => void;
  placeholder: string;
  disabled?: boolean;
  sendDisabled?: boolean;
  loading: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  topSlot?: React.ReactNode;
}

export function ChatComposer({
  input,
  onInputChange,
  onKeyDown,
  onSend,
  onStop,
  placeholder,
  disabled = false,
  sendDisabled = false,
  loading,
  inputRef,
  topSlot,
}: ChatComposerProps) {
  return (
    <div className="px-3 pb-3 pt-1 shrink-0">
      {topSlot}
      <div className="flex gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-paper-warm/60 border border-paper-deep/30 rounded-lg px-3 py-2 text-xs text-ink-soft placeholder:text-ink-ghost focus:outline-none focus:border-accent/40 disabled:opacity-50"
          style={{ maxHeight: "80px" }}
        />
        {loading ? (
          <button
            type="button"
            onClick={onStop}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-danger text-white hover:opacity-90 transition-opacity shrink-0"
            title="停止生成"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="3" /></svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void onSend()}
            disabled={sendDisabled}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-30 shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}