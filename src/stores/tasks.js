import { defineStore } from 'pinia'
import { Channel } from '@tauri-apps/api/core'
import { marked } from 'marked'
import { invoke } from '../services/tauri'
import { useNotesStore } from './notes'
import { sanitizeEditorHtml, textFromEditorHtml } from '../utils/noteMarkdown'
import { prepareTaskFlight } from '../utils/taskFlight'

const activeExecutions = new Map()
const eventChains = new Map()
const ACTIVE = new Set(['running', 'awaiting_approval', 'awaiting_input'])
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'interrupted'])
const TASK_KINDS = new Set(['conversation_summary', 'note_ai'])
let initialization = null

function errorMessage(error, fallback = '后台任务执行失败') {
  return (typeof error === 'string' && error.trim()) || error?.message || error?.code || fallback
}

function taskTitleFromMarkdown(markdown, fallback) {
  return (String(markdown || '').match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim() || fallback || '对话总结').slice(0, 80)
}
function readTaskIds() { try { const value = JSON.parse(localStorage.getItem('tiny-note-read-tasks') || '[]'); return Array.isArray(value) ? value : [] } catch { return [] } }

export const useTasksStore = defineStore('tasks', {
  state: () => ({ tasks: [], initialized: false, loading: false, error: '', notices: [], readTaskIds: readTaskIds() }),
  getters: {
    attentionCount: state => state.tasks.filter(Boolean).filter(task => ['awaiting_approval', 'awaiting_input', 'failed'].includes(task.status) || (task.status === 'succeeded' && !state.readTaskIds.includes(task.id))).length,
    runningCount: state => state.tasks.filter(Boolean).filter(task => ['queued', 'running'].includes(task.status)).length,
    waitingCount: state => state.tasks.filter(Boolean).filter(task => ['awaiting_approval', 'awaiting_input'].includes(task.status)).length,
    failedCount: state => {
      const retried = new Set(state.tasks.filter(Boolean).map(task => task.retryOf).filter(Boolean))
      return state.tasks.filter(Boolean).filter(task => ['failed', 'interrupted'].includes(task.status) && !retried.has(task.id)).length
    },
    succeededCount: state => state.tasks.filter(Boolean).filter(task => task.status === 'succeeded').length,
    unreadSucceededCount: state => state.tasks.filter(Boolean).filter(task => task.status === 'succeeded' && !state.readTaskIds.includes(task.id)).length,
    activeSummaryForConversation: state => conversationId => state.tasks.filter(Boolean).find(task => task.kind === 'conversation_summary' && task.conversationId === conversationId && ['queued', 'running'].includes(task.status))
  },
  actions: {
    upsert(task) {
      const index = this.tasks.findIndex(item => item.id === task.id)
      if (index >= 0) this.tasks[index] = { ...this.tasks[index], ...task }
      else this.tasks.unshift(task)
      window.dispatchEvent(new window.CustomEvent('tiny-note-task-updated', { detail: task }))
      if (TERMINAL.has(task.status)) window.queueMicrotask(() => this.dispatch())
      return task
    },
    async initialize({ force = false } = {}) {
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
    async enqueue(input, { sourceElement = null, preparedFlight = null } = {}) {
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
    async transition(task, status, extra = {}) {
      const updated = await invoke('background_task_transition', { input: { id: task.id, status, ...extra } })
      return this.upsert(updated)
    },
    async execute(task) {
      try {
        task = await this.transition(task, 'running')
        if (!window.__TAURI_INTERNALS__) return this.executePreview(task)
        const channel = new Channel()
        channel.onmessage = event => {
          const next = (eventChains.get(task.id) || Promise.resolve()).then(() => this.handleEvent(task.id, event))
          eventChains.set(task.id, next)
          next.finally(() => { if (eventChains.get(task.id) === next) eventChains.delete(task.id) })
        }
        await invoke('note_ai_stream', { request: { ...task.payload.request, requestId: task.id }, onEvent: channel })
      } catch (error) {
        await this.fail(task.id, error)
      }
    },
    async executePreview(task) {
      const content = task.payload.previewOutput || task.payload.request?.instruction || '浏览器预览任务已完成。'
      await this.transition(task, 'running', { outputDelta: content })
      await this.complete(task.id)
    },
    async handleEvent(id, event) {
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
    async complete(id, fallbackContent = '') {
      let task = this.tasks.find(item => item.id === id)
      if (!task || TERMINAL.has(task.status)) return task
      const content = task.output || fallbackContent || ''
      let result = {}
      if (task.kind === 'conversation_summary') {
        const html = sanitizeEditorHtml(marked.parse(content))
        const note = await useNotesStore().createFromContent({ title: taskTitleFromMarkdown(content, task.payload.fallbackTitle), contentHtml: html, contentText: textFromEditorHtml(html), contentMarkdown: content })
        result = { noteId: note.id }
      } else if (task.kind === 'note_ai') {
        result = { noteId: task.targetNoteId || null, proposalId: task.payload.proposal?.id || null, content }
      }
      task = await this.transition(task, 'succeeded', { result })
      this.notify(task, task.kind === 'conversation_summary' ? '总结笔记已生成' : '后台任务已完成')
      return task
    },
    async fail(id, error) {
      const task = this.tasks.find(item => item.id === id)
      if (!task || TERMINAL.has(task.status)) return task
      try {
        const updated = await this.transition(task, 'failed', { errorCode: error?.code || 'task_failed', errorMessage: errorMessage(error) })
        this.notify(updated, '后台任务执行失败')
        return updated
      } catch { await this.refresh(); return this.tasks.find(item => item.id === id) }
    },
    async cancel(id, { skipRuntime = false } = {}) {
      const task = this.tasks.find(item => item.id === id)
      if (!task) return null
      if (!skipRuntime && task.status !== 'queued') {
        try { await invoke('note_ai_cancel', { requestId: task.id }) } catch {}
      }
      try { return this.upsert(await invoke('background_task_cancel', { id })) }
      catch { await this.refresh(); return this.tasks.find(item => item.id === id) }
    },
    async retry(id) {
      const task = this.upsert(await invoke('background_task_retry', { id }))
      this.dispatch()
      return task
    },
    async clearFinished() {
      const removed = await invoke('background_task_clear_finished')
      await this.refresh()
      const notice = { id: crypto.randomUUID(), taskId: null, message: removed ? `已清理 ${removed} 条任务记录` : '没有可清理的已结束任务', tone: removed ? 'success' : 'info', createdAt: Date.now() }
      this.notices.push(notice)
      window.setTimeout(() => { this.notices = this.notices.filter(item => item.id !== notice.id) }, 5000)
      return removed
    },
    notify(task, message) {
      const tone = task.status === 'succeeded' ? 'success' : task.status === 'failed' ? 'error' : 'info'
      const notice = { id: crypto.randomUUID(), taskId: task.id, message, tone, createdAt: Date.now() }
      this.notices.push(notice)
      window.setTimeout(() => { this.notices = this.notices.filter(item => item.id !== notice.id) }, 5000)
    },
    dismissNotice(id) { this.notices = this.notices.filter(item => item.id !== id) },
    markResultsSeen() {
      this.readTaskIds = [...new Set([...this.readTaskIds, ...this.tasks.filter(task => task?.status === 'succeeded').map(task => task.id)])].slice(-500)
      localStorage.setItem('tiny-note-read-tasks', JSON.stringify(this.readTaskIds))
    }
  }
})
