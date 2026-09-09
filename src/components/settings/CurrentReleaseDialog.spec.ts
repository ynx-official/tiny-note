import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('explicitly centers the release dialog in the viewport', () => {
  const source = readFileSync('src/components/settings/CurrentReleaseDialog.vue', 'utf8')
  const style = document.createElement('style')
  style.textContent = source.split('<style scoped>')[1]!.split('</style>')[0]!
  const dialog = document.createElement('dialog')
  dialog.className = 'current-release-dialog'
  dialog.setAttribute('open', '')
  document.head.append(style)
  document.body.append(dialog)
  try {
    const css = getComputedStyle(dialog)
    expect(css.position).toBe('fixed')
    expect(css.inset).toBe('0')
    expect(css.margin).toBe('auto')
    expect(css.maxHeight).toBe('80vh')
  } finally {
    dialog.remove()
    style.remove()
  }
})
