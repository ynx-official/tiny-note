import { defineStore } from 'pinia'
import { Channel } from '@tauri-apps/api/core'
import { marked } from 'marked'
import { invoke } from '../services/tauri'
import { useNotesStore } from './notes'
import { sanitizeEditorHtml, textFromEditorHtml } from '../utils/noteMarkdown'
import { prepareTaskFlight } from '../utils/taskFlight'
import type { BackgroundTask, EditProposal, JsonValue } from '../types/domain'
import type { FeedbackTone } from '../services/appFeedback'
import type { CommandArgs, ImageGenerateResult } from '../services/commandMap'

interface TaskNotice { id: string; taskId: string | null; message: string; tone: FeedbackTone; createdAt: number }
interface TasksState { tasks: BackgroundTask[]; initialized: boolean; loading: boolean; error: string; notices: TaskNotice[]; readTaskIds: string[] }
interface TaskStreamEvent { type?: string; text?: string; content?: string; message?: string; code?: string; sources?: JsonValue[]; proposal?: EditProposal }

const activeExecutions = new Map<string, boolean>()
const eventChains = new Map<string, Promise<void>>()
const ACTIVE = new Set(['running', 'awaiting_approval', 'awaiting_input'])
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

function taskTitleFromMarkdown(markdown: unknown, fallback?: string) {
  return (String(markdown || '').match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim() || fallback || '对话总结').slice(0, 80)
}
function readTaskIds(): string[] { try { const value: unknown = JSON.parse(localStorage.getItem('tiny-note-read-tasks') || '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [] } catch { return [] } }

// @ts-expect-error TypeScript 6 reaches its instantiation ceiling while Pinia infers this action-rich option store.
export const useTasksStore = defineStore('tasks', {
  state: (): TasksState => ({ tasks: [], initialized: false, loading: false, error: '', notices: [], readTaskIds: readTaskIds() }),
  getters: {
    attentionCount(state: TasksState): number { return state.tasks.filter(task => ['awaiting_approval', 'awaiting_input', 'failed'].includes(task.status) || (task.status === 'succeeded' && !state.readTaskIds.includes(task.id))).length },
    runningCount(state: TasksState): number { return state.tasks.filter(task => ['queued', 'running'].includes(task.status)).length },
    waitingCount(state: TasksState): number { return state.tasks.filter(task => ['awaiting_approval', 'awaiting_input'].includes(task.status)).length },
    failedCount(state: TasksState): number {
      const retried = new Set(state.tasks.map(task => task.retryOf).filter((id): id is string => Boolean(id)))
      return state.tasks.filter(task => ['failed', 'interrupted'].includes(task.status) && !retried.has(task.id)).length
    },
    succeededCount(state: TasksState): number { return state.tasks.filter(task => task.status === 'succeeded').length },
    unreadSucceededCount(state: TasksState): number { return state.tasks.filter(task => task.status === 'succeeded' && !state.readTaskIds.includes(task.id)).length },
    activeSummaryForConversation: (state: TasksState) => (conversationId: string): BackgroundTask | undefined => state.tasks.find(task => task.kind === 'conversation_summary' && task.conversationId === conversationId && ['queued', 'running'].includes(task.status))
  },
  actions: {
    upsert(task: BackgroundTask) {
      const index = this.tasks.findIndex(item => item.id === task.id)
      if (index >= 0) this.tasks[index] = { ...this.tasks[index], ...task }
      else this.tasks.unshift(task)
      window.dispatchEvent(new window.CustomEvent('tiny-note-task-updated', { detail: task }))
      if (TERMINAL.has(task.status)) window.queueMicrotask(() => this.dispatch())
      return task
    },
    async initialize({ force = false }: { force?: boolean } = {}) {
      if (this.initialized && !force) { this.dispatch(); return }
      if (initialization && !force) return initialization
      this.loading = true
      initialization = (async () => {
        try {
          const loaded = await invoke('background_task_list', { filter: null })
          this.tasks = Array.isArray(loaded) ? loaded.filter(task => task && TASK_KINDS.has(task.kind)) : []
          this.error = ''
          this.initialized = true
          this.dispatch()
        } catch (error) { this.error = errorMessage(error, '任务列表读取失败') }
        finally { this.loading = false; initialization = null }
      })()
      return initialization
    },
    async refresh() {
      const loaded = await invoke('background_task_list', { filter: null })
      this.tasks = Array.isArray(loaded) ? loaded.filter(task => task && TASK_KINDS.has(task.kind)) : []
      return this.tasks
    },
    async enqueue(input: Record<string, unknown>, { sourceElement = null, preparedFlight = null }: { sourceElement?: Element | null; preparedFlight?: (() => void) | null } = {}) {
      const playFlight = preparedFlight || prepareTaskFlight(sourceElement)
      const task = this.upsert(await invoke('background_task_enqueue', { input }))
      playFlight()
      this.notify(task, '已加入任务中心')
      this.dispatch()
      return task
    },
    dispatch() {
      const occupied = new Set(this.tasks.filter(task => ACTIVE.has(task.status)).map(task => task.resourceKey))
      let slots = Math.max(0, 2 - this.tasks.filter(task => task.status === 'running').length)
      for (const task of this.tasks.filter(item => item.status === 'queued').sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))) {
        if (!slots || occupied.has(task.resourceKey) || activeExecutions.has(task.id)) continue
        occupied.add(task.resourceKey)
        slots -= 1
        activeExecutions.set(task.id, true)
        this.execute(task).finally(() => { activeExecutions.delete(task.id); this.dispatch() })
      }
    },
    async transition(task: BackgroundTask, status: string, extra: Partial<Omit<CommandArgs<'background_task_transition'>['input'], 'id' | 'status'>> = {}) {
      const updated = await invoke('background_task_transition', { input: { id: task.id, status, ...extra } })
      return this.upsert(updated)
    },
    async execute(task: BackgroundTask) {
      try {
        task = await this.transition(task, 'running')
        if (!window.__TAURI_INTERNALS__) return this.executePreview(task)
        const channel = new Channel()
        channel.onmessage = event => {
          const streamEvent = event as TaskStreamEvent
          const next = (eventChains.get(task.id) || Promise.resolve()).then(() => this.handleEvent(task.id, streamEvent))
          eventChains.set(task.id, next)
          next.finally(() => { if (eventChains.get(task.id) === next) eventChains.delete(task.id) })
        }
        if (task.kind === 'image_generation') {
          const request = { ...task.payload.request, requestId: task.id } as CommandArgs<'image_generate'>['request']
          const result = await invoke('image_generate', { request })
          await this.complete(task.id, '', result)
        } else {
          const request = { ...task.payload.request, requestId: task.id } as CommandArgs<'note_ai_stream'>['request']
          await invoke('note_ai_stream', { request, onEvent: channel })
        }
      } catch (error) {
        await this.fail(task.id, error)
      }
    },
    async executePreview(task: BackgroundTask) {
      if (task.kind === 'image_generation') {
        try {
          const request = { ...task.payload.request, requestId: task.id } as CommandArgs<'image_generate'>['request']
          const result = await invoke('image_generate', { request })
          await this.complete(task.id, '', result)
        } catch (error) { await this.fail(task.id, error) }
        return
      }
      const content = task.payload.previewOutput || String(task.payload.request?.instruction || '浏览器预览任务已完成。')
      await this.transition(task, 'running', { outputDelta: content })
      await this.complete(task.id)
    },
    async handleEvent(id: string, event: TaskStreamEvent) {
      let task = this.tasks.find(item => item.id === id)
      if (!task || TERMINAL.has(task.status)) return
      try {
        if (event.type === 'delta' || event.type === 'textDelta') {
          task = await this.transition(task, 'running', { outputDelta: event.text || '' })
        } else if (event.type === 'sources') {
          task.payload.sources = event.sources || []
        } else if (event.type === 'editProposal') {
          task.payload.proposal = event.proposal
        } else if (event.type === 'completed') {
          await this.complete(id, event.content)
        } else if (event.type === 'cancelled') {
          await this.cancel(id, { skipRuntime: true })
        } else if (event.type === 'error') {
          await this.fail(id, event.message || event.code)
        }
      } catch (error) { await this.fail(id, error) }
    },
    async complete(id: string, fallbackContent = '', taskResult: JsonValue | ImageGenerateResult | null = null) {
      let task = this.tasks.find(item => item.id === id)
      if (!task || TERMINAL.has(task.status)) return task
      const content = task.output || fallbackContent || ''
      let result: JsonValue = {}
      if (task.kind === 'conversation_summary') {
        const html = sanitizeEditorHtml(String(marked.parse(content)))
        const note = await useNotesStore().createFromContent({ title: taskTitleFromMarkdown(content, task.payload.fallbackTitle), contentHtml: html, contentText: textFromEditorHtml(html), contentMarkdown: content })
        result = { noteId: note.id }
      } else if (task.kind === 'note_ai') {
        result = { noteId: task.targetNoteId || null, proposalId: task.payload.proposal?.id || null, content }
      } else if (task.kind === 'image_generation') {
        result = taskResult || task.payload.result || {}
      }
      task = await this.transition(task, 'succeeded', { result })
      this.notify(task, task.kind === 'conversation_summary' ? '总结笔记已生成' : task.kind === 'image_generation' ? '图片已生成' : '后台任务已完成')
      return task
    },
    async fail(id: string, error: unknown) {
      const task = this.tasks.find(item => item.id === id)
      if (!task || TERMINAL.has(task.status)) return task
      try {
        const errorCode = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'task_failed'
        const updated = await this.transition(task, 'failed', { errorCode, errorMessage: errorMessage(error) })
        this.notify(updated, '后台任务执行失败')
        return updated
      } catch { await this.refresh(); return this.tasks.find(item => item.id === id) }
    },
    async cancel(id: string, { skipRuntime = false }: { skipRuntime?: boolean } = {}) {
      const task = this.tasks.find(item => item.id === id)
      if (!task) return null
      if (!skipRuntime && task.status !== 'queued') {
        try { await invoke(task.kind === 'image_generation' ? 'image_cancel' : 'note_ai_cancel', { requestId: task.id }) } catch {}
      }
      try { return this.upsert(await invoke('background_task_cancel', { id })) }
      catch { await this.refresh(); return this.tasks.find(item => item.id === id) }
    },
    async retry(id: string) {
      const task = this.upsert(await invoke('background_task_retry', { id }))
      this.dispatch()
      return task
    },
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
