import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareTaskFlight } from './taskFlight'

describe('task flight feedback', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete globalThis.Element.prototype.animate
    globalThis.document.body.innerHTML = ''
  })

  it('animates a visual copy toward the task-center entry and pulses the target', async () => {
    const source = globalThis.document.createElement('button')
    source.textContent = '总结为笔记'
    const target = globalThis.document.createElement('button')
    target.dataset.taskCenterTarget = ''
    globalThis.document.body.append(source, target)
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue({ left: 400, top: 120, width: 96, height: 32, right: 496, bottom: 152, x: 400, y: 120, toJSON() {} })
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ left: 12, top: 600, width: 36, height: 36, right: 48, bottom: 636, x: 12, y: 600, toJSON() {} })
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false })) })
    let finishAnimation
    const animate = vi.fn(() => ({ finished: new Promise(resolve => { finishAnimation = resolve }) }))
    Object.defineProperty(globalThis.Element.prototype, 'animate', { configurable: true, value: animate })

    prepareTaskFlight(source)()

    expect(animate).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ duration: 1000 }))
    expect(globalThis.document.querySelector('.task-flight-ghost')?.textContent).toContain('总结为笔记')
    expect(globalThis.document.querySelector('.task-flight-label')?.textContent).toBe('已加入后台')
    finishAnimation()
    await Promise.resolve()
    await Promise.resolve()
    expect(target.classList.contains('task-center-arrival')).toBe(true)
  })
})
