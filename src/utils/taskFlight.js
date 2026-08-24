function taskCenterTarget() {
  return globalThis.document.querySelector('[data-task-center-target]')
}

function pulseTaskCenter(target = taskCenterTarget()) {
  if (!target) return
  globalThis.window.dispatchEvent(new globalThis.CustomEvent('tiny-note-task-flight-arrival'))
  target.classList.remove('task-center-arrival')
  void target.offsetWidth
  target.classList.add('task-center-arrival')
  window.setTimeout(() => target.classList.remove('task-center-arrival'), 700)
}

export function prepareTaskFlight(sourceElement) {
  if (!(sourceElement instanceof globalThis.Element)) return () => pulseTaskCenter()
  const start = sourceElement.getBoundingClientRect()
  const ghost = sourceElement.cloneNode(true)
  ghost.removeAttribute('id')
  ghost.setAttribute('aria-hidden', 'true')
  ghost.setAttribute('tabindex', '-1')
  const flightLabel = globalThis.document.createElement('span')
  flightLabel.className = 'task-flight-label'
  flightLabel.textContent = '已加入后台'
  ghost.appendChild(flightLabel)

  return () => {
    const target = taskCenterTarget()
    if (!target) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || typeof ghost.animate !== 'function') {
      pulseTaskCenter(target)
      return
    }
    const end = target.getBoundingClientRect()
    const targetX = end.left + end.width / 2
    const targetY = end.top + end.height / 2
    const startX = start.left + start.width / 2
    const startY = start.top + start.height / 2
    ghost.classList.add('task-flight-ghost')
    Object.assign(ghost.style, { left: `${start.left}px`, top: `${start.top}px`, minWidth: `${Math.max(start.width, 118)}px`, height: `${Math.max(start.height, 34)}px` })
    globalThis.document.body.appendChild(ghost)
    const animation = ghost.animate([
      { transform: 'translate3d(0, 0, 0) scale(1.04)', opacity: 1 },
      { transform: `translate3d(${(targetX - startX) * 0.72}px, ${(targetY - startY) * 0.45 - 28}px, 0) scale(.82)`, opacity: 1, offset: 0.8 },
      { transform: `translate3d(${targetX - startX}px, ${targetY - startY}px, 0) scale(.2)`, opacity: 0.2 }
    ], { duration: 1000, easing: 'cubic-bezier(.22,.78,.24,1)', fill: 'forwards' })
    Promise.resolve(animation.finished).catch(() => {}).finally(() => { ghost.remove(); pulseTaskCenter() })
  }
}
