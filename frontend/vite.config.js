import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:15002',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // 确保 Worker 文件正确打包
        manualChunks: undefined
      }
    }
  },
  worker: {
    // 确保 Worker 使用 ES 模块格式
    format: 'es',
    plugins: () => []
  },
  optimizeDeps: {
    exclude: ['layoutWorker.js']
  }
})
