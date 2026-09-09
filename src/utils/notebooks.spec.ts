import { describe, expect, it } from 'vitest'
import { compareNotebooks } from './notebooks'

describe('notebook ordering', () => {
  it('keeps the system uncategorized notebook directly below all notes', () => {
    const notebooks = [{ name: '工作' }, { name: '未分类' }, { name: '归档' }]
    expect(notebooks.sort(compareNotebooks).map(item => item.name)[0]).toBe('未分类')
  })
})
