import { sendNotification } from '@tauri-apps/plugin-notification'
import { getAuthSnapshot, subscribeAuth } from './apiClient'
import { EventChannel } from './eventChannel'
import { ensureReminderPermission } from './reminders'

interface ReminderEvent {
  type: string
  title?: string
  message?: string
}

let started = false
let session = 0
let channel: EventChannel<ReminderEvent> | null = null

function stopConnection() {
  session += 1
  channel?.close()
  channel = null
}

async function notify(event: ReminderEvent) {
  if (event.type !== 'reminder' || !window.__TAURI_INTERNALS__) return
  if (!await ensureReminderPermission()) return
  sendNotification({ title: event.title || 'Tiny Note', body: event.message || '提醒时间到了' })
}

async function runConnection(activeSession: number) {
  const next = new EventChannel<ReminderEvent>()
  channel = next
  next.onmessage = event => { void notify(event) }
  while (activeSession === session && getAuthSnapshot().authenticated) {
    try {
      await next.connect('reminders')
    } catch {
      if (activeSession !== session || !getAuthSnapshot().authenticated) break
    }
    await new Promise(resolve => window.setTimeout(resolve, 1_000))
  }
  if (channel === next) channel = null
}

function synchronize() {
  stopConnection()
  if (!getAuthSnapshot().authenticated) return
  const activeSession = session
  void runConnection(activeSession)
}

export function startReminderEvents() {
  if (started) return
  started = true
  subscribeAuth(synchronize)
  synchronize()
}
