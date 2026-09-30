import { mountEditor, note, switchMode } from './NoteEditor.testHarness'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Vditor styling inside the notes workspace', () => {
  it('uses the approved reading theme without leaking legacy editor styles', async () => {
    const style = document.createElement('style')
    style.textContent = ['node_modules/vditor/dist/index.css', 'src/styles/notes.css', 'src/styles/note-workspace.css', 'src/styles/vditor-editor.css']
      // jsdom cannot parse @layer/@container. Apply the same declaration rules
      // without grouping; browser QA separately verifies the real cascade.
      .map(path => [...readFileSync(path, 'utf8').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(match => !match[1].trim().startsWith('@')).map(match => `${match[1]}{${match[2]}}`).join('\n')).join('\n')
    document.head.append(style)
    const w = await mountEditor({ ...note(), contentMarkdown: '# 标题\n\n```shell\necho hello\n```\n\n正文' })
    try {
      const root = w.get('.vditor-ir pre.vditor-reset').element
      expect(getComputedStyle(root).fontSize).toBe('16px')
      expect(getComputedStyle(root).lineHeight).toBe('1.75')
      expect(getComputedStyle(root).fontFamily).toContain('Microsoft YaHei')
      expect(getComputedStyle(w.get('pre.vditor-ir__preview > code').element).backgroundImage).toBe('none')
      expect(getComputedStyle(w.get('.vditor-ir h1').element).fontSize).toBe('28px')
      // Collapsed source markers must stay invisible after applying typography.
      expect(getComputedStyle(w.get('.vditor-ir__marker--pre').element).height).toBe('0px')
      expect(w.find('.tiny-vditor .note-prose').exists()).toBe(false)
      expect(w.get('.vditor-editor').classes()).not.toContain('editor-content')
      await switchMode(w, 'markdown')
      expect(getComputedStyle(w.get('.vditor-preview .vditor-reset').element).fontSize).toBe('16px')
      expect(getComputedStyle(w.get('.vditor-sv .h1').element).fontSize).toBe('14px')
      expect(w.find('.tiny-vditor .note-prose').exists()).toBe(false)
    } finally { w.unmount(); style.remove() }
  })
})
