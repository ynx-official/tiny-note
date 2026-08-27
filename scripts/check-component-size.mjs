import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'

const sourceRoot = resolve('src')
// Existing large workspaces remain visible as migration debt; all new production SFCs
// and every touched extraction must respect the 300-line ceiling.
const legacyCeilings = new Map(Object.entries({
}))

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]))).flat()
}

const failures = []
for (const file of await files(sourceRoot)) {
  if (extname(file) !== '.vue' || file.endsWith('.spec.vue')) continue
  const name = relative(sourceRoot, file).replaceAll('\\', '/')
  const count = (await readFile(file, 'utf8')).split(/\r?\n/).length
  const limit = legacyCeilings.get(name) ?? 300
  if (count > limit) failures.push(`${name}: ${count} lines (limit ${limit})`)
}
if (failures.length) {
  console.error(`Component size budget failed:\n${failures.join('\n')}`)
  process.exit(1)
}
console.log(`Component size budget passed: new SFCs are limited to 300 lines; ${legacyCeilings.size} recorded legacy SFC ceilings did not grow.`)
