import { beforeEach, describe, expect, it } from 'vitest'
import { readBrowserState, writeBrowserState } from './storage'

describe('browser backend storage boundary', () => {
  beforeEach(() => localStorage.clear())

  it('narrows persisted JSON to an object before exposing it to domain handlers', () => {
    localStorage.setItem('tiny-note-browser-state', '["untrusted"]')
    expect(readBrowserState()).toEqual({})

    localStorage.setItem('tiny-note-browser-state', '{broken')
    expect(readBrowserState()).toEqual({})
  })

  it('round-trips a browser state record', () => {
    writeBrowserState({ notes: [], version: 1 })
    expect(readBrowserState()).toEqual({ notes: [], version: 1 })
  })
})
