import { apiFetch, ApiError } from './apiClient'

export interface StreamEvent<T = Record<string, unknown>> {
  eventId: number
  runId: string
  sequence: number
  type: string
  payload: T
}

type MessageHandler<T> = ((event: T) => void) | null

/** Transport-neutral replacement for Tauri Channel, backed by authenticated SSE. */
export class EventChannel<T = Record<string, unknown>> {
  onmessage: MessageHandler<T> = null
  private controller: AbortController | null = null
  private cursor = 0
  private runId = ''

  emit(event: T): void { this.onmessage?.(event) }

  close(): void {
    this.controller?.abort()
    this.controller = null
  }

  async connect(runId: string): Promise<StreamEvent[]> {
    this.close()
    if (this.runId !== runId) this.cursor = 0
    this.runId = runId
    const controller = new AbortController()
    this.controller = controller
    const terminal: StreamEvent[] = []
    let retryDelay = 300
    try {
      while (!controller.signal.aborted && terminal.length === 0) {
        try {
          const response = await apiFetch(`/streams/${encodeURIComponent(runId)}`, {
            headers: this.cursor ? { 'Last-Event-ID': String(this.cursor) } : undefined,
            signal: controller.signal
          })
          if (!response.body) throw new Error('服务器未返回事件流')
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          let received = false
          for (;;) {
            const { done, value } = await reader.read()
            buffer += decoder.decode(value, { stream: !done })
            const blocks = buffer.split(/\r?\n\r?\n/)
            buffer = blocks.pop() || ''
            for (const block of blocks) {
              const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
              if (!data) continue
              const event = JSON.parse(data) as StreamEvent<Record<string, unknown>>
              if ((Number(event.eventId) || 0) <= this.cursor) continue
              received = true
              this.cursor = Number(event.eventId) || this.cursor
              const normalized = { ...event.payload, type: event.type, eventId: event.eventId, runId: event.runId, sequence: event.sequence } as T
              this.emit(normalized)
              if (['completed', 'error', 'cancelled'].includes(event.type)) terminal.push(event)
            }
            if (done || terminal.length) break
          }
          if (received) retryDelay = 300
        } catch (error) {
          if (controller.signal.aborted) break
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) throw error
        }
        if (!terminal.length && !controller.signal.aborted) {
          await abortableDelay(retryDelay, controller.signal)
          retryDelay = Math.min(retryDelay * 2, 5000)
        }
      }
      return terminal
    } finally {
      if (this.controller === controller) this.controller = null
    }
  }
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) return resolve()
    const timer = window.setTimeout(done, milliseconds)
    function done() {
      window.clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    signal.addEventListener('abort', done, { once: true })
  })
}
