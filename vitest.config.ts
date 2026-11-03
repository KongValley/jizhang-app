import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    // 纯逻辑测试用 node；需要 DOM 的测试在文件顶部用 @vitest-environment 注释声明
    environment: 'node',
    setupFiles: ['src/test-setup.ts'],
  },
})
