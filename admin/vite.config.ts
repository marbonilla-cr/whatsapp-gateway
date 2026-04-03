import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: { port: 5173 },
  preview: {
    allowedHosts: ['thriving-manifestation-production-dce1.up.railway.app', '.railway.app'],
    host: '0.0.0.0',
    port: 4173,
  },
  build: {
    outDir: 'dist',
  },
});
