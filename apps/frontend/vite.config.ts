import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@homenas/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    }
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
})
