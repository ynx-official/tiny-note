import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const dist = resolve('dist')
const manifest = JSON.parse(await readFile(resolve(dist, '.vite/manifest.json'), 'utf8'))
const bootRoots = ['index.html', 'src/App.vue', 'src/router/index.ts', 'src/services/externalMarkdown.ts']
const visited = new Set()

function collect(key) {
  if (visited.has(key) || !manifest[key]) return
  visited.add(key)
  for (const dependency of manifest[key].imports || []) collect(dependency)
}
for (const key of bootRoots) collect(key)

let javascriptBytes = 0
const indexHtml = await readFile(resolve(dist, 'index.html'), 'utf8')
let cssBytes = await stat(resolve(dist, 'boot.css')).then(file => file.size).catch(() => 0)
cssBytes += [...indexHtml.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi)]
  .reduce((total, match) => total + Buffer.byteLength(match[1]), 0)
const inspectedFiles = []
for (const key of visited) {
  const chunk = manifest[key]
  if (chunk.file.endsWith('.js')) javascriptBytes += (await stat(resolve(dist, chunk.file))).size
  for (const css of chunk.css || []) cssBytes += (await stat(resolve(dist, css))).size
  inspectedFiles.push(chunk.file)
}

const errors = []
if (!manifest['tray.html']) errors.push('tray.html is missing from the build manifest')
if (javascriptBytes > 500_000) errors.push(`boot JavaScript ${javascriptBytes} B exceeds 500000 B`)
if (cssBytes > 100_000) errors.push(`boot CSS ${cssBytes} B exceeds 100000 B`)
const forbidden = ['@tiptap', 'codemirror', 'mermaid', 'html2pdf']
for (const file of inspectedFiles.filter(file => file.endsWith('.js'))) {
  const source = await readFile(resolve(dist, file), 'utf8')
  for (const token of forbidden) if (source.toLowerCase().includes(token)) errors.push(`${token} leaked into boot chunk ${file}`)
}

const trayVisited = new Set()
function collectTray(key) {
  if (trayVisited.has(key) || !manifest[key]) return
  trayVisited.add(key)
  for (const dependency of manifest[key].imports || []) collectTray(dependency)
}
collectTray('tray.html')
for (const key of trayVisited) {
  if (/src\/(?:App\.vue|router\/|views\/HomeView\.vue)/.test(key)) errors.push(`main-window module leaked into tray entry: ${key}`)
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log(`Boot budget passed: JS ${javascriptBytes} B / 500000 B, CSS ${cssBytes} B / 100000 B`)
