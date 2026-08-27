<script setup lang="ts">
import { ChevronDown, List, MoreHorizontal, Plus, Trash2, X } from 'lucide-vue-next'
import type { TodosWorkspace } from '../../composables/useTodosWorkspace'

const { workspace } = defineProps<{ workspace: TodosWorkspace }>()
const {
  store, t, navOpen, navItems, activeListId, filter, changeFilter, listsCollapsed,
  listMenuId, openListDialog, changeList, deleteList, completedNav
} = workspace
</script>

<template>
  <button v-if="navOpen" class="todo-nav-backdrop" :aria-label="t('close')" @click="navOpen = false"></button>
  <aside class="todo-smart-lists" :class="{ open: navOpen }">
    <header><List :size="20" /><strong>{{ t('todos') }}</strong><button class="nav-close" :aria-label="t('close')" @click="navOpen = false"><X :size="18" /></button></header>
    <nav class="smart-nav">
      <button v-for="item in navItems" :key="item.key" :class="{ active: !activeListId && filter === item.key }" @click="changeFilter(item.key)"><component :is="item.icon" :size="18" /><span>{{ item.label }}</span><small>{{ item.count }}</small></button>
    </nav>
    <section class="custom-lists-section">
      <header>
        <button type="button" class="custom-lists-toggle" :aria-expanded="!listsCollapsed" :aria-label="listsCollapsed ? t('todoListsExpand') : t('todoListsCollapse')" @click="listsCollapsed = !listsCollapsed"><ChevronDown :size="15" :class="{ collapsed: listsCollapsed }" /><span>{{ t('todoLists') }}</span></button>
        <button type="button" class="custom-list-add" :aria-label="t('todoListAdd')" @click="openListDialog()"><Plus :size="17" /></button>
      </header>
      <div v-if="!listsCollapsed" class="custom-list-rows">
        <div v-for="item in store.lists" :key="item.id" class="todo-list-row-wrap" :class="{ active: activeListId === item.id }">
          <button type="button" class="custom-list-row" @click="changeList(item)"><span class="custom-list-icon" :style="{ '--list-color': item.color }"><List :size="15" /></span><span>{{ item.name }}</span><small>{{ store.activeCountForList(item.id) }}</small></button>
          <button type="button" class="custom-list-more" :aria-label="`${item.name} ${t('todoListMore')}`" :aria-expanded="listMenuId === item.id" @click.stop="listMenuId = listMenuId === item.id ? '' : item.id"><MoreHorizontal :size="16" /></button>
          <div v-if="listMenuId === item.id" class="custom-list-menu" role="menu">
            <button type="button" role="menuitem" @click="openListDialog(item)">{{ t('todoListEdit') }}</button>
            <button type="button" class="danger" role="menuitem" @click="deleteList(item)"><Trash2 :size="14" />{{ t('todoListDelete') }}</button>
          </div>
        </div>
      </div>
    </section>
    <nav class="smart-nav nav-bottom">
      <button :class="{ active: !activeListId && filter === completedNav.key }" @click="changeFilter(completedNav.key)"><component :is="completedNav.icon" :size="18" /><span>{{ completedNav.label }}</span><small>{{ completedNav.count }}</small></button>
    </nav>
  </aside>
</template>
