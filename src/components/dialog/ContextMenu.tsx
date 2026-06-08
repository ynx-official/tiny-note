import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const VIEWPORT_PADDING = 8;

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y, maxHeight: window.innerHeight - VIEWPORT_PADDING * 2 });

  useLayoutEffect(() => {
    const updatePosition = () => {
      const menu = ref.current;
      if (!menu) return;

      const { width, height } = menu.getBoundingClientRect();
      const maxLeft = window.innerWidth - width - VIEWPORT_PADDING;
      const maxTop = window.innerHeight - height - VIEWPORT_PADDING;

      setPosition({
        left: Math.max(VIEWPORT_PADDING, Math.min(x, maxLeft)),
        top: Math.max(VIEWPORT_PADDING, Math.min(y, maxTop)),
        maxHeight: window.innerHeight - VIEWPORT_PADDING * 2,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [x, y, items]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 bg-cloud rounded-lg border border-paper-deep shadow-lg py-1 min-w-[140px] overflow-y-auto"
      style={{ top: position.top, left: position.left, maxHeight: position.maxHeight }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          disabled={item.disabled}
          onClick={() => { if (!item.disabled) { item.onClick(); onClose(); } }}
          className={`w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-2.5 ${
            item.disabled ? "text-ink-ghost/40 cursor-not-allowed" :
            item.danger ? "text-danger hover:bg-danger-bg" : "text-ink-soft hover:bg-paper-warm"
          }`}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  );
}
