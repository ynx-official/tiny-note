import { onScopeDispose, reactive, ref, watch } from 'vue'
import { createNotePageState, loadNotePage } from '../services/notePage'
import type { NotePageFilter } from '../types/domain'

export function useNotePicker(filter: () => NotePageFilter = () => ({})) {
  const page = reactive(createNotePageState())
  const query = ref('')
  let timer: ReturnType<typeof setTimeout> | undefined
  function refresh() { return loadNotePage(page, { ...filter(), search: query.value.trim() || undefined }) }
  function more() { return loadNotePage(page, page.filter, true) }
  function retry() { return page.nextCursor ? more() : refresh() }
  watch(query, () => { clearTimeout(timer); timer = setTimeout(refresh, 250) })
  onScopeDispose(() => clearTimeout(timer))
  return { page, query, refresh, more, retry }
}
