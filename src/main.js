import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import App from './App.vue'
import router from './router'
import { messages } from './i18n'
import { applyCachedTheme, useAppStore } from './stores/app'
import { startExternalMarkdownOpen } from './services/externalMarkdown'
import './styles/friday-main.css'
import './styles.css'

applyCachedTheme()
const i18n = createI18n({ legacy: false, locale: localStorage.getItem('tiny-note-language') || 'zh-CN', fallbackLocale: 'en', messages })
const pinia = createPinia()
const app = createApp(App).use(pinia).use(router).use(i18n)

async function bootstrap() {
  const appStore = useAppStore(pinia)
  await appStore.initialize()
  i18n.global.locale.value = appStore.settings.language
  localStorage.setItem('tiny-note-language', appStore.settings.language)
  app.mount('#app')
  await startExternalMarkdownOpen({ pinia, router })
}

bootstrap()
