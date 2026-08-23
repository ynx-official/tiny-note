/* global Buffer, console, fetch */

import { createHash } from 'node:crypto'
import process from 'node:process'

const repository = process.env.GITHUB_REPOSITORY || 'ynx-official/tiny-note'
const tag = process.env.GITHUB_REF_NAME
const token = process.env.GITHUB_TOKEN
if (!tag || !token) throw new Error('GITHUB_REF_NAME and GITHUB_TOKEN are required')

const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }
const api = `https://api.github.com/repos/${repository}`

async function github(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } })
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`)
  return response
}

const release = await (await github(`${api}/releases/tags/${encodeURIComponent(tag)}`)).json()
const selected = release.assets.filter(asset => /\.(dmg|exe|appimage|deb)$/i.test(asset.name))
if (!selected.length) throw new Error('No Tiny Note installer assets found in the release')

const assets = []
for (const asset of selected) {
  const response = await github(`${api}/releases/assets/${asset.id}`, { headers: { Accept: 'application/octet-stream' } })
  const bytes = Buffer.from(await response.arrayBuffer())
  assets.push({ name: asset.name, url: asset.browser_download_url, size: bytes.length, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` })
}

const version = tag.replace(/^tiny-note-v/, '')
const manifest = {
  schema_version: 1,
  version,
  notes: release.body || '',
  assets: assets.sort((a, b) => a.name.localeCompare(b.name))
}

const existing = release.assets.find(asset => asset.name === 'update-manifest.json')
if (existing) await github(`${api}/releases/assets/${existing.id}`, { method: 'DELETE' })
const uploadUrl = release.upload_url.replace(/\{.*$/, '')
await github(`${uploadUrl}?name=update-manifest.json`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(manifest, null, 2) + '\n'
})
console.log(`Uploaded update-manifest.json for ${tag} (${assets.length} assets)`)
