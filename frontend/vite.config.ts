import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        auth:      resolve(__dirname, 'dsm-auth.html'),
        dashboard: resolve(__dirname, 'synology-monitor.html'),
      },
    },
    sourcemap: false,
    minify: 'esbuild',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  define: {
    __API_URL__: JSON.stringify(process.env.VITE_API_URL || 'http://localhost:3001'),
    __CDN_URL__: JSON.stringify(process.env.VITE_CDN_URL || ''),
  },
});
