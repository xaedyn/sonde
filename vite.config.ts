import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '$lib': path.resolve('./src/lib'),
    },
  },
  build: {
    target: 'es2020',
    // Source maps leak original file paths, comments, and variable names.
    // Off by default for production; opt-in locally via `SOURCEMAPS=1 npm run build`
    // when debugging a minified stack trace.
    sourcemap: process.env.SOURCEMAPS === '1',
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
  },
});
