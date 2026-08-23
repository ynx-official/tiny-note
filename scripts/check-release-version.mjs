import fs from 'node:fs'
import process from 'node:process'

const packageVersion = JSON.parse(fs.readFileSync('package.json', 'utf8')).version
const tauriVersion = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8')).version
const cargo = fs.readFileSync('src-tauri/Cargo.toml', 'utf8')
const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1]
const tag = process.argv[2]
const expectedTag = `tiny-note-v${packageVersion}`

if (packageVersion !== tauriVersion || packageVersion !== cargoVersion) {
  throw new Error(`Version mismatch: package=${packageVersion}, tauri=${tauriVersion}, cargo=${cargoVersion}`)
}
if (tag && tag !== expectedTag) throw new Error(`Release tag must be ${expectedTag}, received ${tag}`)

process.stdout.write(`Release version ${packageVersion} is consistent.\n`)
