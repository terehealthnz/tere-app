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
        manualChunks: {
          'vendor-react':   ['react', 'react-dom', 'react-router-dom'],
          'vendor-stripe':  ['@stripe/stripe-js', '@stripe/react-stripe-js'],
          'vendor-livekit': ['@livekit/components-react', 'livekit-client'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  }
})
