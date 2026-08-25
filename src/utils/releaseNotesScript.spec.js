import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const currentVersion = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).version

describe('release notes validation script', () => {
  it('resolves the project root correctly and validates the current version', () => {
    const output = execFileSync(process.execPath, ['scripts/release-notes.mjs', '--check-current'], {
      cwd: projectRoot,
      encoding: 'utf8'
    })

    expect(output).toContain(`发布资料校验通过：tiny-note-v${currentVersion}`)
  })
})
