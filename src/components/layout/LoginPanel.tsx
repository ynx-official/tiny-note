import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { getCloudSession, loginToCloud } from "../../lib/cloudApi";

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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [session, setSession] = useState(() => getCloudSession());

  useEffect(() => {
    const handler = () => setSession(getCloudSession());
    window.addEventListener("kova-cloud-session-changed", handler);
    return () => window.removeEventListener("kova-cloud-session-changed", handler);
  }, []);

  const selectedTenant = TENANTS.find((item) => item.baseUrl === tenantUrl) ?? TENANTS[0];

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
      setPassword("");
      setMessage({ type: "ok", text: "登录成功，云端 API 已保存" });
    } catch (error) {
      setMessage({ type: "err", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside className="h-full flex flex-col bg-paper border-l border-paper-deep/60 shadow-2xl">
      <div className="h-12 px-4 flex items-center justify-between border-b border-paper-deep/50 shrink-0">
        <div>
          <h2 className="text-sm font-medium text-ink-soft">登录 Kova 云同步</h2>
          <p className="text-[11px] text-ink-ghost mt-0.5">选择租户后使用账号密码登录</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-paper-deep text-ink-faint hover:text-ink-soft transition-colors"
          title="关闭登录"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
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

        {session && (
          <div className="rounded-lg border border-paper-deep/60 bg-cloud/60 px-3 py-2 text-xs text-ink-faint">
            当前 API：<span className="text-ink-soft break-all">{session.apiBaseUrl}</span>
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
    </aside>
  );
}