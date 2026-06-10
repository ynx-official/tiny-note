const AUTH_BASIC_TOKEN = "ODU0MDZlNjA0MjA2YzQxMzE0NGYxZmFlYWU4NTQ5YzY6dGlueS1ub3RlYm9vaw==";
const API_BASE_URL_KEY = "kova-cloud-api-base-url";
const API_TOKEN_KEY = "kova-cloud-token";
const API_USER_KEY = "kova-cloud-user";

export type CloudUser = {
  userId?: number | string;
  username?: string | null;
  nickname?: string | null;
  email?: string | null;
  avatar?: string | null;
  avatarUrl?: string | null;
};

export type CloudUserInfo = {
  user?: CloudUser | null;
  roles?: string[];
  permissions?: string[];
};

export type CloudSession = {
  apiBaseUrl: string;
  token: string;
  user?: CloudUser | null;
};

type ApiResult<T> = {
  code: number;
  msg?: string | null;
  data?: T;
};

type LoginResponse = {
  token: string;
};

export function normalizeApiBaseUrl(baseUrl: string) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function readSavedUser(): CloudUser | null {
  const raw = localStorage.getItem(API_USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as CloudUser;
  } catch {
    localStorage.removeItem(API_USER_KEY);
    return null;
  }
}

function resolveCloudAssetUrl(apiBaseUrl: string, url?: string | null) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  return new URL(url.startsWith("/") ? url.slice(1) : url, normalizeApiBaseUrl(apiBaseUrl)).toString();
}

export function getCloudSession(): CloudSession | null {
  const apiBaseUrl = localStorage.getItem(API_BASE_URL_KEY);
  const token = localStorage.getItem(API_TOKEN_KEY);
  if (!apiBaseUrl || !token) return null;
  return { apiBaseUrl, token, user: readSavedUser() };
}

function notifyCloudSessionChanged() {
  window.dispatchEvent(new CustomEvent("kova-cloud-session-changed", { detail: getCloudSession() }));
}

export function saveCloudUser(user: CloudUser | null) {
  if (user) {
    const session = getCloudSession();
    const avatarUrl = session ? resolveCloudAssetUrl(session.apiBaseUrl, user.avatarUrl) : user.avatarUrl ?? null;
    localStorage.setItem(API_USER_KEY, JSON.stringify({ ...user, avatarUrl }));
  } else {
    localStorage.removeItem(API_USER_KEY);
  }
  notifyCloudSessionChanged();
}

export function saveCloudSession(session: CloudSession) {
  localStorage.setItem(API_BASE_URL_KEY, normalizeApiBaseUrl(session.apiBaseUrl));
  localStorage.setItem(API_TOKEN_KEY, session.token);
  if (session.user) {
    const avatarUrl = resolveCloudAssetUrl(session.apiBaseUrl, session.user.avatarUrl);
    localStorage.setItem(API_USER_KEY, JSON.stringify({ ...session.user, avatarUrl }));
  }
  notifyCloudSessionChanged();
}

export function clearCloudSession() {
  localStorage.removeItem(API_BASE_URL_KEY);
  localStorage.removeItem(API_TOKEN_KEY);
  localStorage.removeItem(API_USER_KEY);
  notifyCloudSessionChanged();
}

function resolveApiUrl(apiBaseUrl: string, path: string) {
  const base = normalizeApiBaseUrl(apiBaseUrl);
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `${base}${cleanPath}`;
}

async function readApiResult<T>(response: Response): Promise<T> {
  let parsed: ApiResult<T>;
  try {
    parsed = await response.json();
  } catch {
    throw new Error(response.ok ? "响应内容格式错误" : `请求失败：${response.status}`);
  }

  if (!response.ok) {
    throw new Error(parsed.msg || `请求失败：${response.status}`);
  }
  if (parsed.code !== 0) {
    throw new Error(parsed.msg || "请求失败");
  }
  if (typeof parsed.data === "undefined") {
    throw new Error("响应数据为空");
  }
  return parsed.data;
}

export async function cloudRequest<T>(path: string, init: RequestInit = {}) {
  const session = getCloudSession();
  if (!session) throw new Error("请先登录");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.token}`);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(resolveApiUrl(session.apiBaseUrl, path), {
    ...init,
    headers,
  });
  return readApiResult<T>(response);
}

export async function fetchCurrentUser() {
  const info = await cloudRequest<CloudUserInfo>("/auth/info");
  const user = info.user ?? null;
  saveCloudUser(user);
  return user;
}

export async function logoutFromCloud() {
  try {
    await cloudRequest<string>("/auth/logout", { method: "POST" });
  } finally {
    clearCloudSession();
  }
}

export async function loginToCloud(apiBaseUrl: string, username: string, password: string) {
  const normalizedApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl);
  const response = await fetch(resolveApiUrl(normalizedApiBaseUrl, "/auth/login"), {
    method: "POST",
    headers: {
      "Authorization": `Basic ${AUTH_BASIC_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grantType: "password",
      username,
      password,
    }),
  });

  const data = await readApiResult<LoginResponse>(response);
  if (!data.token) {
    throw new Error("登录响应缺少 token");
  }

  const baseSession = { apiBaseUrl: normalizedApiBaseUrl, token: data.token };
  saveCloudSession(baseSession);

  const user = await fetchCurrentUser();
  return { ...baseSession, user };
}