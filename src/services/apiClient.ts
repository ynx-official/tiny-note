import { invoke as tauriInvoke } from '@tauri-apps/api/core'

const configuredBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim()
export const API_BASE_URL = (configuredBaseUrl || 'http://127.0.0.1:8080').replace(/\/$/, '')
const ACCESS_TOKEN_ACCOUNT = 'access-token'

interface ApiEnvelope<T> { code: number | string; msg: string; data?: T }
export interface LoginToken {
  token: string
  accessToken: string
  tokenType: string
  expiresIn: number
}
export interface AuthUser { userId: number; username: string; nickname: string; avatar: string; email: string; phone: string; status: string }
export interface AuthInfo { user: AuthUser; roles: string[]; perms: string[] }

export class ApiError extends Error {
  constructor(public code: number | string, message: string, public status: number, public details?: unknown) {
    super(message)
    this.name = 'ApiError'
  }
}

let accessToken = ''
let authInfo: AuthInfo | null = null
const authListeners = new Set<() => void>()

function notifyAuth() { for (const listener of authListeners) listener() }
export function subscribeAuth(listener: () => void) { authListeners.add(listener); return () => authListeners.delete(listener) }
export function getAuthSnapshot() { return { authenticated: Boolean(accessToken && authInfo), user: authInfo?.user || null, info: authInfo } }

async function readStoredAccessToken(): Promise<string> {
  if (!window.__TAURI_INTERNALS__) return ''
  try { return await tauriInvoke<string | null>('credential_get', { account: ACCESS_TOKEN_ACCOUNT }) || '' } catch { return '' }
}
async function persistAccessToken(value: string): Promise<boolean> {
  if (!window.__TAURI_INTERNALS__) return false
  try { await tauriInvoke('credential_set', { account: ACCESS_TOKEN_ACCOUNT, secret: value }); return true } catch { return false }
}
async function deleteStoredAccessToken(): Promise<void> {
  if (!window.__TAURI_INTERNALS__) return
  try { await tauriInvoke('credential_delete', { account: ACCESS_TOKEN_ACCOUNT }) } catch { /* secure store unavailable; never fall back to localStorage */ }
}

async function clearSession(): Promise<void> {
  accessToken = ''
  authInfo = null
  await deleteStoredAccessToken()
  notifyAuth()
}

async function decodeEnvelope<T>(response: Response): Promise<T> {
  let body: ApiEnvelope<T> | null = null
  try { body = await response.json() as ApiEnvelope<T> } catch { /* handled below */ }
  if (!response.ok || !body || body.code !== 0) {
    throw new ApiError(body?.code ?? response.status, body?.msg || `请求失败 (${response.status})`, response.status, body)
  }
  return body.data as T
}

async function rawRequest<T>(path: string, init: RequestInit = {}, authenticate = true): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  if (authenticate && accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })
  if (response.status === 401 && authenticate) await clearSession()
  return decodeEnvelope<T>(response)
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })
  if (response.status === 401) await clearSession()
  if (!response.ok) {
    let details: unknown
    try { details = await response.clone().json() } catch { details = undefined }
    const envelope = details as Partial<ApiEnvelope<unknown>> | undefined
    throw new ApiError(envelope?.code ?? response.status, envelope?.msg || `请求失败 (${response.status})`, response.status, details)
  }
  return response
}

export async function apiRequest<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  return rawRequest<T>(path, {
    method: options.method || (options.body === undefined ? 'GET' : 'POST'),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal
  })
}

export async function restoreAuthSession(): Promise<boolean> {
  const stored = await readStoredAccessToken()
  if (!stored) return false
  accessToken = stored
  try { authInfo = await rawRequest<AuthInfo>('/auth/info'); notifyAuth(); return true }
  catch { await clearSession(); return false }
}

export async function login(username: string, password: string, remember: boolean): Promise<{ remembered: boolean }> {
  const token = await rawRequest<LoginToken>('/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  }, false)
  accessToken = token.accessToken || token.token
  const remembered = remember ? await persistAccessToken(accessToken) : false
  if (!remember) await deleteStoredAccessToken()
  authInfo = await rawRequest<AuthInfo>('/auth/info')
  notifyAuth()
  return { remembered }
}

export async function logout(): Promise<void> {
  try { if (accessToken) await rawRequest('/auth/logout', { method: 'POST' }) } catch { /* local logout still proceeds */ }
  await clearSession()
}
