import { db } from "./db";
import { getCloudSession, uploadKovaAsset } from "./cloudApi";

export const CLOUD_ASSET_URL_PREFIX = "https://oss.120120.top";

type ArchiveCache = Map<string, Promise<string>>;

export type ArchivedMarkdown = {
  content: string;
  changed: boolean;
  reused: number;
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

async function sha256Hex(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
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

export async function archiveMarkdownImages(
  content: string,
  archiveCache: ArchiveCache = new Map(),
  noteId?: string,
): Promise<ArchivedMarkdown> {
  const urls = extractMarkdownImageUrls(content);
  if (urls.length === 0) return { content, changed: false, reused: 0 };

  const attachmentIndex = noteId ? await db.listAttachmentIndex().catch(() => []) : [];
  const reusableCloudUrlBySha = new Map<string, string>(
    attachmentIndex
      .filter((item) => item.sha256 && item.cloud_url && !item.deleted_at)
      .map((item) => [item.sha256 as string, item.cloud_url as string]),
  );

  const replacements = new Map<string, string>();
  let reused = 0;

  for (const url of urls) {
    let archived = archiveCache.get(url);
    if (!archived) {
      archived = (async () => {
        try {
          const { blob, fileName } = await loadImageBlob(url);
          const sha256 = await sha256Hex(blob);
          const reusableCloudUrl = reusableCloudUrlBySha.get(sha256) || null;

          if (reusableCloudUrl) {
            reused += 1;
            if (noteId) {
              await db.upsertAttachmentIndex({
                asset_path: url,
                note_id: noteId,
                file_name: fileName,
                mime_type: blob.type || null,
                file_size: blob.size,
                sha256,
                cloud_url: reusableCloudUrl,
                cloud_file_id: null,
                upload_status: "uploaded",
              });
            }
            return reusableCloudUrl;
          }

          const uploaded = await uploadKovaAsset(blob, fileName);
          if (noteId) {
            await db.upsertAttachmentIndex({
              asset_path: url,
              note_id: noteId,
              file_name: fileName,
              mime_type: blob.type || null,
              file_size: blob.size,
              sha256,
              cloud_url: uploaded.url,
              cloud_file_id: uploaded.fileId == null ? null : String(uploaded.fileId),
              upload_status: "uploaded",
            });
          }
          reusableCloudUrlBySha.set(sha256, uploaded.url);
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
  return { content: nextContent, changed: nextContent !== content, reused };
}