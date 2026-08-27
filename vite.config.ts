import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'
import { ensureWebCrypto } from './scripts/webCryptoCompat'

ensureWebCrypto()

export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
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
