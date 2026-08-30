import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.hoisted(() => vi.fn())
vi.mock('./apiClient', () => ({ apiFetch }))

function streamResponse(chunks: string[]) {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    }
  }), { headers: { 'Content-Type': 'text/event-stream' } })
}

describe('EventChannel', () => {
  beforeEach(() => apiFetch.mockReset())

  it('parses fragmented SSE frames and forwards the transport-neutral payload', async () => {
    apiFetch.mockResolvedValue(streamResponse([
      'id: 1\nevent: delta\ndata: {"eventId":1,"runId":"run-1","sequence":1,"type":"delta","pay',
      'load":{"text":"hello"}}\n\n',
      'id: 2\nevent: completed\ndata: {"eventId":2,"runId":"run-1","sequence":2,"type":"completed","payload":{"content":"hello"}}\n\n'
    ]))
    const { EventChannel } = await import('./eventChannel')
    const channel = new EventChannel<Record<string, unknown>>()
    const received: Array<Record<string, unknown>> = []
    channel.onmessage = event => received.push(event)

    const terminal = await channel.connect('run-1')

    expect(received).toEqual([
      { text: 'hello', type: 'delta', eventId: 1, runId: 'run-1', sequence: 1 },
      { content: 'hello', type: 'completed', eventId: 2, runId: 'run-1', sequence: 2 }
    ])
    expect(terminal).toHaveLength(1)
  })

  it('automatically reconnects with Last-Event-ID until a terminal event arrives', async () => {
    apiFetch
      .mockResolvedValueOnce(streamResponse(['data: {"eventId":7,"runId":"run-2","sequence":7,"type":"delta","payload":{"text":"a"}}\n\n']))
      .mockResolvedValueOnce(streamResponse(['data: {"eventId":8,"runId":"run-2","sequence":8,"type":"completed","payload":{}}\n\n']))
    const { EventChannel } = await import('./eventChannel')
    const channel = new EventChannel()

    const terminal = await channel.connect('run-2')

    expect(new Headers(apiFetch.mock.calls[1]?.[1]?.headers).get('Last-Event-ID')).toBe('7')
    expect(terminal).toHaveLength(1)
  })
})
