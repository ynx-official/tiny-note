/* global URL, console */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const TAG_PATTERN = /^tiny-note-v(?<version>\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/
const DATE_PATTERN = /^> 发布日期：(?<date>\d{4}-\d{2}-\d{2})$/m
const EXCLUDED_HEADINGS = new Set(['验证结果', '变更依据'])
const root = path.resolve(new URL('..', import.meta.url).pathname)

class ReleaseNotesError extends Error {}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function versionFiles() {
  const packageVersion = readJson('package.json').version
  const tauriVersion = readJson('src-tauri/tauri.conf.json').version
  const cargo = readText('src-tauri/Cargo.toml')
  const cargoPackage = cargo.match(/^\[package\][\s\S]*?(?=^\[[^\]]+\]\s*$)/m)?.[0] ?? ''
  const cargoVersion = cargoPackage.match(/^version\s*=\s*"([^"]+)"/m)?.[1]
  if (!cargoVersion) throw new ReleaseNotesError('src-tauri/Cargo.toml 的 [package] 缺少 version')
  if (new Set([packageVersion, tauriVersion, cargoVersion]).size !== 1) {
    throw new ReleaseNotesError(`Version mismatch: package=${packageVersion}, tauri=${tauriVersion}, cargo=${cargoVersion}`)
  }
  return packageVersion
}

function parseTag(tag) {
  const match = TAG_PATTERN.exec(tag)
  if (!match) throw new ReleaseNotesError(`无效发布标签 ${tag}，必须使用 tiny-note-vMAJOR.MINOR.PATCH 格式`)
  return match.groups.version
}

function requireText(content, expected, source) {
  if (!content.includes(expected)) throw new ReleaseNotesError(`${source} 缺少必要内容：${expected}`)
}

function loadMetadata(tag) {
  const version = parseTag(tag)
  const currentVersion = versionFiles()
  if (version !== currentVersion) throw new ReleaseNotesError(`发布标签 ${tag} 与项目版本 ${currentVersion} 不一致`)

  const detailRelative = `docs/upgrade/${tag}/README.md`
  const detail = readText(detailRelative)
  requireText(detail, `# Tiny Note ${tag}`, detailRelative)
  const date = detail.match(DATE_PATTERN)?.groups.date
  if (!date) throw new ReleaseNotesError(`${detailRelative} 缺少“> 发布日期：YYYY-MM-DD”`)
  return { tag, version, date, detail, detailRelative }
}

function validateIndexes(metadata) {
  const changelog = readText('CHANGELOG.md')
  requireText(changelog, `## [${metadata.version}] - ${metadata.date}`, 'CHANGELOG.md')
  requireText(changelog, `[${metadata.version}]: docs/upgrade/${metadata.tag}/README.md`, 'CHANGELOG.md')

  const overview = readText('docs/upgrade/README.md')
  requireText(overview, `当前代码版本为 [\`${metadata.tag}\`](${metadata.tag}/README.md)。`, 'docs/upgrade/README.md')
  requireText(overview, `| [${metadata.tag}](${metadata.tag}/README.md) | ${metadata.date} |`, 'docs/upgrade/README.md')
}

function extractReleaseNotes(detail) {
  const lines = detail.split(/\r?\n/)
  if (!lines.includes('## 版本概述')) throw new ReleaseNotesError('版本详情文档缺少“## 版本概述”')
  let skipping = false
  const selected = []
  for (const line of lines) {
    if (line.startsWith('## ')) skipping = EXCLUDED_HEADINGS.has(line.slice(3).trim())
    if (!skipping && !line.startsWith('[返回版本总览]')) selected.push(line)
  }
  const notes = selected.join('\n').trim()
  if (!notes || notes === '## 版本概述') throw new ReleaseNotesError('版本详情文档没有可用于 GitHub Release 的正文')
  return `${notes}\n`
}

function generate(tag) {
  const metadata = loadMetadata(tag)
  validateIndexes(metadata)
  return extractReleaseNotes(metadata.detail)
}

const args = process.argv.slice(2)
const tagIndex = args.indexOf('--tag')
const outputIndex = args.indexOf('--output')
const checkCurrent = args.includes('--check-current')
if ((tagIndex >= 0) === checkCurrent) throw new ReleaseNotesError('必须且只能指定 --tag 或 --check-current')
if (checkCurrent && outputIndex >= 0) throw new ReleaseNotesError('--check-current 不能与 --output 一起使用')

try {
  const tag = checkCurrent ? `tiny-note-v${versionFiles()}` : args[tagIndex + 1]
  if (!tag) throw new ReleaseNotesError('--tag 缺少标签值')
  const notes = generate(tag)
  if (outputIndex >= 0) {
    const output = path.resolve(args[outputIndex + 1])
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, notes)
    console.log(`Release Notes 已生成：${output}`)
  } else {
    console.log(`发布资料校验通过：${tag}`)
  }
} catch (error) {
  console.error(`发布资料校验失败：${error.message}`)
  process.exitCode = 1
}
