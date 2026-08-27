import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // Vitest 2 carries Vite 5 types while the application builds with Vite 6.
  // The plugin runtime contract is compatible; keep the established test runner behavior.
  // @ts-expect-error -- duplicate Vite type identities only
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.spec.ts']
  }
})
