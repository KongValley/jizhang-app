import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// 版本号从 package.json 读取，与 vite.config.ts 保持一致；
// 漏掉这个 define 会让打包产物里留下未替换的 __APP_VERSION__，运行时直接报错。
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

// 供 Expo/WebView 原生壳使用的单文件构建：不注入 PWA，产物只有一个 index.html
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist-mobile',
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    modulePreload: false,
    reportCompressedSize: false,
  },
})
