import { describe, expect, it } from 'vitest'
import { sortTodos } from './todos'

describe('todo sorting', () => {
  it('sorts active due work before undated and completed work', () => {
    const result = sortTodos([
      { id: 'done', completedAt: '2026-01-01', dueAt: null, priority: 'none', createdAt: '3' },
      { id: 'undated', completedAt: null, dueAt: null, priority: 'high', createdAt: '2' },
      { id: 'due', completedAt: null, dueAt: '2026-08-26', priority: 'low', createdAt: '1' }
    ])
    expect(result.map(item => item.id)).toEqual(['due', 'undated', 'done'])
  })
})
