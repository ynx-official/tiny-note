<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const username = ref('')
const password = ref('')
const remember = ref(true)
const canSubmit = computed(() => username.value.trim().length > 0 && password.value.length > 0 && !auth.busy)

async function submit() {
  if (!canSubmit.value || !await auth.signIn(username.value.trim(), password.value, remember.value)) return
  const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/home'
  await router.replace(redirect)
}
</script>

<template>
  <main class="login-page">
    <section class="login-card" aria-labelledby="login-title">
      <div class="brand-mark" aria-hidden="true">T</div>
      <p class="eyebrow">TINY NOTE</p>
      <h1 id="login-title">登录到你的工作区</h1>
      <p class="description">笔记、知识库和 AI 工作流将安全地保存在你的云端账户中。</p>
      <form @submit.prevent="submit">
        <label>用户名<input v-model="username" name="username" autocomplete="username" autofocus /></label>
        <label>密码<input v-model="password" name="password" type="password" autocomplete="current-password" /></label>
        <label class="remember"><input v-model="remember" type="checkbox" />在此设备保持登录</label>
        <p v-if="auth.error" class="error" role="alert">{{ auth.error }}</p>
        <p v-else-if="!auth.secureStorageAvailable" class="notice">系统安全凭据库不可用，本次登录不会被保存。</p>
        <button type="submit" :disabled="!canSubmit">{{ auth.busy ? '正在登录…' : '登录' }}</button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.login-page { min-height: 100vh; display: grid; place-items: center; padding: 32px; color: var(--friday-text-primary, #202124); background: radial-gradient(circle at 20% 10%, rgba(238, 242, 255, .8), transparent 36%), var(--friday-bg-app, #f5f5f5); }
.login-card { width: min(420px, 100%); padding: 40px; border: 1px solid var(--friday-border-subtle, #e5e5e5); border-radius: 18px; background: var(--friday-bg-panel, #fff); box-shadow: 0 18px 55px rgba(20, 24, 40, .1); }
.brand-mark { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 12px; color: #fff; background: #222; font: 700 20px/1 ui-sans-serif; }
.eyebrow { margin: 22px 0 8px; color: var(--friday-text-tertiary, #777); font-size: 11px; font-weight: 700; letter-spacing: .14em; }
h1 { margin: 0; font-size: 26px; letter-spacing: -.02em; }
.description { margin: 10px 0 28px; color: var(--friday-text-secondary, #666); font-size: 14px; line-height: 1.6; }
form { display: grid; gap: 17px; }
label { display: grid; gap: 7px; color: var(--friday-text-secondary, #555); font-size: 13px; font-weight: 600; }
input[type="text"], input[type="password"], input:not([type]) { height: 42px; padding: 0 12px; border: 1px solid var(--friday-border-default, #d9d9d9); border-radius: 9px; outline: none; color: inherit; background: transparent; font: inherit; }
input:focus { border-color: #6b7280; box-shadow: 0 0 0 3px rgba(107, 114, 128, .12); }
.remember { display: flex; grid-template-columns: auto 1fr; align-items: center; gap: 8px; font-weight: 500; }
.error, .notice { margin: -4px 0 0; font-size: 12px; line-height: 1.45; }
.error { color: #b42318; }.notice { color: #8a5b00; }
button { height: 43px; border: 0; border-radius: 9px; color: #fff; background: #222; font-weight: 650; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
@media (max-width: 560px) { .login-page { padding: 16px; }.login-card { padding: 28px 24px; } }
</style>
