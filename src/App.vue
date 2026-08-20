<script setup>
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useNotesStore } from './stores/notes'
import { useLibraryStore } from './stores/library'
import AppShell from './components/AppShell.vue'

const route = useRoute(); const { locale } = useI18n(); const notes = useNotesStore(); const library = useLibraryStore()
const active = computed(() => route.path === '/' || route.path.startsWith('/home') ? 'home' : route.path.startsWith('/library') ? 'library' : route.path.startsWith('/settings') ? 'settings' : 'notes')
onMounted(async () => { await notes.load(); await library.load(); const saved = localStorage.getItem('tiny-note-theme'); if (saved) document.documentElement.dataset.theme = saved })
watch(locale, value => localStorage.setItem('tiny-note-language', value))
</script>
<template><AppShell :active="active"><router-view /></AppShell></template>
