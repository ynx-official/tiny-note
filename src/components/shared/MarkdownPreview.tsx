import { memo, useState, useCallback, useEffect, useMemo } from "react";
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
}

function transformMarkdownUrl(url: string) {
  if (url.startsWith("kova-asset://")) return url;
  return url;
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

export const MarkdownPreview = memo(function MarkdownPreview({ content }: MarkdownPreviewProps) {
  if (!content.trim()) {
    return <p className="text-ink-ghost leading-[1.9]">暂无内容</p>;
  }

  const components = useMemo(() => ({
    pre({ children }: { children?: React.ReactNode }) {
      const codeChild = Array.isArray(children) ? children.find((c: React.ReactNode) => c && (c as React.ReactElement).type === "code") as React.ReactElement | undefined : undefined;
      const codeText = (codeChild?.props as any)?.children?.[0] ?? (typeof children === "string" ? children : "");
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
  }), []);

  return (
    <div className="markdown-body">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        urlTransform={transformMarkdownUrl}
        components={components}
      >
        {content}
      </Markdown>
    </div>
  );
});
