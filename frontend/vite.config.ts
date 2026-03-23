import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        dashboard: resolve(__dirname, 'synology-monitor.html'),
      },
    },
    sourcemap: false,
    minify: 'esbuild',
  },
  server: {
    port: 5173,
    proxy: {
      '/api':  { target: 'http://localhost:3001', changeOrigin: true },
      '/auth': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
