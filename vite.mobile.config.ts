import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 供 Expo/WebView 原生壳使用的单文件构建：不注入 PWA，产物只有一个 index.html
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  base: './',
  build: {
    outDir: 'dist-mobile',
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    modulePreload: false,
    reportCompressedSize: false,
  },
})
