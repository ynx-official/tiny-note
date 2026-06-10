import { useEffect, useState } from "react";
import {
  listKovaSyncConflicts,
  resolveKovaSyncConflict,
  type KovaSyncConflict,
} from "../../lib/cloudApi";

type SyncConflictDialogProps = {
  onClose: () => void;
  onResolved?: () => void;
};

type ConflictPayload = Record<string, unknown>;

function parsePayload(raw?: string | null): ConflictPayload {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as ConflictPayload : { value: parsed };
  } catch {
    return { value: raw };
  }
}

function pickTitle(payload: ConflictPayload) {
  return String(payload.title || payload.name || payload.settingKey || payload.id || "未命名对象");
}

function describeConflict(conflict: KovaSyncConflict) {
  const local = parsePayload(conflict.localPayload);
  const server = parsePayload(conflict.serverPayload);
  const labelMap: Record<string, string> = {
    note: "笔记",
    folder: "目录",
    setting: "设置",
    attachment: "附件",
  };
  return {
    entityLabel: labelMap[conflict.entityType] || conflict.entityType,
    localTitle: pickTitle(local),
    serverTitle: pickTitle(server),
    local,
    server,
  };
}

function normalizePayload(payload: ConflictPayload) {
  const hiddenKeys = new Set([
    "id",
    "userId",
    "createBy",
    "updateBy",
    "createTime",
    "updateTime",
    "delFlag",
    "sourceDeviceId",
    "localPayload",
    "serverPayload",
    "content",
  ]);
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !hiddenKeys.has(key)));
}

function PayloadPreview({ payload }: { payload: ConflictPayload }) {
  const normalized = normalizePayload(payload);
  const entries = Object.entries(normalized).slice(0, 8);
  const content = typeof payload.content === "string" ? payload.content : null;

  return (
    <div className="rounded-lg border border-paper-deep/50 bg-paper/60 p-3 text-[11px] text-ink-soft">
      {entries.length > 0 ? (
        <div className="space-y-1">
          {entries.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[88px_1fr] gap-2">
              <span className="text-ink-ghost">{key}</span>
              <span className="min-w-0 truncate">{typeof value === "string" ? value : JSON.stringify(value)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-ink-ghost">无摘要</div>
      )}
      {content ? (
        <div className="mt-2 max-h-20 overflow-hidden whitespace-pre-wrap rounded bg-paper-deep/25 p-2 text-ink-faint">
          {content.slice(0, 280)}{content.length > 280 ? "…" : ""}
        </div>
      ) : null}
    </div>
  );
}

export function SyncConflictDialog({ onClose, onResolved }: SyncConflictDialogProps) {
  const [conflicts, setConflicts] = useState<KovaSyncConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listKovaSyncConflicts("pending");
      setConflicts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "冲突列表加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleResolve = async (id: number | string, status: "resolved" | "ignored") => {
    setBusyId(id);
    setError(null);
    try {
      await resolveKovaSyncConflict(id, status);
      setConflicts((items) => items.filter((item) => item.id !== id));
      onResolved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "冲突处理失败");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 px-4" onMouseDown={onClose}>
      <div
        className="flex max-h-[78vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-paper-deep/70 bg-cloud shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-paper-deep/60 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-ink-soft">同步冲突</h2>
            <p className="mt-1 text-xs text-ink-ghost">先处理 pending 冲突，后续同步才不会一直提示。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xs text-ink-faint hover:bg-paper-deep/60 hover:text-ink-soft"
          >
            关闭
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {error ? (
            <div className="mb-3 rounded-lg border border-danger/20 bg-danger-bg/60 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="py-10 text-center text-sm text-ink-ghost">正在加载冲突…</div>
          ) : conflicts.length === 0 ? (
            <div className="py-10 text-center text-sm text-ink-ghost">暂无待处理冲突</div>
          ) : (
            <div className="space-y-4">
              {conflicts.map((conflict) => {
                const detail = describeConflict(conflict);
                const busy = busyId === conflict.id;
                return (
                  <div key={conflict.id} className="rounded-xl border border-paper-deep/60 bg-paper/35 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-ink-soft">
                          {detail.entityLabel}冲突：{detail.localTitle || detail.serverTitle}
                        </div>
                        <div className="mt-1 text-[11px] text-ink-ghost">
                          base v{conflict.baseVersion ?? "-"} / cloud v{conflict.serverVersion ?? "-"} · {conflict.conflictType || "modified_both"}
                        </div>
                      </div>
                      <span className="rounded-full bg-accent-mist px-2 py-1 text-[11px] text-accent">pending</span>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="mb-1 text-xs font-medium text-ink-faint">本地提交</div>
                        <PayloadPreview payload={detail.local} />
                      </div>
                      <div>
                        <div className="mb-1 text-xs font-medium text-ink-faint">云端当前</div>
                        <PayloadPreview payload={detail.server} />
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleResolve(conflict.id, "ignored")}
                        className="rounded-lg border border-paper-deep/70 px-3 py-1.5 text-xs text-ink-faint hover:bg-paper-deep/50 disabled:opacity-50"
                      >
                        忽略本地冲突
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleResolve(conflict.id, "resolved")}
                        className="rounded-lg bg-accent px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-50"
                      >
                        标记已处理
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}