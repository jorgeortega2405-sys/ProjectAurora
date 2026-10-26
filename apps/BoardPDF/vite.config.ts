import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    copyPublicDir: false,
    cssCodeSplit: true,
    cssMinify: true,
    emptyOutDir: true,
    minify: 'esbuild',
    outDir: 'dist/client',
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/chunks/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
    target: 'es2022',
  },
  publicDir: 'public',
  resolve: {
    alias: {
      '@client': path.resolve(import.meta.dirname, 'client'),
    },
  },
  server: {
    port: 5174,
    watch: {
      binaryInterval: 2000,
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/logs/**',
        '**/data/**',
        '**/.git/**',
        '**/public/uploads/**',
        '**/tests/**',
        '**/scripts/**',
      ],
      interval: 1500,
      usePolling: true,
    },
  },
});
