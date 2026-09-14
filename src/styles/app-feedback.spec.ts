import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('global feedback dialog styles', () => {
  it('loads overlay and dialog positioning before any route stylesheet', () => {
    const main = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8')
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app-feedback.css'), 'utf8')

    expect(main).toContain("import './styles/app-feedback.css'")
    expect(css).toMatch(/\.app-feedback-overlay\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*display:\s*grid/s)
    expect(css).toMatch(/\.app-feedback-dialog\s*\{[^}]*background:\s*var\(--surface\)/s)
  })
})
