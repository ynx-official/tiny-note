import { memo, useState, useCallback, useEffect, useMemo, createElement, useRef, type RefObject } from "react";
import { db } from "../../lib/db";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";

const assetPreviewPromiseCache = new Map<string, Promise<string>>();
const assetPreviewObjectUrlCache = new Map<string, string>();

function revokeAssetPreviewUrl(assetPath: string) {
  const objectUrl = assetPreviewObjectUrlCache.get(assetPath);
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    assetPreviewObjectUrlCache.delete(assetPath);
  }
  assetPreviewPromiseCache.delete(assetPath);
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    for (const assetPath of assetPreviewObjectUrlCache.keys()) {
      revokeAssetPreviewUrl(assetPath);
    }
  });
  window.addEventListener("kova-attachments-cleaned", (event) => {
    const removed = (event as CustomEvent<string[]>).detail ?? [];
    removed.forEach(revokeAssetPreviewUrl);
  });
}

interface MarkdownPreviewProps {
  content: string;
  showOutline?: boolean;
  scrollContainerRef?: RefObject<HTMLElement | null>;
}

type OutlineItem = {
  id: string;
  text: string;
  level: number;
};

const OUTLINE_JUMP_OFFSET = 16;
const OUTLINE_ACTIVE_OFFSET = 56;
const OUTLINE_SETTLE_DELAYS = [120, 260, 520];

function transformMarkdownUrl(url: string) {
  if (url.startsWith("kova-asset://")) return url;
  return url;
}

function createOutlineId(text: string, usedIds: Map<string, number>) {
  const normalized = Array.from(text.trim().toLowerCase())
    .filter((char) => char >= " ")
    .join("");
  const base = normalized
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";
  const count = usedIds.get(base) ?? 0;
  usedIds.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function extractMarkdownOutline(content: string): OutlineItem[] {
  const usedIds = new Map<string, number>();
  const outline: OutlineItem[] = [];
  const lines = content.split(/\r?\n/);
  let inFence = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;

    const text = match[2].trim();
    if (!text) continue;

    outline.push({
      id: createOutlineId(text, usedIds),
      text,
      level: match[1].length,
    });
  }

  return outline;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button type="button" onClick={handleCopy}
      className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] text-ink-ghost bg-paper-deep/40 hover:text-accent hover:bg-accent-mist/60 transition-colors opacity-0 group-hover/code:opacity-100">
      {copied ? "✓" : "复制"}
    </button>
  );
}

const ImageWithLightbox = memo(function ImageWithLightbox({ src, alt }: { src: string; alt?: string }) {
  const [open, setOpen] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState(src);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      if (!src.startsWith("kova-asset://")) {
        setResolvedSrc(src);
        return;
      }

      let cached = assetPreviewPromiseCache.get(src);
      if (!cached) {
        cached = (async () => {
          const [bytes, mime] = await db.readAttachment(src);
          const objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
          assetPreviewObjectUrlCache.set(src, objectUrl);
          return objectUrl;
        })().catch((error) => {
          assetPreviewPromiseCache.delete(src);
          throw error;
        });
        assetPreviewPromiseCache.set(src, cached);
      }

      try {
        const objectUrl = await cached;
        if (!cancelled) setResolvedSrc(objectUrl);
      } catch {
        if (!cancelled) setResolvedSrc("");
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [src]);

  const handleClose = useCallback(() => setOpen(false), []);

  if (!resolvedSrc) {
    return <span className="text-danger text-sm">图片加载失败</span>;
  }

  return (
    <>
      <img
        src={resolvedSrc}
        alt={alt}
        className="max-w-full rounded cursor-zoom-in"
        onClick={() => setOpen(true)}
      />
      <Lightbox
        open={open}
        close={handleClose}
        slides={[{ src: resolvedSrc }]}
        plugins={[Zoom]}
        zoom={{
          scrollToZoom: true,
          maxZoomPixelRatio: 5,
        }}
        render={{
          buttonPrev: () => null,
          buttonNext: () => null,
        }}
        carousel={{ finite: true }}
        controller={{ closeOnBackdropClick: true }}
      />
    </>
  );
});

export const MarkdownPreview = memo(function MarkdownPreview({ content, showOutline = false, scrollContainerRef }: MarkdownPreviewProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const activeOutlineIdRef = useRef<string | null>(null);
  const pendingJumpIdRef = useRef<string | null>(null);
  const jumpSettleTimerRefs = useRef<Array<ReturnType<typeof window.setTimeout>>>([]);
  const isEmpty = !content.trim();
  const outline = useMemo(() => extractMarkdownOutline(content), [content]);
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(outline[0]?.id ?? null);

  const getScrollContainer = useCallback(() => {
    return scrollContainerRef?.current ?? rootRef.current?.parentElement ?? null;
  }, [scrollContainerRef]);

  const getHeadingOffset = useCallback((heading: HTMLElement, container: HTMLElement) => {
    const content = contentRef.current;
    let offset = 0;
    let node: HTMLElement | null = heading;

    while (node && node !== container) {
      offset += node.offsetTop;
      if (node === content) return offset;
      node = node.offsetParent as HTMLElement | null;
    }

    if (node === container) return offset;

    const containerRect = container.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    return container.scrollTop + headingRect.top - containerRect.top;
  }, []);

  const alignHeadingIntoView = useCallback((heading: HTMLElement, container: HTMLElement, behavior: ScrollBehavior) => {
    const nextTop = Math.max(0, getHeadingOffset(heading, container) - OUTLINE_JUMP_OFFSET);
    container.scrollTo({ top: nextTop, behavior });
  }, [getHeadingOffset]);

  const correctHeadingVisualPosition = useCallback((heading: HTMLElement, container: HTMLElement) => {
    const containerTop = container.getBoundingClientRect().top;
    const headingTop = heading.getBoundingClientRect().top;
    const delta = headingTop - containerTop - OUTLINE_JUMP_OFFSET;
    if (Math.abs(delta) < 1) return;
    container.scrollTo({ top: Math.max(0, container.scrollTop + delta), behavior: "auto" });
  }, []);

  const syncActiveOutline = useCallback(() => {
    const container = getScrollContainer();
    const headings = rootRef.current?.querySelectorAll<HTMLElement>("[data-heading-id]");
    if (!container || !headings?.length) {
      const fallbackId = outline[0]?.id ?? null;
      if (activeOutlineIdRef.current !== fallbackId) {
        activeOutlineIdRef.current = fallbackId;
        setActiveOutlineId(fallbackId);
      }
      return;
    }

    const threshold = container.scrollTop + OUTLINE_ACTIVE_OFFSET;
    const ordered = Array.from(headings);
    const current = ordered.reduce<HTMLElement | null>((matched, heading) => {
      return getHeadingOffset(heading, container) <= threshold ? heading : matched;
    }, null) ?? ordered[0];

    const nextId = current.dataset.headingId ?? outline[0]?.id ?? null;
    if (activeOutlineIdRef.current !== nextId) {
      activeOutlineIdRef.current = nextId;
      setActiveOutlineId(nextId);
    }
  }, [getHeadingOffset, getScrollContainer, outline]);

  const handleOutlineJump = useCallback((id: string) => {
    const container = getScrollContainer();
    const headings = rootRef.current?.querySelectorAll<HTMLElement>("[data-heading-id]");
    const target = Array.from(headings ?? []).find((node) => node.dataset.headingId === id);
    if (activeOutlineIdRef.current !== id) {
      activeOutlineIdRef.current = id;
      setActiveOutlineId(id);
    }
    if (!container || !target) return;

    alignHeadingIntoView(target, container, "smooth");

    for (const timer of jumpSettleTimerRefs.current) window.clearTimeout(timer);
    jumpSettleTimerRefs.current = [];
    for (const delay of OUTLINE_SETTLE_DELAYS) {
      const timer = window.setTimeout(() => {
        if (pendingJumpIdRef.current !== id) return;
        const latestTarget = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-heading-id]") ?? [])
          .find((node) => node.dataset.headingId === id);
        const latestContainer = getScrollContainer();
        if (!latestTarget || !latestContainer) return;
        correctHeadingVisualPosition(latestTarget, latestContainer);
        if (delay === OUTLINE_SETTLE_DELAYS[OUTLINE_SETTLE_DELAYS.length - 1]) {
          pendingJumpIdRef.current = null;
          jumpSettleTimerRefs.current = [];
        }
      }, delay);
      jumpSettleTimerRefs.current.push(timer);
    }
  }, [alignHeadingIntoView, correctHeadingVisualPosition, getScrollContainer]);

  let headingIndex = 0;
  const createHeading = (tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") => {
    return function Heading({ children }: { children?: React.ReactNode }) {
      const item = outline[headingIndex++];
      return createElement(
        tag,
        item?.id ? { id: item.id, "data-heading-id": item.id } : undefined,
        children,
      );
    };
  };

  const components = {
    pre({ children }: { children?: React.ReactNode }) {
      const codeChild = Array.isArray(children)
        ? children.find((c: React.ReactNode) => c && (c as React.ReactElement).type === "code") as React.ReactElement<{ children?: React.ReactNode }> | undefined
        : undefined;
      const codeChildContent = codeChild?.props.children;
      const codeText = typeof codeChildContent === "string"
        ? codeChildContent
        : Array.isArray(codeChildContent) && typeof codeChildContent[0] === "string"
          ? codeChildContent[0]
          : typeof children === "string"
            ? children
            : "";
      return (
        <div className="relative group/code">
          <CopyButton text={typeof codeText === "string" ? codeText : ""} />
          <pre>{children}</pre>
        </div>
      );
    },
    img({ src, alt }: { src?: string; alt?: string }) {
      return <ImageWithLightbox src={src || ""} alt={alt} />;
    },
    h1: createHeading("h1"),
    h2: createHeading("h2"),
    h3: createHeading("h3"),
    h4: createHeading("h4"),
    h5: createHeading("h5"),
    h6: createHeading("h6"),
  };

  const resolvedActiveOutlineId = outline.some((item) => item.id === activeOutlineId)
    ? activeOutlineId
    : (outline[0]?.id ?? null);

  useEffect(() => {
    activeOutlineIdRef.current = resolvedActiveOutlineId;
  }, [resolvedActiveOutlineId]);

  useEffect(() => {
    return () => {
      for (const timer of jumpSettleTimerRefs.current) window.clearTimeout(timer);
      jumpSettleTimerRefs.current = [];
    };
  }, []);

  useEffect(() => {
    if (!showOutline || outline.length === 0) return;
    const container = getScrollContainer();
    if (!container) return;

    syncActiveOutline();
    const handleScroll = () => syncActiveOutline();
    container.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [getScrollContainer, outline, showOutline, syncActiveOutline]);

  if (isEmpty) {
    return <p className="text-ink-ghost leading-[1.9]">暂无内容</p>;
  }

  return (
    <div ref={rootRef} className={showOutline && outline.length > 0 ? "flex items-start gap-8" : undefined}>
      <div ref={contentRef} className="markdown-body relative min-w-0 flex-1">
        <Markdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          urlTransform={transformMarkdownUrl}
          components={components}
        >
          {content}
        </Markdown>
      </div>
      {showOutline && outline.length > 0 && (
        <aside
          data-outline="true"
          className="sticky top-0 w-56 shrink-0 self-start rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)]/72 p-3"
        >
          <div className="mb-2 px-2 text-[11px] font-medium tracking-[0.08em] text-ink-ghost">目录</div>
          <nav className="space-y-1">
            {outline.map((item) => (
              <button
                key={item.id}
                type="button"
                data-outline-item={item.id}
                data-outline-target={`#${item.id}`}
                data-outline-active={resolvedActiveOutlineId === item.id ? "true" : "false"}
                onClick={() => {
                  handleOutlineJump(item.id);
                }}
                className={`block w-full rounded-lg px-2 py-1.5 text-left text-[12px] leading-5 transition-colors ${
                  resolvedActiveOutlineId === item.id
                    ? "bg-[var(--surface-active)] text-accent"
                    : "text-ink-ghost hover:bg-[var(--surface-hover)] hover:text-ink"
                }`}
                style={{ paddingLeft: `${Math.max(8, 8 + (item.level - 1) * 12)}px` }}
              >
                {item.text}
              </button>
            ))}
          </nav>
        </aside>
      )}
    </div>
  );
});
