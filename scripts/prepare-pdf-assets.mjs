import { cp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const destination = resolve('public/pdfjs')
await mkdir(destination, { recursive: true })
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(resolve('node_modules/pdfjs-dist', folder), resolve(destination, folder), { recursive: true })
}
