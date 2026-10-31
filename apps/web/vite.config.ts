import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
export default defineConfig({
  plugins: [react()],
  server: {proxy: {
    '/api': process.env.NEUROLAB_API_PROXY ?? 'http://127.0.0.1:8011',
    '/datasets/mnist': {
      target: 'https://storage.googleapis.com',
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/datasets\/mnist/, '/cvdf-datasets/mnist'),
    },
  }},
})
