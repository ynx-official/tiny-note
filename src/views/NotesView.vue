<script setup lang="ts">
import NotesSidebar from '../components/notes/NotesSidebar.vue'
import NoteContextMenus from '../components/notes/NoteContextMenus.vue'
import NoteTableOfContents from '../components/notes/NoteTableOfContents.vue'
import NoteWorkspace from '../components/notes/NoteWorkspace.vue'
import { useNotesWorkspace } from '../composables/useNotesWorkspace'

const workspace = useNotesWorkspace()
const { store, library, tagsStore, route, router, t, showDeleted, searchMode, query, sidebarCollapsed, sidebarWidth, isResizing, onResizeStart, newNoteMenu, folderItemMenu, folderItemMenuStyle, importInput, noteEditorRef, tocVisible, contextMenu, contextMoveOpen, contextMenuRef, contextMoveAnchorRef, contextMoveSubmenuRef, contextMoveStyle, contextKnowledgeOpen, contextTagsOpen, contextTagIds, contextKnowledgeAnchorRef, contextKnowledgeSubmenuRef, contextKnowledgeStyle, contextMoveTimer, contextKnowledgeTimer, expandedNotebookIds, externalSourcesOpen, list, contextNote, notebookTree, knowledgeGroups, creatingFromQuery, createFromQuery, openRoutedNote, clearReviewedProposal, create, createFromTemplate, togglePinned, remove, importExternalNote, toggleExternalSources, openExternalSource, clearExternalSources, importFiles, toggleNewNoteMenu, closeMenus, selectFolder, selectAllNotes, selectNote, toggleNotebook, createRootNotebook, openFolderItemMenu, renameNotebook, deleteNotebook, createChildNotebook, moveNotebookByPrompt, dropTreeNode, closeContextMenu, openContextMenu, toggleContextTag, createContextTag, duplicateContextNote, showMoveSubmenu, hideMoveSubmenu, cancelHideMoveSubmenu, showKnowledgeSubmenu, hideKnowledgeSubmenu, cancelHideKnowledgeSubmenu, positionKnowledgeSubmenu, addContextNoteToKnowledge, createKnowledgeBaseForContext, positionMoveSubmenu, createNotebookForContext, moveContextNote, deleteContextNote, restoreContextNote, tocHeadings, toggleToc, closeToc, scrollToHeading } = workspace
</script>

<template>
  <div class="notes-layout note-page" @click="workspace.closeMenus" @contextmenu.prevent="workspace.closeMenus" @keydown.esc="workspace.closeMenus">
    <NotesSidebar :workspace="workspace" />
    <NoteContextMenus :workspace="workspace" />
    <NoteTableOfContents :workspace="workspace" />
    <NoteWorkspace :workspace="workspace" />
  </div>
</template>
