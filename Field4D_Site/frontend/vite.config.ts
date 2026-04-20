import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://f4d-fastapi-backend-1000435921680.us-central1.run.app',
        changeOrigin: true,
        secure: true,
      }
    }
  }
}) 