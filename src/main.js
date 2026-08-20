import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import App from './App.vue'
import router from './router'
import { messages } from './i18n'
import './styles/friday-main.css'
import './styles.css'

const i18n = createI18n({ legacy: false, locale: localStorage.getItem('tiny-note-language') || 'zh-CN', fallbackLocale: 'en', messages })
createApp(App).use(createPinia()).use(router).use(i18n).mount('#app')
