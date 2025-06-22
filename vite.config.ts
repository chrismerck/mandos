import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // For GitHub Pages, always use the repository name as base
  const base = mode === 'production' ? '/mandos/' : '/';
  
  return {
    plugins: [react()],
    base,
    build: {
      outDir: 'dist-web',
      assetsInlineLimit: 0, // Don't inline binary files
    },
    server: {
      port: 3000,
    },
    publicDir: 'public',
  };
});