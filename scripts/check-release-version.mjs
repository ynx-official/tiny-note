import process from 'node:process'
import { spawnSync } from 'node:child_process'

const tag = process.argv[2]
const args = tag ? ['--tag', tag] : ['--check-current']
const result = spawnSync(process.execPath, ['scripts/release-notes.mjs', ...args], {
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exitCode = result.status ?? 1
