import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The AI gateway is a separate server-side process that holds the
    // provider key. The browser calls it through this same-origin path so
    // the key never reaches the client bundle.
    //
    // The gateway is optional. When it is not running, the proxy fails and
    // the app falls back to its local extractive answers.
    proxy: {
      '/api': {
        target: process.env.GATEWAY_URL || 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
})
