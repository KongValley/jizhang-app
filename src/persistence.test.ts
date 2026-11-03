import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDebouncedSaver, SAVE_DEBOUNCE_MS } from './persistence'
import { seedData } from './storage'
import type { AppData } from './types'

/** 记录每次写入的假写入器 */
function recorder() {
  const writes: AppData[] = []
  let result = true
  return {
    writes,
    setResult(v: boolean) {
      result = v
    },
    write: (d: AppData) => {
      writes.push(d)
      return result
    },
  }
}

describe('createDebouncedSaver', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('连续改动只写入一次（核心价值：合并写盘）', () => {
    const rec = recorder()
    const saver = createDebouncedSaver(rec.write, 400)
    for (let i = 0; i < 10; i++) saver.schedule(seedData())
    expect(rec.writes).toHaveLength(0)
    vi.advanceTimersByTime(400)
    expect(rec.writes).toHaveLength(1)
  })

  it('写入的是最后一次的数据', () => {
    const rec = recorder()
    const saver = createDebouncedSaver(rec.write, 400)
    const a = seedData()
    a.version = 1
    const b = seedData()
    b.version = 2
    saver.schedule(a)
    saver.schedule(b)
    vi.advanceTimersByTime(400)
    expect(rec.writes[0].version).toBe(2)
  })

  it('flush 会立即写入，不必等定时器（保证关页面不丢数据）', () => {
    const rec = recorder()
    const saver = createDebouncedSaver(rec.write, 400)
    saver.schedule(seedData())
    expect(saver.flush()).toBe(true)
    expect(rec.writes).toHaveLength(1)
    // 定时器已经被取消，不会再写第二次
    vi.advanceTimersByTime(1000)
    expect(rec.writes).toHaveLength(1)
  })

  it('没有待写入内容时 flush 不写入', () => {
    const rec = recorder()
    const saver = createDebouncedSaver(rec.write, 400)
    expect(saver.flush()).toBe(false)
    expect(rec.writes).toHaveLength(0)
  })

  it('cancel 会丢弃待写入内容（多标签同步场景）', () => {
    const rec = recorder()
    const saver = createDebouncedSaver(rec.write, 400)
    saver.schedule(seedData())
    saver.cancel()
    expect(saver.isDirty()).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(rec.writes).toHaveLength(0)
    expect(saver.flush()).toBe(false)
  })

  it('isDirty 正确反映待写入状态', () => {
    const saver = createDebouncedSaver(recorder().write, 400)
    expect(saver.isDirty()).toBe(false)
    saver.schedule(seedData())
    expect(saver.isDirty()).toBe(true)
    vi.advanceTimersByTime(400)
    expect(saver.isDirty()).toBe(false)
  })

  it('写入失败时 lastWriteOk 为 false（用于提示用户存储已满）', () => {
    const rec = recorder()
    rec.setResult(false)
    const saver = createDebouncedSaver(rec.write, 400)
    expect(saver.lastWriteOk()).toBeNull()
    saver.schedule(seedData())
    vi.advanceTimersByTime(400)
    expect(saver.lastWriteOk()).toBe(false)
  })

  it('写入成功时 lastWriteOk 为 true', () => {
    const rec = recorder()
    const saver = createDebouncedSaver(rec.write, 400)
    saver.schedule(seedData())
    vi.advanceTimersByTime(400)
    expect(saver.lastWriteOk()).toBe(true)
  })

  it('定时器触发后再 flush 不会重复写', () => {
    const rec = recorder()
    const saver = createDebouncedSaver(rec.write, 400)
    saver.schedule(seedData())
    vi.advanceTimersByTime(400)
    expect(rec.writes).toHaveLength(1)
    expect(saver.flush()).toBe(false)
    expect(rec.writes).toHaveLength(1)
  })

  it('默认间隔为 SAVE_DEBOUNCE_MS', () => {
    const rec = recorder()
    const saver = createDebouncedSaver(rec.write)
    saver.schedule(seedData())
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1)
    expect(rec.writes).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(rec.writes).toHaveLength(1)
  })

  it('定时器路径也会回调写入结果（界面才能提示存储已满）', () => {
    const rec = recorder()
    const results: boolean[] = []
    const saver = createDebouncedSaver(rec.write, 400, (ok) => results.push(ok))
    saver.schedule(seedData())
    vi.advanceTimersByTime(400)
    expect(results).toEqual([true])

    rec.setResult(false)
    saver.schedule(seedData())
    vi.advanceTimersByTime(400)
    expect(results).toEqual([true, false])
  })

  it('flush 路径同样会回调写入结果', () => {
    const rec = recorder()
    const results: boolean[] = []
    const saver = createDebouncedSaver(rec.write, 400, (ok) => results.push(ok))
    saver.schedule(seedData())
    saver.flush()
    expect(results).toEqual([true])
  })
})
