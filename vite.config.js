import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Base path for GitHub Pages deployment
  base: '/forest/',
  plugins: [react()],

  build: {
    // Output directory
    outDir: 'dist',
    // Generate source maps for debugging
    sourcemap: false,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        tui: fileURLToPath(new URL('./tui.html', import.meta.url)),
      },
    },
  },
});
