import { createRequire } from 'node:module'
import path from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const require = createRequire(import.meta.url)
const builtinModules: string[] = require('module').builtinModules

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      lib: {
        entry: 'electron/main/index.ts',
        formats: ['es'],
        fileName: () => 'index.js',
      },
      rollupOptions: {
        external: ['electron', ...builtinModules],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      lib: {
        entry: 'electron/preload/index.ts',
        formats: ['cjs'],
        fileName: () => 'index.js',
      },
      rollupOptions: {
        external: ['electron', ...builtinModules],
      },
    },
  },
  renderer: {
    root: 'electron/renderer',
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@shared': path.resolve(__dirname, 'electron/shared'),
      },
    },
    build: {
      outDir: path.resolve(__dirname, 'out/renderer'),
      emptyOutDir: false,
      rollupOptions: {
        input: path.resolve(__dirname, 'electron/renderer/index.html'),
      },
    },
  },
})
