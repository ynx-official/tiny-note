import { createRouter, createWebHashHistory } from 'vue-router'
import NotesView from '../views/NotesView.vue'
import LibraryView from '../views/LibraryView.vue'
import SettingsView from '../views/SettingsView.vue'
import HomeView from '../views/HomeView.vue'
import ChatView from '../views/ChatView.vue'

export default createRouter({ history: createWebHashHistory(), routes: [
  { path: '/', component: HomeView }, { path: '/home', component: HomeView }, { path: '/chat', component: ChatView }, { path: '/notes', component: NotesView }, { path: '/library', component: LibraryView }, { path: '/settings', component: SettingsView }, { path: '/:pathMatch(.*)*', redirect: '/' }
] })
