import { describe, expect, it } from 'vitest'
import {
  WORKSPACE_SIDEBAR_DEFAULT_WIDTH,
  WORKSPACE_SIDEBAR_MAX_WIDTH,
  WORKSPACE_SIDEBAR_MIN_WIDTH,
  clampWorkspaceSidebarWidth,
} from './workspaceSidebar'

describe('workspace sidebar layout', () => {
  it('uses the same roomy dimensions across workspace views', () => {
    expect(WORKSPACE_SIDEBAR_DEFAULT_WIDTH).toBe(360)
    expect(WORKSPACE_SIDEBAR_MIN_WIDTH).toBe(300)
    expect(WORKSPACE_SIDEBAR_MAX_WIDTH).toBe(460)
  })

  it('keeps drag resizing inside the usable range', () => {
    expect(clampWorkspaceSidebarWidth(120)).toBe(300)
    expect(clampWorkspaceSidebarWidth(356)).toBe(356)
    expect(clampWorkspaceSidebarWidth(520)).toBe(460)
  })
})
