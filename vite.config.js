import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // Function form required by rolldown (Vite's new bundler); the
        // object form throws "manualChunks is not a function" at build.
        // Stripe removed 2026-09-13 after Windcave-only cutover — no
        // longer imported by client code.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('react-router')) return 'vendor-react'
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('scheduler')) return 'vendor-react'
          if (id.includes('@livekit') || id.includes('livekit-client')) return 'vendor-livekit'
          if (id.includes('@supabase')) return 'vendor-supabase'
        },
      },
    },
  }
})
