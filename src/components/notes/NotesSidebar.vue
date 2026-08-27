<script setup lang="ts">
import { ArrowDownAZ, BookOpen, Download, FileClock, FolderInput, FolderPlus, Pin, Plus, Search as SearchIcon, Trash2 } from 'lucide-vue-next'
import NotebookTreeItem from '../NotebookTreeItem.vue'
import type { NotesWorkspace } from '../../composables/useNotesWorkspace'

const props = defineProps<{ workspace: NotesWorkspace }>()
const workspace = props.workspace
const { t, store, library, route, showDeleted, searchMode, query, sidebarCollapsed, sidebarWidth, isResizing, onResizeStart, newNoteMenu, folderItemMenu, folderItemMenuStyle, importInput, expandedNotebookIds, externalSourcesOpen, notebookTree, list, create, createFromTemplate, importFiles, createRootNotebook, toggleNewNoteMenu, selectAllNotes, selectFolder, selectNote, toggleNotebook, toggleExternalSources, clearExternalSources, openExternalSource, openFolderItemMenu, closeMenus, closeContextMenu, restoreContextNote, deleteContextNote, renameNotebook, deleteNotebook, createChildNotebook, moveNotebookByPrompt, dropTreeNode, openContextMenu } = workspace
</script>

<template>
    <aside class="list-pane note-sidebar" :class="{ collapsed: sidebarCollapsed, 'is-resizing': isResizing }" :style="{ width: sidebarCollapsed ? '0px' : sidebarWidth + 'px' }" @selectstart.prevent>
      <div class="sidebar-inner">
        <div class="sidebar-topbar notebook-tree-toolbar">
          <button class="topbar-btn" :title="t('noteSidebarCollapse')" @click="sidebarCollapsed = true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          </button>
          <div class="topbar-actions">
            <div class="new-note-btn-group">
              <button class="new-note-main-btn" :title="t('newNote')" @click="create"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></button>
              <button class="new-note-dropdown-btn" :title="t('noteSidebarMoreOptions')" @click.stop="toggleNewNoteMenu"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>
              <div v-if="newNoteMenu" class="new-note-dropdown-menu">
                <button class="dropdown-item" @click="create(); newNoteMenu = false"><Plus :size="14" />{{ t('newNote') }}</button>
                <button v-for="template in store.templates" :key="template.id" class="dropdown-item" @click="createFromTemplate(template.id)"><Plus :size="14" />{{ template.name }}</button>
                <button class="dropdown-item" @click="importInput?.click(); newNoteMenu = false"><Download :size="14" />{{ t('importFiles') }}</button>
              </div>
              <input ref="importInput" type="file" multiple hidden accept=".md,.markdown,.txt" @change="importFiles" />
            </div>
            <button class="topbar-btn" title="新建根笔记本" @click="createRootNotebook"><FolderPlus :size="17" /></button>
            <button class="topbar-btn" title="按名称排序"><ArrowDownAZ :size="17" /></button>
            <button class="topbar-btn" :class="{ active: store.pinnedOnly }" title="只看置顶笔记" @click="store.pinnedOnly = !store.pinnedOnly"><Pin :size="16" /></button>
            <button class="topbar-btn" :title="t('search')" @click="searchMode = !searchMode"><SearchIcon :size="17" /></button>
          </div>
        </div>
        <div v-if="searchMode" class="sidebar-search notebook-tree-search">
          <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input v-model="query" class="search-input" autofocus placeholder="搜索笔记" @keydown.escape="searchMode = false; query = ''" />
        </div>
        <div class="notebook-tree" role="tree" aria-label="笔记本和笔记">
          <button class="tree-row tree-all-row" :class="{ active: store.selectedTreeNode.type === 'all' && !showDeleted }" @click="selectAllNotes">
            <BookOpen :size="16" :stroke-width="1.9" /><span class="tree-label">{{ t('allNotes') }}</span><small>{{ store.listed.length }}</small>
          </button>
          <NotebookTreeItem
            v-for="node in notebookTree"
            :key="node.id"
            :node="node"
            :expanded="expandedNotebookIds"
            :selected="store.selectedTreeNode"
            @toggle="toggleNotebook"
            @select-notebook="selectFolder"
            @select-note="selectNote"
            @notebook-menu="openFolderItemMenu"
            @note-menu="openContextMenu"
            @drop-node="dropTreeNode"
          />
          <div v-if="!notebookTree.length" class="note-list-empty">{{ query ? '没有匹配的笔记' : t('emptyNotes') }}</div>
          <div class="tree-row tree-external-row" :class="{ active: store.selectedTreeNode.type === 'external' }">
            <button type="button" class="tree-row-main" :aria-expanded="externalSourcesOpen" @click="toggleExternalSources">
              <FileClock :size="16" :stroke-width="1.9" /><span class="tree-label">外部来源</span>
            </button>
            <button v-if="store.externalSources.length" type="button" class="external-sources-clear" title="清空外部来源记录" aria-label="清空外部来源记录" @click.stop="clearExternalSources"><Trash2 :size="13" /></button>
            <small class="tree-external-count">{{ store.externalSources.length }}</small>
          </div>
          <div v-if="externalSourcesOpen" class="external-source-tree" role="group" aria-label="外部来源记录">
            <button v-for="source in store.externalSources" :key="source.id" type="button" class="tree-row tree-external-source" :class="{ active: store.selectedTreeNode.type === 'external-note' && store.selectedTreeNode.id === source.id, unavailable: !source.available }" :title="source.path" @click="openExternalSource(source)">
              <span class="external-source-status" aria-hidden="true"></span><span class="tree-label">{{ source.fileName }}</span>
            </button>
            <div v-if="!store.externalSources.length" class="external-source-empty">暂无外部打开记录</div>
          </div>
        </div>
        <div v-if="folderItemMenu" class="folder-item-menu notebook-context-menu" :style="folderItemMenuStyle" @click.stop>
          <button class="folder-item-menu-option" @click="createChildNotebook"><FolderPlus :size="13" />新建子笔记本</button>
          <button v-if="folderItemMenu.name !== '未分类'" class="folder-item-menu-option" @click="renameNotebook">重命名</button>
          <button v-if="folderItemMenu.name !== '未分类'" class="folder-item-menu-option" @click="moveNotebookByPrompt"><FolderInput :size="13" />移动</button>
          <button v-if="folderItemMenu.name !== '未分类'" class="folder-item-menu-option danger" @click="deleteNotebook"><Trash2 :size="12" />{{ t('delete') }}</button>
        </div>
      </div>
    </aside>
    <div v-if="!sidebarCollapsed" class="sidebar-resize-handle" @mousedown="onResizeStart"></div>
</template>
