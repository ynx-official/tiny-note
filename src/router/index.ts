import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import { getAuthSnapshot, restoreAuthSession, subscribeAuth } from '../services/apiClient'

const lazyView = <T>(styles: () => Promise<unknown>, view: () => Promise<T>) => async () => {
  await styles()
  return view()
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', redirect: to => ({ path: '/home', query: { login: '1', ...(typeof to.query.redirect === 'string' ? { redirect: to.query.redirect } : {}) } }) },
    { path: '/', component: HomeView },
    { path: '/home', component: HomeView },
    { path: '/chat', component: lazyView(() => import('../styles/chat.css'), () => import('../views/ChatView.vue')), meta: { requiresAuth: true } },
    { path: '/notes', component: lazyView(() => import('../styles/notes.css'), () => import('../views/NotesView.vue')), meta: { requiresAuth: true } },
    { path: '/library', component: lazyView(() => import('../styles/library.css'), () => import('../views/LibraryView.vue')), meta: { requiresAuth: true } },
    { path: '/tags', component: () => import('../views/TagsView.vue'), meta: { requiresAuth: true } },
    { path: '/calendar', component: () => import('../views/CalendarView.vue'), meta: { requiresAuth: true } },
    { path: '/calendar/:id', component: () => import('../views/CalendarEventDetailView.vue'), meta: { requiresAuth: true } },
    { path: '/todos', component: () => import('../views/TodosView.vue'), meta: { requiresAuth: true } },
    { path: '/images', component: lazyView(() => import('../styles/images.css'), () => import('../views/ImageGenerationView.vue')), meta: { requiresAuth: true } },
    { path: '/tasks', component: lazyView(() => import('../styles/tasks.css'), () => import('../views/TasksView.vue')), meta: { requiresAuth: true } },
    { path: '/settings', component: lazyView(() => import('../styles/settings.css'), () => import('../views/SettingsView.vue')), meta: { requiresAuth: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

router.beforeEach(async to => {
  if (to.meta.requiresAuth && !getAuthSnapshot().authenticated) await restoreAuthSession()
  if (!getAuthSnapshot().authenticated && to.meta.requiresAuth) return { path: '/home', query: { login: '1', redirect: to.fullPath } }
  return true
})

subscribeAuth(() => {
  const current = router.currentRoute.value
  if (!getAuthSnapshot().authenticated && current.meta.requiresAuth === true) {
    void router.replace({ path: '/home', query: { login: '1', redirect: current.fullPath, reason: 'expired' } })
  }
})

export default router
