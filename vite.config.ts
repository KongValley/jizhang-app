import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

// GitHub Pages 部署在 /jizhang-app/，本地与根域名部署用 /
const base = process.env.BASE_PATH ?? '/'
const withBase = (path: string) => `${base.replace(/\/$/, '')}/${path}`.replace(/\/{2,}/g, '/')

// 版本号统一从 package.json 读取，避免界面里写死的版本与发布版本对不上
// （曾经界面显示 1.3.0，而 APK 实际是 1.3.1）
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // 不额外 includeAssets：下面的 globPatterns 已经覆盖 favicon 与图标，
      // 重复声明会让这些文件在预缓存清单里出现两次。
      manifest: {
        name: '记账本 · 每天记一笔',
        short_name: '记账本',
        description: '纯本地记账 App：快速记账、分类统计、预算提醒，数据只保存在你自己的设备上。',
        lang: 'zh-CN',
        theme_color: '#4c6fff',
        background_color: '#f2f3f7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: withBase('icons/icon-192.png'), sizes: '192x192', type: 'image/png' },
          { src: withBase('icons/icon-512.png'), sizes: '512x512', type: 'image/png' },
          {
            src: withBase('icons/maskable-512.png'),
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // 只预缓存构建产物与矢量图标；PNG 图标由下面的 includeAssets 与
        // manifest.icons 各自声明，避免同一个文件在预缓存清单里出现两次。
        globPatterns: ['**/*.{js,css,html,svg,ico}'],
        cleanupOutdatedCaches: true,
        navigateFallback: withBase('index.html'),
        // 只在 iOS 添加到主屏时使用，不在 manifest 里，需要显式加入预缓存
        additionalManifestEntries: [{ url: withBase('icons/apple-touch-icon.png'), revision: null }],
        // icon-1024.png 既不在 manifest 也没有页面引用，不缓存
        globIgnores: ['**/icons/icon-1024.png'],
      },
    }),
  ],
  server: { host: true, port: 5173 },
})
