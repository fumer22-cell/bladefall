import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any static host path (e.g. GitHub Pages).
  base: './',
  server: { host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
