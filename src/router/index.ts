import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import { getAuthSnapshot, subscribeAuth } from '../services/apiClient'

const lazyView = <T>(styles: () => Promise<unknown>, view: () => Promise<T>) => async () => {
  await styles()
  return view()
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: () => import('../views/LoginView.vue'), meta: { public: true } },
    { path: '/', component: HomeView },
    { path: '/home', component: HomeView },
    { path: '/chat', component: lazyView(() => import('../styles/chat.css'), () => import('../views/ChatView.vue')) },
    { path: '/notes', component: lazyView(() => import('../styles/notes.css'), () => import('../views/NotesView.vue')) },
    { path: '/library', component: lazyView(() => import('../styles/library.css'), () => import('../views/LibraryView.vue')) },
    { path: '/tags', component: () => import('../views/TagsView.vue') },
    { path: '/calendar', component: () => import('../views/CalendarView.vue') },
    { path: '/calendar/:id', component: () => import('../views/CalendarEventDetailView.vue') },
    { path: '/todos', component: () => import('../views/TodosView.vue') },
    { path: '/images', component: lazyView(() => import('../styles/images.css'), () => import('../views/ImageGenerationView.vue')) },
    { path: '/tasks', component: lazyView(() => import('../styles/tasks.css'), () => import('../views/TasksView.vue')) },
    { path: '/settings', component: lazyView(() => import('../styles/settings.css'), () => import('../views/SettingsView.vue')) },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

router.beforeEach(to => {
  const authenticated = getAuthSnapshot().authenticated
  if (to.meta.public) return authenticated && to.path === '/login' ? '/home' : true
  if (!authenticated) return { path: '/login', query: { redirect: to.fullPath } }
  return true
})

subscribeAuth(() => {
  const current = router.currentRoute.value
  if (!getAuthSnapshot().authenticated && current.meta.public !== true) {
    void router.replace({ path: '/login', query: { redirect: current.fullPath } })
  }
})

export default router
