import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { version } from '../../package.json'
import { CURRENT_RELEASE_NOTES } from './releaseNotes'

describe('current release notes', () => {
  it('shows the complete version detail instead of the changelog summary', () => {
    const detail = readFileSync(`docs/upgrade/tiny-note-v${version}/README.md`, 'utf8')
    const body = detail.replace(/^\[返回版本总览\].*$/gm, '').trim()

    expect(CURRENT_RELEASE_NOTES.version).toBe(version)
    expect(CURRENT_RELEASE_NOTES.date).toBe(detail.match(/^> 发布日期：(\d{4}-\d{2}-\d{2})/m)?.[1])
    expect(CURRENT_RELEASE_NOTES.body).toBe(body)
  })
})
