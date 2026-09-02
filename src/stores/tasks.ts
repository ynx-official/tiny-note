import { defineStore } from 'pinia'
import { EventChannel } from '../services/eventChannel'
import { invoke } from '../services/tauri'
import { prepareTaskFlight } from '../utils/taskFlight'
import type { BackgroundTask, EditProposal, JsonValue } from '../types/domain'
import type { FeedbackTone } from '../services/appFeedback'
import type { CommandArgs } from '../services/commandMap'

interface TaskNotice { id: string; taskId: string | null; message: string; tone: FeedbackTone; createdAt: number }
interface TasksState { tasks: BackgroundTask[]; initialized: boolean; loading: boolean; error: string; notices: TaskNotice[]; readTaskIds: string[] }
interface TaskStreamEvent { type?: string; status?: string; text?: string; sources?: JsonValue[]; proposal?: EditProposal }
interface FlightOptions { sourceElement?: Element | null; preparedFlight?: (() => void) | null }

const streams = new Map<string, EventChannel<TaskStreamEvent>>()
const ACTIVE = new Set(['queued', 'running', 'finalizing', 'cancelling', 'awaiting_approval', 'awaiting_input'])
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'interrupted'])
const TASK_KINDS = new Set(['conversation_summary', 'note_ai', 'image_generation'])
let initialization: Promise<void> | null = null

function errorMessage(error: unknown, fallback = '后台任务执行失败'): string {
  if (typeof error === 'string' && error.trim()) return error
  if (typeof error === 'object' && error !== null) {
    if ('message' in error && typeof error.message === 'string') return error.message
    if ('code' in error && typeof error.code === 'string') return error.code
  }
  return fallback
}

function readTaskIds(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('tiny-note-read-tasks') || '[]')
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  } catch { return [] }
}

function playFlight(options: FlightOptions = {}) {
  const flight = options.preparedFlight || prepareTaskFlight(options.sourceElement || null)
  flight()
}

// @ts-expect-error TypeScript 6 reaches its instantiation ceiling while Pinia infers this action-rich option store.
export const useTasksStore = defineStore('tasks', {
  state: (): TasksState => ({ tasks: [], initialized: false, loading: false, error: '', notices: [], readTaskIds: readTaskIds() }),
  getters: {
    attentionCount(state: TasksState): number { return state.tasks.filter(task => ['awaiting_approval', 'awaiting_input', 'failed'].includes(task.status) || (task.status === 'succeeded' && !state.readTaskIds.includes(task.id))).length },
    runningCount(state: TasksState): number { return state.tasks.filter(task => ['queued', 'running', 'finalizing', 'cancelling'].includes(task.status)).length },
    waitingCount(state: TasksState): number { return state.tasks.filter(task => ['awaiting_approval', 'awaiting_input'].includes(task.status)).length },
    failedCount(state: TasksState): number {
      const retried = new Set(state.tasks.map(task => task.retryOf).filter((id): id is string => Boolean(id)))
      return state.tasks.filter(task => ['failed', 'interrupted'].includes(task.status) && !retried.has(task.id)).length
    },
    succeededCount(state: TasksState): number { return state.tasks.filter(task => task.status === 'succeeded').length },
    unreadSucceededCount(state: TasksState): number { return state.tasks.filter(task => task.status === 'succeeded' && !state.readTaskIds.includes(task.id)).length },
    activeSummaryForConversation: (state: TasksState) => (conversationId: string): BackgroundTask | undefined => state.tasks.find(task => task.kind === 'conversation_summary' && task.conversationId === conversationId && ACTIVE.has(task.status))
  },
  actions: {
    upsert(task: BackgroundTask) {
      const previous = this.tasks.find(item => item.id === task.id)
      const index = this.tasks.findIndex(item => item.id === task.id)
      if (index >= 0) this.tasks[index] = { ...this.tasks[index], ...task }
      else this.tasks.unshift(task)
      const current = this.tasks.find(item => item.id === task.id) as BackgroundTask
      window.dispatchEvent(new window.CustomEvent('tiny-note-task-updated', { detail: current }))
      if (ACTIVE.has(current.status)) this.subscribe(current.id)
      else streams.get(current.id)?.close()
      if (previous && !TERMINAL.has(previous.status) && TERMINAL.has(current.status)) {
        this.notify(current, current.status === 'succeeded' ? '后台任务已完成' : current.status === 'cancelled' ? '后台任务已取消' : '后台任务执行失败')
      }
      return current
    },
    async initialize({ force = false }: { force?: boolean } = {}) {
      if (this.initialized && !force) return
      if (initialization && !force) return initialization
      this.loading = true
      initialization = (async () => {
        try {
          const loaded = await invoke('background_task_list', { filter: null })
          this.tasks = Array.isArray(loaded) ? loaded.filter(task => task && TASK_KINDS.has(task.kind)) : []
          this.error = ''
          this.initialized = true
          this.tasks.filter(task => ACTIVE.has(task.status)).forEach(task => this.subscribe(task.id))
        } catch (error) { this.error = errorMessage(error, '任务列表读取失败') }
        finally { this.loading = false; initialization = null }
      })()
      return initialization
    },
    async refresh() {
      const loaded = await invoke('background_task_list', { filter: null })
      this.tasks = Array.isArray(loaded) ? loaded.filter(task => task && TASK_KINDS.has(task.kind)) : []
      this.tasks.filter(task => ACTIVE.has(task.status)).forEach(task => this.subscribe(task.id))
      return this.tasks
    },
    async refreshTask(id: string) {
      const task = await invoke('background_task_get', { id })
      return task ? this.upsert(task) : null
    },
    subscribe(id: string) {
      if (!id || streams.has(id)) return
      const channel = new EventChannel<TaskStreamEvent>()
      streams.set(id, channel)
      channel.onmessage = event => { void this.handleEvent(id, event) }
      void channel.connect(id).then(() => this.refreshTask(id)).catch(() => undefined).finally(() => {
        if (streams.get(id) === channel) streams.delete(id)
      })
    },
    async handleEvent(id: string, event: TaskStreamEvent) {
      const task = this.tasks.find(item => item.id === id)
      if (!task) return
      if (event.type === 'delta' || event.type === 'textDelta') {
        this.upsert({ ...task, status: 'running', output: `${task.output || ''}${event.text || ''}` })
      } else if (event.type === 'started') {
        this.upsert({ ...task, status: 'running' })
      } else if (event.type === 'status' && event.status) {
        this.upsert({ ...task, status: event.status })
      } else if (event.type === 'sources') {
        this.upsert({ ...task, publicMeta: { ...(task.publicMeta || {}), sources: event.sources || [] } })
      } else if (event.type === 'editProposal') {
        this.upsert({ ...task, publicMeta: { ...(task.publicMeta || {}), proposal: event.proposal } })
      } else if (event.type && ['completed', 'error', 'cancelled'].includes(event.type)) {
        await this.refreshTask(id)
      }
    },
    async createConversationSummary(input: CommandArgs<'conversation_summary_task_create'>, options: FlightOptions = {}) {
      const task = this.upsert(await invoke('conversation_summary_task_create', input))
      playFlight(options)
      this.notify(task, '已加入任务中心')
      return task
    },
    async createNoteAI(input: CommandArgs<'note_ai_task_create'>, options: FlightOptions = {}) {
      const task = this.upsert(await invoke('note_ai_task_create', input))
      playFlight(options)
      this.notify(task, '已加入任务中心')
      return task
    },
    async createImageGeneration(input: CommandArgs<'image_generation_task_create'>, options: FlightOptions = {}) {
      const task = this.upsert(await invoke('image_generation_task_create', input))
      playFlight(options)
      this.notify(task, '已加入任务中心')
      return task
    },
    async cancel(id: string) {
      try { return this.upsert(await invoke('background_task_cancel', { id })) }
      catch { return this.refreshTask(id) }
    },
    async retry(id: string) { return this.upsert(await invoke('background_task_retry', { id })) },
    async clearFinished() {
      const removed = await invoke('background_task_clear_finished')
      await this.refresh()
      const notice: TaskNotice = { id: crypto.randomUUID(), taskId: null, message: removed ? `已清理 ${removed} 条任务记录` : '没有可清理的已结束任务', tone: removed ? 'success' : 'info', createdAt: Date.now() }
      this.notices.push(notice)
      window.setTimeout(() => { this.notices = this.notices.filter(item => item.id !== notice.id) }, 5000)
      return removed
    },
    notify(task: BackgroundTask, message: string) {
      const tone = task.status === 'succeeded' ? 'success' : task.status === 'failed' ? 'error' : 'info'
      const notice: TaskNotice = { id: crypto.randomUUID(), taskId: task.id, message, tone, createdAt: Date.now() }
      this.notices.push(notice)
      window.setTimeout(() => { this.notices = this.notices.filter(item => item.id !== notice.id) }, 5000)
    },
    dismissNotice(id: string) { this.notices = this.notices.filter(item => item.id !== id) },
    markResultsSeen() {
      this.readTaskIds = [...new Set([...this.readTaskIds, ...this.tasks.filter(task => task?.status === 'succeeded').map(task => task.id)])].slice(-500)
      localStorage.setItem('tiny-note-read-tasks', JSON.stringify(this.readTaskIds))
    }
  }
})
