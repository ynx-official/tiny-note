import { onScopeDispose, ref, watch } from 'vue'

/** Fast operations stay silent; disposing the view cannot leave a pending indicator. */
export function useDelayedBusy(busy: () => boolean, delay = 200) {
  const visible = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(busy, value => {
    clearTimeout(timer)
    visible.value = false
    if (value) timer = setTimeout(() => { visible.value = true }, delay)
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(() => clearTimeout(timer))
  return visible
}
