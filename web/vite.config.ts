import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../dist',
    assetsDir: 'assets'
  },
  server: {
    port: 5175,
    proxy: {
      '/api': 'http://localhost:8787'
    }
  }
})
