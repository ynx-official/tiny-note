import changelog from '../../CHANGELOG.md?raw'

export interface CurrentReleaseNotes {
  version: string
  date: string
  body: string
}

const releasePattern = /^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?\s*$/m

function readCurrentReleaseNotes(): CurrentReleaseNotes {
  const match = releasePattern.exec(changelog)
  if (!match) return { version: '', date: '', body: '' }

  const start = match.index + match[0].length
  const nextRelease = changelog.slice(start).search(/^## \[/m)
  const section = changelog.slice(start, nextRelease === -1 ? undefined : start + nextRelease)
    .replace(/^\[[^\]]+\]:.*$/gm, '')
    .trim()

  return { version: match[1] || '', date: match[2] || '', body: section }
}

export const CURRENT_RELEASE_NOTES = readCurrentReleaseNotes()
