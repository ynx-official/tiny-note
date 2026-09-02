import type { Notebook } from '../types/domain'

export function compareNotebooks(left: Pick<Notebook, 'name'>, right: Pick<Notebook, 'name'>): number {
  if (left.name === '未分类') return -1
  if (right.name === '未分类') return 1
  return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
}
