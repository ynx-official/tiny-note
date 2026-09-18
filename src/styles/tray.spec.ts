import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readStyles(path: string): string {
  return readFileSync(path, 'utf8').replace(/@import\s+['"](.+?)['"];?/g, (_, imported: string) =>
    readStyles(resolve(dirname(path), imported)))
}

describe('standalone tray theme', () => {
  it('defines every theme variable used by the tray without main-window styles', () => {
    const entry = readFileSync(resolve('src/tray.ts'), 'utf8')
    const imports = [...entry.matchAll(/import\s+['"](.+?\.css)['"]/g)]
    expect(imports.length).toBeGreaterThan(0)
    const styles = imports.map(([, path]) => readStyles(resolve('src', path))).join('\n')
    const component = readFileSync(resolve('src/components/TrayTodoPanel.vue'), 'utf8')
    const declarations = new Set([...styles.matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name))
    const references = [...new Set([...`${styles}\n${component}`.matchAll(/var\(\s*(--[\w-]+)/g)].map(([, name]) => name))]

    // A missing background token makes the white active-navigation icon invisible.
    expect(references.filter(name => !declarations.has(name))).toEqual([])
  })
})
