import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const commandSource = read('src/services/commandMap.ts')
const remoteSource = read('src/services/remoteCommands.ts')
const tauriSource = read('src/services/tauri.ts')

const commandBlock = commandSource.split('export interface CommandMap {')[1]?.split('\n}')[0] || ''
const commands = [...commandBlock.matchAll(/^\s{2}([a-z][a-z0-9_]+):/gm)].map(match => match[1])
const remote = new Set([...remoteSource.matchAll(/case '([a-z][a-z0-9_]+)'/g)].map(match => match[1]))
const platformBlock = tauriSource.split('const platformCommands')[1]?.split('])')[0] || ''
const platform = new Set([...platformBlock.matchAll(/'([a-z][a-z0-9_]+)'/g)].map(match => match[1]))
const known = new Set(commands)

const missing = commands.filter(command => !remote.has(command) && !platform.has(command))
const duplicate = commands.filter(command => remote.has(command) && platform.has(command))
const stale = [...remote, ...platform].filter(command => !known.has(command))

if (commands.length < 120 || new Set(commands).size !== commands.length || missing.length || duplicate.length || stale.length) {
  console.error(JSON.stringify({ commandCount: commands.length, missing, duplicate, stale }, null, 2))
  process.exit(1)
}

console.log(`Command contract OK: ${commands.length} commands (${remote.size} remote, ${platform.size} Tauri platform)`)
