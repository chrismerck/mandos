import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? '/mandos2/' : '/', // GitHub Pages in production, root in development
  build: {
    outDir: 'dist-web',
    assetsInlineLimit: 0, // Don't inline binary files
  },
  server: {
    port: 3000,
  },
  publicDir: 'public',
});