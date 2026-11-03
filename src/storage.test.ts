import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData } from './types'
import {
  DATA_VERSION,
  STORAGE_KEY,
  DataCorruptedError,
  loadData,
  normalizeData,
  saveData,
  seedData,
  toCSV,
  toBackup,
} from './storage'

/** 最小 localStorage 桩 */
function installLocalStorage() {
  const map = new Map<string, string>()
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
  ;(globalThis as unknown as { localStorage: typeof storage }).localStorage = storage
  return { map, storage }
}

describe('seedData', () => {
  it('版本号正确且字段齐全', () => {
    const d = seedData()
    expect(d.version).toBe(DATA_VERSION)
    expect(d.transactions).toEqual([])
    expect(d.categories.length).toBeGreaterThan(0)
    expect(d.accounts.length).toBeGreaterThan(0)
    expect(d.settings.theme).toBe('auto')
    expect(Array.isArray(d.settings.seenBadges)).toBe(true)
  })

  it('每次返回独立副本（避免共享引用被改坏）', () => {
    const a = seedData()
    const b = seedData()
    a.categories[0].name = '被修改'
    expect(b.categories[0].name).not.toBe('被修改')
  })
})

describe('normalizeData', () => {
  it('非对象输入抛错', () => {
    expect(() => normalizeData(null)).toThrow()
    expect(() => normalizeData([])).toThrow()
    expect(() => normalizeData('字符串')).toThrow()
  })

  it('缺少关键字段时抛错', () => {
    expect(() => normalizeData({ foo: 1 })).toThrow()
  })

  it('丢弃非法账单但保留合法账单', () => {
    const d = normalizeData({
      version: 4,
      transactions: [
        { type: 'expense', amount: 1000, categoryId: 'c1', accountId: 'a1', date: '2026-03-01' },
        { type: 'expense', amount: -5, categoryId: 'c1', accountId: 'a1', date: '2026-03-01' },
        { type: 'expense', amount: 1000, categoryId: 'c1', accountId: 'a1', date: '不是日期' },
        { type: 'expense', amount: 1000, date: '2026-03-01' },
        'garbage',
      ],
      accounts: [{ id: 'a1', name: '现金', kind: 'cash' }],
      categories: [{ id: 'c1', name: '餐饮', icon: 'food' }],
    })
    expect(d.transactions).toHaveLength(1)
  })

  it('余额调整允许负数但不允许 0', () => {
    const base = {
      version: 4,
      accounts: [{ id: 'a1', name: '现金', kind: 'cash' }],
      categories: [{ id: 'c1', name: '餐饮', icon: 'food' }],
    }
    const d = normalizeData({
      ...base,
      transactions: [
        { type: 'adjust', amount: -500, categoryId: '', accountId: 'a1', date: '2026-03-01' },
        { type: 'adjust', amount: 0, categoryId: '', accountId: 'a1', date: '2026-03-01' },
      ],
    })
    expect(d.transactions).toHaveLength(1)
    expect(d.transactions[0].amount).toBe(-500)
  })

  it('旧 emoji 分类图标会迁移成 SVG 图标名', () => {
    const d = normalizeData({
      version: 1,
      categories: [{ id: 'c1', name: '餐饮', emoji: '🍜' }],
      accounts: [{ id: 'a1', name: '现金', kind: 'cash' }],
    })
    expect(d.categories[0].icon).not.toBe('🍜')
    expect(typeof d.categories[0].icon).toBe('string')
  })

  it('信用卡默认是负债账户', () => {
    const d = normalizeData({
      version: 4,
      accounts: [{ id: 'a1', name: '信用卡', kind: 'credit' }],
    })
    expect(d.accounts[0].nature).toBe('liability')
  })

  it('周期账单缺少 anchorDay 时按 nextDate 补齐', () => {
    const d = normalizeData({
      version: 4,
      accounts: [{ id: 'a1', name: '现金', kind: 'cash' }],
      categories: [{ id: 'c1', name: '居家', icon: 'home' }],
      recurring: [
        {
          id: 'r1',
          name: '房租',
          type: 'expense',
          amount: 300_000,
          categoryId: 'c1',
          accountId: 'a1',
          rule: 'monthly',
          interval: 1,
          nextDate: '2026-01-31',
        },
      ],
    })
    expect(d.recurring[0].anchorDay).toBe(31)
  })

  it('孤儿待确认项（规则已不存在）会被清掉', () => {
    const d = normalizeData({
      version: 4,
      accounts: [{ id: 'a1', name: '现金', kind: 'cash' }],
      categories: [{ id: 'c1', name: '居家', icon: 'home' }],
      recurring: [],
      recurringDues: [{ id: 'd1', ruleId: 'ghost', date: '2026-01-01' }],
    })
    expect(d.recurringDues).toHaveLength(0)
  })

  it('孤儿还款计划（账户已不存在）会被清掉', () => {
    const d = normalizeData({
      version: 4,
      accounts: [{ id: 'a1', name: '现金', kind: 'cash' }],
      debts: [{ accountId: 'ghost', principal: 100, monthlyPayment: 10, apr: 0 }],
    })
    expect(d.debts).toHaveLength(0)
  })

  it('categories / accounts 为空时回退到种子数据', () => {
    const d = normalizeData({ version: 4, categories: [], accounts: [] })
    expect(d.categories.length).toBeGreaterThan(0)
    expect(d.accounts.length).toBeGreaterThan(0)
  })
})

describe('loadData', () => {
  let store: ReturnType<typeof installLocalStorage>

  beforeEach(() => {
    store = installLocalStorage()
    // 这些用例故意触发损坏路径，屏蔽预期的 error 日志，保持测试输出干净
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('没有数据时返回种子数据', () => {
    expect(loadData().version).toBe(DATA_VERSION)
  })

  it('正常数据能读回来', () => {
    const d = seedData()
    d.transactions = [
      {
        id: 't1',
        type: 'expense',
        amount: 500,
        categoryId: d.categories[0].id,
        accountId: d.accounts[0].id,
        note: '测试',
        date: '2026-03-01',
        createdAt: 1,
        updatedAt: 1,
      },
    ]
    store.storage.setItem(STORAGE_KEY, JSON.stringify(d))
    expect(loadData().transactions).toHaveLength(1)
  })

  it('数据损坏时抛 DataCorruptedError，而不是静默返回空账本（回归测试）', () => {
    store.storage.setItem(STORAGE_KEY, '{ 这不是合法 JSON')
    expect(() => loadData()).toThrow(DataCorruptedError)
  })

  it('数据损坏时把原始内容备份到 .corrupt 键', () => {
    const raw = '{ 这不是合法 JSON'
    store.storage.setItem(STORAGE_KEY, raw)
    expect(() => loadData()).toThrow()
    expect(store.storage.getItem(`${STORAGE_KEY}.corrupt`)).toBe(raw)
  })

  it('数据损坏时绝不覆盖原始数据（关键数据安全）', () => {
    const raw = '{ 这不是合法 JSON'
    store.storage.setItem(STORAGE_KEY, raw)
    expect(() => loadData()).toThrow()
    expect(store.storage.getItem(STORAGE_KEY)).toBe(raw)
  })
})

describe('saveData', () => {
  beforeEach(() => {
    installLocalStorage()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('保存后能读回来', () => {
    const d = seedData()
    expect(saveData(d)).toBe(true)
    expect(loadData().version).toBe(DATA_VERSION)
  })

  it('写入失败时返回 false 而不是抛错', () => {
    const failing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    }
    ;(globalThis as unknown as { localStorage: unknown }).localStorage = failing
    expect(saveData(seedData())).toBe(false)
  })
})

describe('toCSV', () => {
  function build(): AppData {
    const d = seedData()
    d.transactions = [
      {
        id: 't1',
        type: 'transfer',
        amount: 5000,
        categoryId: '',
        accountId: d.accounts[0].id,
        toAccountId: d.accounts[1].id,
        note: '转出',
        date: '2026-03-01',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 't2',
        type: 'adjust',
        amount: -300,
        categoryId: '',
        accountId: d.accounts[0].id,
        note: '调减',
        date: '2026-03-02',
        createdAt: 2,
        updatedAt: 2,
      },
      {
        id: 't3',
        type: 'expense',
        amount: 1200,
        categoryId: d.categories[0].id,
        accountId: d.accounts[0].id,
        note: '含,逗号',
        date: '2026-03-03',
        createdAt: 3,
        updatedAt: 3,
      },
    ]
    return d
  }

  it('带 UTF-8 BOM（Excel 中文不乱码）', () => {
    expect(toCSV(build()).startsWith('\uFEFF')).toBe(true)
  })

  it('转账与余额调整单独标注，不计收支', () => {
    const csv = toCSV(build())
    expect(csv).toContain('转账')
    expect(csv).toContain('不计收支')
    expect(csv).toContain('余额调整')
  })

  it('含逗号的备注被正确加引号', () => {
    expect(toCSV(build())).toContain('"含,逗号"')
  })

  it('按月份筛选', () => {
    const csv = toCSV(build(), '2026-04')
    // 只剩表头
    expect(csv.split('\r\n')).toHaveLength(1)
  })

  it('金额按元输出两位小数', () => {
    expect(toCSV(build())).toContain('12.00')
  })
})

describe('toBackup', () => {
  it('是合法 JSON 且能往返', () => {
    const d = seedData()
    const json = toBackup(d)
    expect(JSON.parse(json).version).toBe(DATA_VERSION)
  })
})
