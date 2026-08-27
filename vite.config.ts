import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'
import { ensureWebCrypto } from './scripts/webCryptoCompat'

ensureWebCrypto()

export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  // Keep Tauri's dev URL on the same IPv4 listener on Windows. Using
  // `localhost` can resolve to ::1 while Vite is not reachable on 127.0.0.1.
  server: { host: '127.0.0.1', port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2021', 'chrome105', 'safari13'],
    manifest: true,
    rollupOptions: {
      input: {
        main: resolve('index.html'),
        tray: resolve('tray.html')
      }
    }
  }
})
