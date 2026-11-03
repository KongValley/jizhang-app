import type { AppData } from './types'
import { saveData } from './storage'

/** 写入 localStorage 的防抖间隔（毫秒） */
export const SAVE_DEBOUNCE_MS = 400

export interface DebouncedSaver {
  /** 记录最新数据并（重新）安排一次写入 */
  schedule: (data: AppData) => void
  /** 立即把待写入的数据落盘；返回是否真的写了 */
  flush: () => boolean
  /** 放弃待写入的数据（例如数据来自其它标签页时） */
  cancel: () => void
  /** 是否有尚未落盘的改动 */
  isDirty: () => boolean
  /** 最近一次写入是否成功；尚未写过时为 null */
  lastWriteOk: () => boolean | null
}

/**
 * 账本写入 localStorage 的节流器。
 *
 * 记账是低频操作，但输入框编辑、开关切换、模板管理等仍会连续触发保存，
 * 而每次保存都要把整个账本 JSON.stringify 一遍（账单多时是几十毫秒的主线程阻塞）。
 * 这里把连续改动合并成一次写入，并在页面隐藏/卸载时强制落盘，保证不丢数据。
 *
 * 抽成独立模块是为了能直接对「合并、落盘、取消」这些行为写单元测试。
 */
export function createDebouncedSaver(
  write: (data: AppData) => boolean = saveData,
  delay = SAVE_DEBOUNCE_MS,
  /** 每次真正写入后回调，参数为是否成功 */
  onResult?: (ok: boolean) => void,
): DebouncedSaver {
  let timer: ReturnType<typeof setTimeout> | undefined
  let latest: AppData | null = null
  let dirty = false
  let writeOk: boolean | null = null

  const clear = () => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  const writeNow = () => {
    if (!latest) return
    dirty = false
    writeOk = write(latest)
    onResult?.(writeOk)
  }

  return {
    schedule(data) {
      latest = data
      dirty = true
      clear()
      timer = setTimeout(() => {
        timer = undefined
        if (!dirty) return
        writeNow()
      }, delay)
    },

    flush() {
      clear()
      if (!dirty) return false
      writeNow()
      return true
    },

    cancel() {
      clear()
      dirty = false
      latest = null
    },

    isDirty: () => dirty,
    lastWriteOk: () => writeOk,
  }
}
