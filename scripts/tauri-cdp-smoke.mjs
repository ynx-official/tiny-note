import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const endpoint = process.env.TINY_NOTE_CDP_ENDPOINT || 'http://127.0.0.1:9222'
const screenshotDirectory = process.argv.find(argument => argument.startsWith('--screenshots='))?.split('=')[1]
const routes = ['/', '/notes', '/library', '/chat', '/settings', '/images', '/todos', '/calendar', '/tasks']

const delay = milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds))
const targets = await fetch(`${endpoint}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page' && item.title === 'Tiny Note') || targets.find(item => item.type === 'page')
if (!target?.webSocketDebuggerUrl) throw new Error(`No debuggable Tiny Note page at ${endpoint}`)

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener('open', resolveOpen, { once: true })
  socket.addEventListener('error', rejectOpen, { once: true })
})

let sequence = 0
const pending = new Map()
const runtimeErrors = []
let currentRoute = target.url
socket.addEventListener('message', event => {
  const message = JSON.parse(String(event.data))
  if (message.id && pending.has(message.id)) {
    const { resolve: resolveCommand, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message))
    else resolveCommand(message.result)
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params.exceptionDetails
    runtimeErrors.push({ route: currentRoute, text: details.text, description: details.exception?.description || '', url: details.url || '', line: details.lineNumber || 0 })
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') runtimeErrors.push({ route: currentRoute, text: message.params.entry.text })
})

function command(method, params = {}) {
  const id = ++sequence
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolveCommand, reject) => pending.set(id, { resolve: resolveCommand, reject }))
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

await command('Runtime.enable')
await command('Log.enable')
await command('Page.enable')
await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await evaluate(`(() => {
  window.__tinyNoteCdpUnhandled = []
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason
    window.__tinyNoteCdpUnhandled.push(typeof reason === 'object' ? JSON.stringify(reason, Object.getOwnPropertyNames(reason)) : String(reason))
  })
})()`)

const results = []
if (screenshotDirectory) await mkdir(resolve(screenshotDirectory), { recursive: true })
for (const route of routes) {
  currentRoute = route
  await evaluate(`location.hash = ${JSON.stringify(`#${route}`)}`)
  await delay(route === '/notes' ? 1800 : 800)
  const state = await evaluate(`(() => {
    const root = document.querySelector('.content-card > *')
    const rect = root?.getBoundingClientRect()
    const theme = getComputedStyle(document.documentElement)
    const topbar = document.querySelector('.topbar')
    const rail = document.querySelector('.rail')
    const card = document.querySelector('.content-card')
    return {
      route: location.hash.slice(1),
      startupState: document.documentElement.dataset.startupState,
      textLength: (root?.textContent || '').trim().length,
      width: Math.round(rect?.width || 0),
      height: Math.round(rect?.height || 0),
      display: root ? getComputedStyle(root).display : '',
      theme: ['--bg', '--surface', '--surface-2', '--text', '--muted', '--accent', '--line']
        .map(token => [token, theme.getPropertyValue(token).trim()]),
      shell: {
        topbarHeight: Math.round(topbar?.getBoundingClientRect().height || 0),
        topbarBackground: topbar ? getComputedStyle(topbar).backgroundColor : '',
        railWidth: Math.round(rail?.getBoundingClientRect().width || 0),
        railBackground: rail ? getComputedStyle(rail).backgroundColor : '',
        cardRadius: card ? getComputedStyle(card).borderRadius : ''
      },
      styleSheets: [...document.styleSheets].map(sheet => sheet.href || 'inline').filter(Boolean)
    }
  })()`)
  const valid = state.route.startsWith(route) && state.textLength > 0 && state.width > 0 && state.height > 0 && state.display !== 'none'
  results.push({ ...state, valid })
  if (screenshotDirectory) {
    const capture = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    const name = route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')
    await writeFile(resolve(screenshotDirectory, `${name}-1280x800.png`), Buffer.from(capture.data, 'base64'))
  }
}

const baselineTheme = JSON.stringify(results[0]?.theme)
const baselineShell = JSON.stringify(results[0]?.shell)
for (const result of results) {
  result.themeStable = JSON.stringify(result.theme) === baselineTheme
  result.shellStable = JSON.stringify(result.shell) === baselineShell
}

await command('Emulation.setDeviceMetricsOverride', { width: 1024, height: 700, deviceScaleFactor: 1, mobile: false })
await evaluate(`location.hash = '#/notes'`)
await delay(1000)
const minimumViewport = await evaluate(`(() => {
  const root = document.querySelector('.content-card > *')
  const rect = root?.getBoundingClientRect()
  return { width: Math.round(rect?.width || 0), height: Math.round(rect?.height || 0), scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }
})()`)
const unhandledRejections = await evaluate(`window.__tinyNoteCdpUnhandled || []`)
if (screenshotDirectory) {
  const capture = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(resolve(screenshotDirectory, 'notes-1024x700.png'), Buffer.from(capture.data, 'base64'))
}

socket.close()
const report = { results, minimumViewport, runtimeErrors, unhandledRejections }
console.log(JSON.stringify(report, null, 2))
if (results.some(result => !result.valid || !result.themeStable || !result.shellStable) || runtimeErrors.length || unhandledRejections.length || minimumViewport.scrollWidth > minimumViewport.clientWidth) process.exitCode = 1
