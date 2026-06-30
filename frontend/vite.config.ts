import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  envDir: '../',
  plugins: [react()],
  resolve: {
    alias: {
      // Fix phosphor-react 1.4.1 bundling issue with Vite
      'phosphor-react': path.resolve('./node_modules/phosphor-react/dist/phosphor-react.cjs.production.min.js'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'map-vendor': ['leaflet', 'react-leaflet'],
          'chart-vendor': ['recharts'],
          'firebase-vendor': ['firebase/app', 'firebase/auth'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});
