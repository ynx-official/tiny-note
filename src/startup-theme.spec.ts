import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

const html = readFileSync('index.html', 'utf8')
const scripts = (source: string) => [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]!)
const headScripts = scripts(html.split('</head>')[0]!)

it.each([
  ['light', 'dark', true, 'light'],
  ['dark', 'light', false, 'dark'],
  ['system', 'light', true, 'dark'],
  [null, 'dark', false, 'dark']
])('applies saved theme %s before the body is painted', (setting, cached, systemDark, expected) => {
  const root = { dataset: {} as Record<string, string> }
  const values: Record<string, unknown> = { 'tiny-note-theme-setting': setting, 'tiny-note-theme': cached }
  const context = { document: { documentElement: root }, localStorage: { getItem: (key: string) => values[key] }, window: { matchMedia: () => ({ matches: systemDark }) } }
  headScripts.forEach(script => runInNewContext(script, context))
  expect(root.dataset.theme).toBe(expected)
})

it('falls back to the system theme if preference storage is unavailable', () => {
  const root = { dataset: {} as Record<string, string> }
  const context = { document: { documentElement: root }, localStorage: { getItem: () => { throw new Error('blocked') } }, window: { matchMedia: () => ({ matches: true }) } }
  headScripts.forEach(script => runInNewContext(script, context))
  expect(root.dataset.theme).toBe('dark')
})

it('authorizes every inline boot script in the packaged CSP', () => {
  const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'))
  for (const script of scripts(html)) {
    expect(config.app.security.csp).toContain(`'sha256-${createHash('sha256').update(script).digest('base64')}'`)
  }
})
