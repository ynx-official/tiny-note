import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { messages } from './i18n'
import { bootstrapMainWindow as runMainWindowBootstrap } from './bootstrap'
import './styles/friday-main.css'
import './styles/startup.css'

const cachedLanguage = localStorage.getItem('tiny-note-language') || 'zh-CN'
const cachedTheme = localStorage.getItem('tiny-note-theme')
if (cachedTheme === 'dark' || cachedTheme === 'light') {
  document.documentElement.dataset.theme = cachedTheme
}

const i18n = createI18n({
  legacy: false,
  locale: cachedLanguage,
  fallbackLocale: 'en',
  messages
})
const pinia = createPinia()

async function bootstrapMainWindow() {
  const [appModule, routerModule, appStoreModule, externalMarkdownModule] = await Promise.all([
    import('./App.vue'),
    import('./router'),
    import('./stores/app'),
    import('./services/externalMarkdown')
  ])
  const router = routerModule.default
  const app = createApp(appModule.default).use(pinia).use(router).use(i18n)

  const appStore = appStoreModule.useAppStore(pinia)
  const bootShell = document.querySelector<HTMLElement>('.boot-shell')
  if (bootShell) {
    bootShell.classList.add('is-ready')
    await new Promise(resolve => window.setTimeout(resolve, 360))
  }
  void runMainWindowBootstrap({
    mountShell: () => app.mount('#app'),
    hydrate: async () => {
      await appStore.initialize()
      i18n.global.locale.value = appStore.settings.language === 'en' ? 'en' : 'zh-CN'
      localStorage.setItem('tiny-note-language', appStore.settings.language)
    },
    startDeferredServices: () => externalMarkdownModule.startExternalMarkdownOpen({ pinia, router })
  })
}

void bootstrapMainWindow()
