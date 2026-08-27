import { VITE_SERVER_CONFIG } from '../../scripts/viteServerConfig'

describe('Vite development watcher', () => {
  it('does not scan Cargo build artifacts', () => {
    const ignored = VITE_SERVER_CONFIG.watch?.ignored
    const patterns = Array.isArray(ignored) ? ignored : [ignored]

    expect(patterns).toContain('**/src-tauri/target/**')
  })
})
