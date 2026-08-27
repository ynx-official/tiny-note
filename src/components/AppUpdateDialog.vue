<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { Download, RefreshCw, Sparkles, X } from 'lucide-vue-next'
import { appUpdater, UPDATE_CHECK_INTERVAL_MS, UPDATE_RETRY_INTERVAL_MS } from '../services/appUpdater'
import { errorMessage } from '../types/domain'
import { renderMarkdown } from '../utils/markdown'

const visible = ref(false)
const checking = ref(false)
const installing = ref(false)
const progress = ref<number | null>(null)
const info = ref<Awaited<ReturnType<typeof appUpdater.check>> | null>(null)
const error = ref('')
const dialogRef = ref<HTMLElement | null>(null)
let autoCheckTimer: number | null = null
const renderedNotes = computed(() => renderMarkdown(info.value?.body || ''))

function isChinese() { return (localStorage.getItem('tiny-note-language') || 'zh-CN') !== 'en' }
function close() { if (!installing.value) visible.value = false }

async function checkForUpdates({ force = true, openWhenAvailable = true } = {}) {
  if (checking.value || installing.value) return
  checking.value = true
  error.value = ''
  try {
    const result = await appUpdater.check({ force })
    if (result.skipped) return
    if (result.available) {
      info.value = result
      if (openWhenAvailable) visible.value = true
      await nextTick()
      dialogRef.value?.focus()
    }
    return result
  } catch (reason) {
    error.value = errorMessage(reason, isChinese() ? '检查更新失败，请稍后重试。' : 'Unable to check for updates.')
    return { failed: true }
  } finally {
    checking.value = false
  }
}

function scheduleAutomaticCheck(delay: number) {
  if (autoCheckTimer != null) window.clearTimeout(autoCheckTimer)
  autoCheckTimer = window.setTimeout(runAutomaticCheck, Math.max(1000, delay))
}

async function runAutomaticCheck() {
  const result = await checkForUpdates({ force: false })
  const nextDelay = result?.failed
    ? UPDATE_RETRY_INTERVAL_MS
    : (result && 'retryAfterMs' in result ? result.retryAfterMs : UPDATE_CHECK_INTERVAL_MS)
  scheduleAutomaticCheck(nextDelay ?? UPDATE_CHECK_INTERVAL_MS)
}

async function install() {
  if (!info.value || installing.value) return
  installing.value = true
  progress.value = 0
  error.value = ''
  try {
    await appUpdater.downloadAndInstall(value => { progress.value = value })
    visible.value = false
  } catch (reason) {
    error.value = errorMessage(reason, isChinese() ? '更新安装失败，请稍后重试。' : 'Unable to install the update.')
  } finally {
    installing.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  scheduleAutomaticCheck(2200)
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  if (autoCheckTimer != null) window.clearTimeout(autoCheckTimer)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="app-update-fade">
      <div v-if="visible" class="app-update-overlay" @click.self="close">
        <section ref="dialogRef" class="app-update-dialog" role="dialog" aria-modal="true" aria-labelledby="app-update-title" tabindex="-1">
          <header class="app-update-header">
            <div class="app-update-heading"><span class="app-update-orbit" aria-hidden="true"><Sparkles :size="18" /></span><div><small>{{ isChinese() ? 'TINY NOTE · SOFTWARE UPDATE' : 'TINY NOTE · SOFTWARE UPDATE' }}</small><strong id="app-update-title">{{ isChinese() ? '有一个新版本准备好了' : 'A new version is ready' }}</strong></div></div>
            <button type="button" class="app-update-close" aria-label="关闭" :disabled="installing" @click="close"><X :size="18" /></button>
          </header>
          <div class="app-update-body">
            <div class="app-update-version"><span>{{ isChinese() ? '最新版本' : 'Latest version' }}</span><strong>v{{ info?.version }}</strong></div>
            <div v-if="info?.body" class="app-update-notes" v-html="renderedNotes"></div>
            <div v-if="installing" class="app-update-progress" role="status"><div class="app-update-progress-track"><i :style="{ width: `${progress ?? 18}%` }"></i></div><span>{{ progress === 100 ? (isChinese() ? '安装包已打开' : 'Installer opened') : (isChinese() ? '正在准备更新…' : 'Preparing update…') }}</span></div>
            <p v-if="error" class="app-update-error" role="alert">{{ error }}</p>
            <p v-else class="app-update-hint">{{ isChinese() ? '更新包会先进行 SHA-256 校验，然后打开系统安装程序。' : 'The package is verified with SHA-256 before the installer opens.' }}</p>
          </div>
          <footer class="app-update-actions"><button type="button" class="app-update-later" :disabled="installing" @click="close">{{ isChinese() ? '稍后提醒' : 'Later' }}</button><button type="button" class="app-update-install" :disabled="installing" @click="install"><RefreshCw v-if="installing" :size="15" class="app-update-spin" /><Download v-else :size="15" />{{ installing ? (progress == null ? (isChinese() ? '更新中…' : 'Updating…') : `${progress}%`) : (isChinese() ? '下载并安装' : 'Download and install') }}</button></footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
