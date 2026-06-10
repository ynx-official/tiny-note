import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { fetchCurrentUser, getCloudSession, loginToCloud, logoutFromCloud } from "../../lib/cloudApi";

type TenantOption = {
  label: string;
  baseUrl: string;
};

const TENANTS: TenantOption[] = [
  { label: "tiny-admin-本地", baseUrl: "http://localhost:9091/" },
  { label: "tiny-admin-开发", baseUrl: "https://tiny.mrsunshine.cn/" },
];

interface LoginPanelProps {
  onClose: () => void;
}

export function LoginPanel({ onClose }: LoginPanelProps) {
  const [tenantUrl, setTenantUrl] = useState(() => getCloudSession()?.apiBaseUrl ?? TENANTS[0].baseUrl);
  const [username, setUsername] = useState(() => getCloudSession()?.user?.username ?? "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [session, setSession] = useState(() => getCloudSession());

  useEffect(() => {
    const handler = () => setSession(getCloudSession());
    window.addEventListener("kova-cloud-session-changed", handler);
    return () => window.removeEventListener("kova-cloud-session-changed", handler);
  }, []);

  useEffect(() => {
    if (!session || session.user) return;

    let cancelled = false;
    fetchCurrentUser()
      .then(() => {
        if (!cancelled) setSession(getCloudSession());
      })
      .catch((error) => {
        if (!cancelled) setMessage({ type: "err", text: error instanceof Error ? error.message : String(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  const selectedTenant = TENANTS.find((item) => item.baseUrl === tenantUrl) ?? TENANTS[0];
  const currentUser = session?.user ?? null;
  const displayName = currentUser?.nickname || currentUser?.username || "已登录用户";

  const handleLogout = async () => {
    setLoading(true);
    setMessage(null);
    try {
      await logoutFromCloud();
      setSession(null);
      setPassword("");
      setMessage({ type: "ok", text: "已退出当前云端账号" });
    } catch (error) {
      setMessage({ type: "err", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setMessage({ type: "err", text: "请输入账号和密码" });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const nextSession = await loginToCloud(tenantUrl, username.trim(), password);
      setSession(nextSession);
      setUsername(nextSession.user?.username ?? username.trim());
      setPassword("");
      setMessage({ type: "ok", text: "登录成功，用户信息已同步" });
    } catch (error) {
      setMessage({ type: "err", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="w-[380px] max-w-[calc(100vw-32px)] rounded-2xl border border-paper-deep/70 bg-paper shadow-2xl overflow-hidden">
      <div className="h-13 px-5 flex items-center justify-between border-b border-paper-deep/50 bg-cloud/40">
        <div>
          <h2 className="text-sm font-medium text-ink-soft">Kova 云同步</h2>
          <p className="text-[11px] text-ink-ghost mt-0.5">
            {session ? "当前云端账号" : "登录后开启多设备同步和云备份"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-paper-deep text-ink-faint hover:text-ink-soft transition-colors"
          title="关闭"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      <div className="px-5 py-5">
        {session ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-accent-mist text-accent flex items-center justify-center overflow-hidden border border-accent/20 shadow-sm">
                {currentUser?.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg font-semibold">{displayName.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div className="mt-3 text-base font-medium text-ink-soft max-w-full truncate">{displayName}</div>
              <div className="mt-1 text-xs text-ink-ghost max-w-full truncate">
                {currentUser?.email || currentUser?.username || "云端账号已登录"}
              </div>
            </div>

            <div className="rounded-xl border border-paper-deep/60 bg-cloud/60 px-3 py-2.5 space-y-1.5 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-ink-ghost shrink-0">租户</span>
                <span className="text-ink-soft truncate">{session.apiBaseUrl}</span>
              </div>
              {currentUser?.userId && (
                <div className="flex justify-between gap-3">
                  <span className="text-ink-ghost shrink-0">用户 ID</span>
                  <span className="text-ink-soft truncate">{currentUser.userId}</span>
                </div>
              )}
            </div>

            {message && (
              <div className={`rounded-lg border px-3 py-2 text-xs ${
                message.type === "ok"
                  ? "border-accent/30 bg-accent-mist text-accent"
                  : "border-danger/20 bg-danger-bg text-danger"
              }`}>
                {message.text}
              </div>
            )}

            <button
              type="button"
              onClick={handleLogout}
              disabled={loading}
              className="w-full h-9 rounded-lg border border-paper-deep text-sm text-ink-faint hover:text-danger hover:border-danger/30 hover:bg-danger-bg transition-colors disabled:opacity-60"
            >
              {loading ? "退出中..." : "退出登录"}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs text-ink-faint">租户</span>
              <select
                value={tenantUrl}
                onChange={(event) => {
                  setTenantUrl(event.target.value);
                  setMessage(null);
                }}
                disabled={loading}
                className="w-full h-9 rounded-lg border border-paper-deep bg-cloud px-3 text-sm text-ink-soft outline-none focus:border-accent/70 focus:ring-2 focus:ring-accent/10 disabled:opacity-60"
              >
                {TENANTS.map((tenant) => (
                  <option key={tenant.baseUrl} value={tenant.baseUrl}>{tenant.label}</option>
                ))}
              </select>
              <span className="block text-[11px] text-ink-ghost truncate">{selectedTenant.baseUrl}</span>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs text-ink-faint">账号</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                disabled={loading}
                className="w-full h-9 rounded-lg border border-paper-deep bg-cloud px-3 text-sm text-ink-soft outline-none placeholder:text-ink-ghost focus:border-accent/70 focus:ring-2 focus:ring-accent/10 disabled:opacity-60"
                placeholder="请输入账号"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs text-ink-faint">密码</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={loading}
                className="w-full h-9 rounded-lg border border-paper-deep bg-cloud px-3 text-sm text-ink-soft outline-none placeholder:text-ink-ghost focus:border-accent/70 focus:ring-2 focus:ring-accent/10 disabled:opacity-60"
                placeholder="请输入密码"
              />
            </label>

            {message && (
              <div className={`rounded-lg border px-3 py-2 text-xs ${
                message.type === "ok"
                  ? "border-accent/30 bg-accent-mist text-accent"
                  : "border-danger/20 bg-danger-bg text-danger"
              }`}>
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-9 rounded-lg bg-accent text-white text-sm font-medium shadow-sm hover:opacity-90 active:scale-[0.99] transition disabled:opacity-60 disabled:active:scale-100"
            >
              {loading ? "登录中..." : "登录"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}