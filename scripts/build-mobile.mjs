// 构建移动端单文件网页，并生成 Expo 壳使用的 webHtml.ts
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const distDir = path.join(root, 'dist-mobile')
const shellDir = path.join(root, 'mobile-shell')

console.log('1/4 构建 dist-mobile ...')
execSync('npx vite build --config vite.mobile.config.ts', { stdio: 'inherit', cwd: root })

console.log('2/4 内联 JS / CSS ...')
const htmlPath = path.join(distDir, 'index.html')
let html = fs.readFileSync(htmlPath, 'utf8')

html = html.replace(
  /<script([^>]*?)\ssrc="([^"]+)"([^>]*)><\/script>/g,
  (tag, pre, src) => {
    if (!/\btype="module"/.test(pre + tag)) return tag
    const file = path.join(distDir, src.replace(/^\.?\//, ''))
    if (!fs.existsSync(file)) return tag
    const code = fs.readFileSync(file, 'utf8').replace(/<\/script>/gi, '<\\/script>')
    return `<script type="module">\n${code}\n</script>`
  },
)

html = html.replace(/<link([^>]*?)rel="stylesheet"([^>]*?)\shref="([^"]+)"([^>]*)>/g, (tag, a, b, href) => {
  const file = path.join(distDir, href.replace(/^\.?\//, ''))
  if (!fs.existsSync(file)) return tag
  const css = fs.readFileSync(file, 'utf8').replace(/<\/style>/gi, '<\\/style>')
  return `<style>\n${css}\n</style>`
})

// 原生壳里没有这些外部文件，移除引用避免 404
html = html
  .replace(/<link[^>]*rel="manifest"[^>]*>\s*/g, '')
  .replace(/<link[^>]*rel="icon"[^>]*>\s*/g, '')
  .replace(/<link[^>]*rel="apple-touch-icon"[^>]*>\s*/g, '')

fs.writeFileSync(path.join(distDir, 'index.single.html'), html)

console.log('3/4 生成 mobile-shell/webHtml.ts ...')
fs.mkdirSync(shellDir, { recursive: true })
fs.writeFileSync(
  path.join(shellDir, 'webHtml.ts'),
  `// 由 scripts/build-mobile.mjs 自动生成，请勿手改\n// eslint-disable-next-line\nexport const WEB_HTML = ${JSON.stringify(html)}\n`,
)

console.log('4/4 清理中间产物 ...')
for (const entry of fs.readdirSync(distDir)) {
  if (entry === 'index.single.html') continue
  fs.rmSync(path.join(distDir, entry), { recursive: true, force: true })
}

console.log(`完成：index.single.html ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`)
