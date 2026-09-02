import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('chat text selection styles', () => {
  it('allows native selection for every piece of conversation content', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/chat.css'), 'utf8')

    expect(css).toMatch(/\.chat-page-messages[^{}]*\{[^}]*user-select:\s*text/s)
    expect(css).toMatch(/\.chat-page-messages[^{}]*\{[^}]*-webkit-user-select:\s*text/s)
  })
})
