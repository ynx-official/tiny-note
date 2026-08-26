import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import NotebookTreeItem from './NotebookTreeItem.vue'

describe('NotebookTreeItem', () => {
  const node = {
    id: 'root', name: 'Java', totalNoteCount: 2,
    notes: [{ id: 'note-1', title: 'Java 介绍', pinned: true }],
    children: [{ id: 'child', name: 'Spring', totalNoteCount: 1, notes: [{ id: 'note-2', title: 'IOC', pinned: false }], children: [] }]
  }

  it('renders recursive folders before direct notes and emits selection', async () => {
    const wrapper = mount(NotebookTreeItem, { props: { node, expanded: new Set(['root', 'child']), selected: { type: 'note', id: 'note-1' } } })
    const rows = wrapper.findAll('.tree-row')
    expect(rows.map(row => row.text().replace(/^›/, ''))).toEqual(expect.arrayContaining(['Java2', 'Spring1', 'IOC', 'Java 介绍']))
    expect(rows.findIndex(row => row.text().includes('Spring'))).toBeLessThan(rows.findIndex(row => row.text().includes('Java 介绍')))
    await wrapper.find('.tree-note-row.active').trigger('click')
    expect(wrapper.emitted('select-note')?.[0]?.[0]).toMatchObject({ id: 'note-1' })
  })

  it('supports keyboard expansion', async () => {
    const wrapper = mount(NotebookTreeItem, { props: { node, expanded: new Set(), selected: { type: 'all', id: 'all' } } })
    await wrapper.get('.tree-folder-row').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('toggle')?.[0]).toEqual(['root'])
  })
})
