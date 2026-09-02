<script setup lang="ts">
import { computed, ref } from 'vue'
import { LogIn, LogOut, ShieldCheck, X } from 'lucide-vue-next'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'

const emit = defineEmits(['close', 'signed-in', 'signed-out'])
const auth = useAuthStore()
const appStore = useAppStore()
const username = ref('')
const password = ref('')
const remember = ref(true)
const canSubmit = computed(() => username.value.trim().length > 0 && password.value.length > 0 && !auth.busy)
const displayName = computed(() => auth.user?.nickname || auth.user?.username || 'Tiny Note 用户')

async function submit() {
  if (!canSubmit.value) return
  const signedIn = await auth.signIn(username.value.trim(), password.value, remember.value)
  if (!signedIn) return
  await appStore.initialize({ force: true })
  password.value = ''
  emit('signed-in')
}

async function signOut() {
  await auth.signOut()
  emit('signed-out')
}
</script>

<template>
  <section class="assistant-panel account-panel" aria-labelledby="account-panel-title">
    <header class="assistant-panel-header">
      <div><h2 id="account-panel-title">账号</h2><small>{{ auth.authenticated ? '当前工作区账户' : '登录后同步云端工作区' }}</small></div>
      <button class="assistant-close" type="button" aria-label="关闭" @click="emit('close')"><X :size="16" /></button>
    </header>

    <div v-if="auth.authenticated" class="assistant-panel-body account-profile-body">
      <div class="account-profile-card">
        <span class="account-dog-avatar" aria-hidden="true">🐶</span>
        <div><strong>{{ displayName }}</strong><small>@{{ auth.user?.username }}</small></div>
        <span class="account-online"><i></i>已登录</span>
      </div>
      <div class="account-security-note"><ShieldCheck :size="17" /><div><strong>设备会话已受保护</strong><p>访问令牌保存在系统安全凭据库中，设备摘要不包含主机名、MAC 地址或硬件序列号。</p></div></div>
      <button class="account-signout" type="button" :disabled="auth.busy" @click="signOut"><LogOut :size="15" />{{ auth.busy ? '正在退出…' : '退出登录' }}</button>
    </div>

    <div v-else class="assistant-panel-body account-login-body">
      <div class="account-login-intro">
        <span class="account-dog-avatar" aria-hidden="true">🐶</span>
        <div><strong>登录 Tiny Note</strong><p>登录后即可打开笔记、知识库和 Tiny Agent。启动应用不再强制登录。</p></div>
      </div>
      <form class="account-login-form" @submit.prevent="submit">
        <label><span>用户名</span><input v-model="username" name="username" autocomplete="username" autofocus /></label>
        <label><span>密码</span><input v-model="password" name="password" type="password" autocomplete="current-password" /></label>
        <label class="account-remember"><input v-model="remember" type="checkbox" /><span>在此设备保持登录</span></label>
        <p v-if="auth.error" class="account-message is-error" role="alert">{{ auth.error }}</p>
        <p v-else-if="!auth.secureStorageAvailable" class="account-message">系统安全凭据库不可用，本次登录不会被保存。</p>
        <button class="account-submit" type="submit" :disabled="!canSubmit"><LogIn :size="16" />{{ auth.busy ? '正在登录…' : '登录' }}</button>
      </form>
      <p class="account-privacy">登录接口只提交用户名和密码；token 签发后再独立上报本设备摘要。</p>
    </div>
  </section>
</template>
