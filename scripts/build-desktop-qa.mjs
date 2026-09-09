import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

if (process.platform !== 'darwin') throw new Error('This QA packaging entry targets macOS; use the platform release workflow for other operating systems')

// A separate application identity also scopes WebView data, file history,
// single-instance routing, and native credentials away from the daily app.
const baseUrl = new URL(process.argv[2] || '')
if (baseUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(baseUrl.hostname) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
  throw new Error('Desktop QA requires a loopback HTTP backend without credentials or query parameters')
}
const directory = await mkdtemp(join(tmpdir(), 'tiny-note-desktop-qa-'))
const frontend = join(directory, 'frontend')
const configPath = join(directory, 'tauri.qa.json')
const base = JSON.parse(await readFile('src-tauri/tauri.conf.json', 'utf8'))
await writeFile(configPath, JSON.stringify({
  productName: 'Tiny Note QA', identifier: 'com.tinynote.qa',
  build: { beforeBuildCommand: null, frontendDist: frontend },
  app: {
    windows: base.app.windows.map(window => ({ ...window, title: 'Tiny Note QA' })),
    security: { csp: base.app.security.csp.replace('https://go.mrsunshine.cn', baseUrl.origin) }
  },
  bundle: { fileAssociations: [], targets: ['app'] }
}, null, 2))
const env = { ...process.env, VITE_API_BASE_URL: baseUrl.href.replace(/\/$/, '') }
function run(command, args) {
  const result = spawnSync(command, args, { env, stdio: 'inherit', shell: false })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}
run('npm', ['run', 'typecheck'])
run('node', ['scripts/prepare-pdf-assets.mjs'])
run('npx', ['vite', 'build', '--outDir', frontend])
run('npx', ['tauri', 'build', '--config', configPath, '--bundles', 'app'])
const application = join(directory, 'Tiny Note QA.app')
run('ditto', [resolve('src-tauri/target/release/bundle/macos/Tiny Note QA.app'), application])
const report = { baseUrl: env.VITE_API_BASE_URL, identifier: 'com.tinynote.qa', directory, configPath, application }
await writeFile(join(directory, 'build.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
