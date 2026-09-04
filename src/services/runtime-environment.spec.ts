import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

interface TauriConfig {
  build: { beforeDevCommand?: string; beforeBuildCommand?: string }
  app: { windows?: Array<{ center?: boolean }>; security: { csp: string } }
}

const readJson = (path: string) => JSON.parse(projectFile(path)) as TauriConfig

describe('runtime environment commands', () => {
  it('uses the local API for development and the remote API for production', () => {
    expect(projectFile('.env.development').trim()).toBe('VITE_API_BASE_URL=http://localhost:8081')
    expect(projectFile('.env.production').trim()).toBe('VITE_API_BASE_URL=https://go.mrsunshine.cn/prod-api')

    const apiClient = projectFile('src/services/apiClient.ts')
    expect(apiClient).toContain("configuredBaseUrl || 'https://go.mrsunshine.cn/prod-api'")
    expect(apiClient).not.toContain('http://127.0.0.1:8080')
  })

  it('provides make commands for both desktop runtime environments', () => {
    const makefile = projectFile('Makefile')

    expect(makefile).toMatch(/^dev:\s*$/m)
    expect(makefile).toContain('npm run tauri:dev -- --config src-tauri/tauri.dev.conf.json')
    expect(makefile).toMatch(/^prod:\s*$/m)
    expect(makefile).toContain('npm run tauri:dev -- --config src-tauri/tauri.prod.conf.json')
  })

  it('keeps development and production CSP aligned with their API origins', () => {
    const baseConfig = readJson('src-tauri/tauri.conf.json')
    const devConfig = readJson('src-tauri/tauri.dev.conf.json')
    const prodConfig = readJson('src-tauri/tauri.prod.conf.json')

    expect(baseConfig.build.beforeBuildCommand).toBe('npm run build')
    expect(baseConfig.app.security.csp).toContain('https://go.mrsunshine.cn')
    expect(baseConfig.app.security.csp).not.toContain('localhost:8081')

    expect(devConfig.build.beforeDevCommand).toBe('npm run dev -- --mode development')
    expect(devConfig.app.security.csp).toContain('http://localhost:8081')
    expect(devConfig.app.security.csp).not.toContain('https://go.mrsunshine.cn')

    expect(prodConfig.build.beforeDevCommand).toBe('npm run dev -- --mode production')
    expect(prodConfig.app.security.csp).toContain('https://go.mrsunshine.cn')
    expect(prodConfig.app.security.csp).not.toContain('localhost:8081')
  })

  it('centers the desktop window on every launch', () => {
    const baseConfig = readJson('src-tauri/tauri.conf.json')

    expect(baseConfig.app.windows?.[0]?.center).toBe(true)
  })
})
