import { defineStore } from 'pinia'
import { getAuthSnapshot, login, logout, restoreAuthSession, subscribeAuth, type AuthUser } from '../services/apiClient'

let initialization: Promise<boolean> | null = null
let subscribed = false

export const useAuthStore = defineStore('auth', {
  state: () => ({
    authenticated: false,
    user: null as AuthUser | null,
    initialized: false,
    busy: false,
    error: '',
    secureStorageAvailable: true
  }),
  actions: {
    sync() {
      const snapshot = getAuthSnapshot()
      this.authenticated = snapshot.authenticated
      this.user = snapshot.user
    },
    async initialize() {
      if (this.initialized) return this.authenticated
      if (initialization) return initialization
      if (!subscribed) { subscribeAuth(() => this.sync()); subscribed = true }
      initialization = (async () => {
        this.busy = true
        try { await restoreAuthSession(); this.sync(); return this.authenticated }
        finally { this.initialized = true; this.busy = false; initialization = null }
      })()
      return initialization
    },
    async signIn(username: string, password: string, remember: boolean) {
      this.busy = true; this.error = ''
      try {
        const result = await login(username, password, remember)
        this.secureStorageAvailable = !remember || result.remembered
        this.sync()
        return true
      } catch (error) {
        this.error = error instanceof Error ? error.message : '登录失败'
        return false
      } finally { this.busy = false; this.initialized = true }
    },
    async signOut() {
      this.busy = true
      try { await logout(); this.sync() } finally { this.busy = false }
    }
  }
})
