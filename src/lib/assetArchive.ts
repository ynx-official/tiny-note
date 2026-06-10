import { db } from "./db";
import { getCloudSession, uploadKovaAsset } from "./cloudApi";

export const CLOUD_ASSET_URL_PREFIX = "https://oss.120120.top";

type ArchiveCache = Map<string, Promise<string>>;

export type ArchivedMarkdown = {
  content: string;
  changed: boolean;
};

export function shouldArchiveImageUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("#")) return false;
  if (/^(data|mailto|tel):/i.test(trimmed)) return false;
  if (trimmed.startsWith(CLOUD_ASSET_URL_PREFIX)) return false;
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith("kova-asset://");
}

function extractMarkdownImageUrls(content: string) {
  const urls = new Set<string>();
  const markdownImagePattern = /!\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g;
  const htmlImagePattern = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;

  for (const match of content.matchAll(markdownImagePattern)) {
    if (match[1] && shouldArchiveImageUrl(match[1])) urls.add(match[1]);
  }
  for (const match of content.matchAll(htmlImagePattern)) {
    if (match[1] && shouldArchiveImageUrl(match[1])) urls.add(match[1]);
  }
  return [...urls];
}

function guessFileName(url: string, contentType?: string | null) {
  const fallbackExt = contentType?.split("/")[1]?.split(";")[0] || "png";
  if (url.startsWith("kova-asset://")) {
    const clean = decodeURIComponent(url.replace("kova-asset://", "").split(/[?#]/)[0] || "image");
    return clean.split(/[\\/]/).pop() || `kova-image.${fallbackExt}`;
  }
  try {
    const pathname = new URL(url).pathname;
    const name = decodeURIComponent(pathname.split("/").pop() || "");
    return name || `kova-image.${fallbackExt}`;
  } catch {
    return `kova-image.${fallbackExt}`;
  }
}

async function loadImageBlob(url: string) {
  if (url.startsWith("kova-asset://")) {
    const [bytes, mime] = await db.readAttachment(url);
    return {
      blob: new Blob([new Uint8Array(bytes)], { type: mime || "application/octet-stream" }),
      fileName: guessFileName(url, mime),
    };
  }

  const [bytes, mime] = await db.downloadRemoteImage(url);
  return {
    blob: new Blob([new Uint8Array(bytes)], { type: mime || "application/octet-stream" }),
    fileName: guessFileName(url, mime),
  };
}

function replaceAllImageUrls(content: string, replacements: Map<string, string>) {
  let next = content;
  for (const [source, target] of replacements) {
    next = next.split(source).join(target);
  }
  return next;
}

export async function uploadImageFileToCloud(file: File) {
  if (!getCloudSession()) return null;
  const uploaded = await uploadKovaAsset(file, file.name || "kova-image.png");
  return uploaded.url;
}

export async function archiveMarkdownImages(content: string, archiveCache: ArchiveCache = new Map()): Promise<ArchivedMarkdown> {
  const urls = extractMarkdownImageUrls(content);
  if (urls.length === 0) return { content, changed: false };

  const replacements = new Map<string, string>();
  for (const url of urls) {
    let archived = archiveCache.get(url);
    if (!archived) {
      archived = (async () => {
        try {
          const { blob, fileName } = await loadImageBlob(url);
          const uploaded = await uploadKovaAsset(blob, fileName);
          return uploaded.url;
        } catch {
          return url;
        }
      })();
      archiveCache.set(url, archived);
    }
    try {
      const nextUrl = await archived;
      if (nextUrl !== url) {
        replacements.set(url, nextUrl);
      }
    } catch {
      // 单张图片失败时保留原地址，避免阻断整篇同步。
    }
  }

  const nextContent = replaceAllImageUrls(content, replacements);
  return { content: nextContent, changed: nextContent !== content };
}