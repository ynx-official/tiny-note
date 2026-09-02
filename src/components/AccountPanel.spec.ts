import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'

const auth = reactive({
  authenticated: false,
  user: null as null | { username: string; nickname: string },
  busy: false,
  error: '',
  secureStorageAvailable: true,
  signIn: vi.fn(),
  signOut: vi.fn()
})
const initialize = vi.fn()

vi.mock('../stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('../stores/app', () => ({ useAppStore: () => ({ initialize }) }))

import AccountPanel from './AccountPanel.vue'

describe('AccountPanel', () => {
  beforeEach(() => {
    auth.authenticated = false
    auth.user = null
    auth.busy = false
    auth.error = ''
    auth.secureStorageAvailable = true
    auth.signIn.mockReset()
    auth.signOut.mockReset()
    initialize.mockReset()
  })

  it('asks for credentials only and continues after login', async () => {
    auth.signIn.mockResolvedValue(true)
    const wrapper = mount(AccountPanel)
    const fields = wrapper.findAll('input').map(input => input.attributes('name')).filter(Boolean)
    expect(fields).toEqual(['username', 'password'])

    await wrapper.get('input[name="username"]').setValue('tiny')
    await wrapper.get('input[name="password"]').setValue('secret')
    await wrapper.get('form').trigger('submit')

    expect(auth.signIn).toHaveBeenCalledWith('tiny', 'secret', true)
    expect(initialize).toHaveBeenCalledWith({ force: true })
    expect(wrapper.emitted('signed-in')).toHaveLength(1)
  })
})
