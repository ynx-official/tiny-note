import { cp, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Vditor loads Lute, locales, formula fonts and renderers at runtime. Keep them
// same-origin so the desktop CSP never needs a remote CDN exception.
const target = resolve('public/vendor/vditor/dist')
await mkdir(target, { recursive: true })
await cp(resolve('node_modules/vditor/dist/js'), resolve(target, 'js'), { recursive: true })
await cp(resolve('node_modules/vditor/dist/css'), resolve(target, 'css'), { recursive: true })
// The upstream PlantUML renderer uploads diagram source in an image URL.
// Keep those fences as source/error output until a local renderer is available.
await writeFile(resolve(target, 'js/plantuml/plantuml-encoder.min.js'),
  'window.plantumlEncoder={encode:function(){throw new Error("PlantUML 暂仅支持源码；可使用 Mermaid 本地预览")}};\n')
console.log('Vditor local runtime assets ready')
