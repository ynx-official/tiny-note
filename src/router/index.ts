import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const lazyView = <T>(styles: () => Promise<unknown>, view: () => Promise<T>) => async () => {
  await styles()
  return view()
}

const loadChat = lazyView(() => import('../styles/chat.css'), () => import('../views/ChatView.vue'))
const loadNotes = lazyView(() => import('../styles/notes.css'), () => import('../views/NotesView.vue'))
const loadLibrary = lazyView(() => import('../styles/library.css'), () => import('../views/LibraryView.vue'))
const loadTags = () => import('../views/TagsView.vue')
const loadCalendar = () => import('../views/CalendarView.vue')
const loadCalendarDetail = () => import('../views/CalendarEventDetailView.vue')
const loadTodos = () => import('../views/TodosView.vue')
const loadImages = lazyView(() => import('../styles/images.css'), () => import('../views/ImageGenerationView.vue'))
const loadTasks = lazyView(() => import('../styles/tasks.css'), () => import('../views/TasksView.vue'))
const loadSettings = lazyView(() => import('../styles/settings.css'), () => import('../views/SettingsView.vue'))

/** Preload route code after the first screen is idle so tab switches stay responsive. */
export function preloadWorkspaceRoutes(): Promise<PromiseSettledResult<unknown>[]> {
  return Promise.allSettled([
    loadChat(), loadNotes(), loadLibrary(), loadTags(), loadCalendar(),
    loadCalendarDetail(), loadTodos(), loadImages(), loadTasks(), loadSettings()
  ])
}

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/home', component: HomeView },
    { path: '/chat', component: loadChat },
    { path: '/notes', component: loadNotes },
    { path: '/library', component: loadLibrary },
    { path: '/tags', component: loadTags },
    { path: '/calendar', component: loadCalendar },
    { path: '/calendar/:id', component: loadCalendarDetail },
    { path: '/todos', component: loadTodos },
    { path: '/images', component: loadImages },
    { path: '/tasks', component: loadTasks },
    { path: '/settings', component: loadSettings },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})
