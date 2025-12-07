import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 备用配置：禁用代码分割（如果有问题可以使用此配置）
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
    // 提高 chunk 大小警告阈值
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // 使用简单的代码分割
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-ui': ['lucide-react', 'react-photo-view'],
        }
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
