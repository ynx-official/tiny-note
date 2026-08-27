<script lang="ts">
import { defineComponent } from 'vue'
import NotesSidebar from '../components/notes/NotesSidebar.vue'
import NoteContextMenus from '../components/notes/NoteContextMenus.vue'
import NoteTableOfContents from '../components/notes/NoteTableOfContents.vue'
import NoteWorkspace from '../components/notes/NoteWorkspace.vue'
import { useNotesWorkspace } from '../composables/useNotesWorkspace'

export default defineComponent({
  name: 'NotesView',
  components: { NotesSidebar, NoteContextMenus, NoteTableOfContents, NoteWorkspace },
  setup() {
    const workspace = useNotesWorkspace()
    return { workspace }
  }
})
</script>

<template>
  <div class="notes-layout note-page" @click="workspace.closeMenus" @contextmenu.prevent="workspace.closeMenus" @keydown.esc="workspace.closeMenus">
    <NotesSidebar :workspace="workspace" />
    <NoteContextMenus :workspace="workspace" />
    <NoteTableOfContents :workspace="workspace" />
    <NoteWorkspace :workspace="workspace" />
  </div>
</template>
