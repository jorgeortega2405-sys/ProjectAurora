import path from 'path';
import { defineConfig } from 'vite';

const adminDir = import.meta.dirname;

export default defineConfig({
  build: {
    copyPublicDir: false,
    cssCodeSplit: true,
    cssMinify: true,
    emptyOutDir: true,
    minify: 'esbuild',
    outDir: path.resolve(adminDir, '../dist/admin/client'),
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
  publicDir: path.resolve(adminDir, 'public'),
  resolve: {
    alias: {
      '@client': path.resolve(adminDir, 'client'),
    },
  },
  root: adminDir,
  server: {
    port: 5175,
    watch: {
      binaryInterval: 2000,
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/logs/**',
        '**/.git/**',
      ],
      interval: 1500,
      usePolling: true,
    },
  },
});
