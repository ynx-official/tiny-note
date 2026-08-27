import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { messages } from './i18n'
import TrayTodoPanel from './components/TrayTodoPanel.vue'
import './styles/tray.css'

const cachedLanguage = localStorage.getItem('tiny-note-language') || 'zh-CN'
const cachedTheme = localStorage.getItem('tiny-note-theme')
if (cachedTheme === 'dark' || cachedTheme === 'light') document.documentElement.dataset.theme = cachedTheme

const i18n = createI18n({
  legacy: false,
  locale: cachedLanguage,
  fallbackLocale: 'en',
  messages
})

createApp(TrayTodoPanel)
  .use(createPinia())
  .use(i18n)
  .mount('#app')

document.documentElement.dataset.startupState = 'ready'
