import { defineConfig } from 'vite';

export default defineConfig({
  // Base path for GitHub Pages deployment
  base: '/forest/',

  build: {
    // Output directory
    outDir: 'dist',
    // Generate source maps for debugging
    sourcemap: false,
  },
});
