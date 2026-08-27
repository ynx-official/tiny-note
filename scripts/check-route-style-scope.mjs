import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const routeStyleFiles = ['notes', 'library', 'settings', 'chat', 'images', 'tasks']
  .map(name => resolve(`src/styles/${name}.css`))

function removeLegacyLayers(source) {
  const marker = '@layer tiny-note-route-legacy'
  let output = source
  let start = output.indexOf(marker)
  while (start >= 0) {
    const openingBrace = output.indexOf('{', start + marker.length)
    if (openingBrace < 0) throw new Error('Unclosed tiny-note-route-legacy declaration')
    let depth = 1
    let cursor = openingBrace + 1
    while (cursor < output.length && depth > 0) {
      if (output[cursor] === '{') depth += 1
      if (output[cursor] === '}') depth -= 1
      cursor += 1
    }
    if (depth !== 0) throw new Error('Unclosed tiny-note-route-legacy block')
    output = `${output.slice(0, start)}${output.slice(cursor)}`
    start = output.indexOf(marker)
  }
  return output
}

const violations = []
for (const file of routeStyleFiles) {
  const source = removeLegacyLayers(await readFile(file, 'utf8'))
  const forbidden = [
    [/(?:^|})\s*:root(?:\[[^\]]+\])?\s*\{/gm, 'global theme variables'],
    [/(?:^|})\s*(?:html|body)\s*(?:,|\{)/gm, 'document styles'],
    [/(?:^|})\s*\.window-shell\s*\{/gm, 'application shell styles']
  ]
  for (const [pattern, label] of forbidden) {
    if (pattern.test(source)) violations.push(`${file}: unlayered ${label}`)
  }
}

if (violations.length) {
  console.error(`Route CSS isolation failed:\n${violations.map(item => `- ${item}`).join('\n')}`)
  process.exit(1)
}

console.log(`Route CSS isolation passed (${routeStyleFiles.length} lazy style bundles).`)
