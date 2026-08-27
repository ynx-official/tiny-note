export const VITE_SERVER_CONFIG = {
  host: '127.0.0.1',
  port: 1420,
  strictPort: true,
  watch: {
    // Cargo artifacts are disposable build output and can exceed tens of gigabytes.
    ignored: ['**/src-tauri/target/**']
  }
}
