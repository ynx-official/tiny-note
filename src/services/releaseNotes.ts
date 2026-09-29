import { version } from '../../package.json'

export interface CurrentReleaseNotes {
  version: string
  date: string
  body: string
}

const releaseDetails = import.meta.glob<string>('../../docs/upgrade/tiny-note-v*/README.md', {
  query: '?raw',
  import: 'default',
  eager: true
})

function readCurrentReleaseNotes(): CurrentReleaseNotes {
  // CHANGELOG contains summaries only; use the installed version's full detail.
  const detail = releaseDetails[`../../docs/upgrade/tiny-note-v${version}/README.md`] || ''
  return {
    version,
    date: detail.match(/^> 发布日期：(\d{4}-\d{2}-\d{2})/m)?.[1] || '',
    // This repository navigation link has no destination inside the desktop app.
    body: detail.replace(/^\[返回版本总览\].*$/gm, '').trim()
  }
}

export const CURRENT_RELEASE_NOTES = readCurrentReleaseNotes()
