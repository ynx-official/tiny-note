import { beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import TodosView from './TodosView.vue'

describe('TodosView', () => {
  beforeEach(() => localStorage.clear())
  it('quick-adds a local todo and exposes its detail editor', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/todos', component: TodosView }] })
    await router.push('/todos'); await router.isReady()
    const wrapper = mount(TodosView, { global: { plugins: [createPinia(), router] } })
    await flushPromises()
    await wrapper.find('.todo-quick input').setValue('准备周会')
    await wrapper.find('.todo-quick').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.todo-row-main strong').text()).toBe('准备周会')
    expect(wrapper.find('.todo-detail input').element.value).toBe('准备周会')
  })
})
