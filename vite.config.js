import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // Use the GitHub Pages base in builds, but keep local dev rooted at /
  base: process.env.VITE_BASE_PATH ?? (command === 'serve' ? '/' : '/forest/'),
  plugins: [react()],

  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern',
      },
    },
  },

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
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (id.includes('react')) return 'react-vendor';
          return 'vendor';
        },
      },
    },
  },
}));
