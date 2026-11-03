import { describe, expect, it } from 'vitest'
import type { Account, AppData, Budget, RecurringRule, Transaction } from './types'
import {
  accountBalance,
  balanceDeltas,
  balanceMap,
  budgetStatus,
  categoryTrend,
  dailyAllowance,
  debtProjection,
  debtSummary,
  dueInstances,
  expenseHeatmap,
  fixedExpenses,
  forecastPayoff,
  netWorthAt,
  nextRecurringDate,
  overspendStreak,
  parseQuickAdd,
  periodComparison,
  spentByCategory,
  spentFor,
  spentFromMap,
  summarize,
  topWithRest,
  totalBalance,
  trend,
  breakdown,
} from './stats'

/* ------------------------------------------------------------------ */
/* 测试数据工厂                                                        */
/* ------------------------------------------------------------------ */

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    type: 'expense',
    amount: 1000,
    categoryId: 'c-food',
    accountId: 'a1',
    note: '',
    date: '2026-03-10',
    createdAt: 1,
    updatedAt: 1,
    ...over,
  }
}

function account(over: Partial<Account> = {}): Account {
  return {
    id: over.id ?? 'a1',
    name: '现金',
    kind: 'cash',
    nature: 'asset',
    initialBalance: 0,
    ...over,
  }
}

function makeData(over: Partial<AppData> = {}): AppData {
  return {
    version: 4,
    transactions: [],
    categories: [],
    accounts: [],
    budgets: [],
    recurring: [],
    recurringDues: [],
    templates: [],
    debts: [],
    settings: { theme: 'auto', budgetReminder: true, overspendAlert: true, seenBadges: [] },
    updatedAt: 0,
    ...over,
  }
}

/* ------------------------------------------------------------------ */
/* 汇总                                                                */
/* ------------------------------------------------------------------ */

describe('summarize', () => {
  it('只统计收支，忽略转账与余额调整', () => {
    const s = summarize([
      tx({ type: 'expense', amount: 3000 }),
      tx({ type: 'income', amount: 5000 }),
      tx({ type: 'transfer', amount: 9999 }),
      tx({ type: 'adjust', amount: -9999 }),
    ])
    expect(s).toEqual({ expense: 3000, income: 5000, net: 2000, count: 2 })
  })

  it('空数组返回全 0', () => {
    expect(summarize([])).toEqual({ expense: 0, income: 0, net: 0, count: 0 })
  })
})

describe('breakdown / topWithRest', () => {
  const categories = [
    { id: 'c-food', name: '餐饮', icon: 'food' as const, color: '#f00', type: 'expense' as const },
  ]

  it('按分类聚合并算占比', () => {
    const items = breakdown(
      [tx({ amount: 3000 }), tx({ amount: 1000 })],
      categories,
      'expense',
    )
    expect(items).toHaveLength(1)
    expect(items[0].amount).toBe(4000)
    expect(items[0].share).toBeCloseTo(1)
  })

  it('未知分类回退为未分类', () => {
    const items = breakdown([tx({ categoryId: 'ghost' })], categories, 'expense')
    expect(items[0].name).toBe('未分类')
    expect(items[0].color).toBe('#94a3b8')
  })

  it('尾部小项合并成「其他」且占比正确', () => {
    const amounts = Array.from({ length: 10 }, (_, i) => 1000 - i * 50)
    const total = amounts.reduce((s, v) => s + v, 0)
    const items = amounts.map((amount, i) => ({
      id: `c${i}`,
      name: `分类${i}`,
      icon: 'box' as const,
      color: '#000',
      amount,
      count: 1,
      share: amount / total,
    }))
    const merged = topWithRest(items, 3)
    expect(merged).toHaveLength(4)
    expect(merged[3].name).toBe('其他 7 类')
    // 合并后各项占比之和仍应为 1
    expect(merged.reduce((s, i) => s + i.share, 0)).toBeCloseTo(1, 5)
    // 「其他」金额应为剩余 7 项之和
    expect(merged[3].amount).toBe(amounts.slice(3).reduce((s, v) => s + v, 0))
  })
})

/* ------------------------------------------------------------------ */
/* 账户余额                                                            */
/* ------------------------------------------------------------------ */

describe('账户余额', () => {
  const accounts = [
    account({ id: 'a1', initialBalance: 10_000 }),
    account({ id: 'a2', name: '信用卡', kind: 'credit', nature: 'liability', initialBalance: 0 }),
    account({ id: 'a3', name: '银行', kind: 'bank', initialBalance: 50_000 }),
  ]
  const txs = [
    tx({ type: 'expense', amount: 3_000, accountId: 'a1' }),
    tx({ type: 'income', amount: 20_000, accountId: 'a3' }),
    tx({ type: 'transfer', amount: 5_000, accountId: 'a3', toAccountId: 'a1' }),
    tx({ type: 'adjust', amount: -1_500, accountId: 'a2' }),
  ]

  it('balanceMap 与逐账户累加结果一致', () => {
    const map = balanceMap(txs, accounts)
    for (const acc of accounts) {
      expect(map.get(acc.id)).toBe(accountBalance(txs, acc))
    }
  })

  it('转账同时改变两端账户', () => {
    const map = balanceMap(txs, accounts)
    expect(map.get('a3')).toBe(50_000 + 20_000 - 5_000)
    expect(map.get('a1')).toBe(10_000 - 3_000 + 5_000)
  })

  it('cutoff 会排除之后的账单', () => {
    const list = [tx({ date: '2026-01-10', amount: 1000 }), tx({ date: '2026-02-10', amount: 5000 })]
    const m = balanceMap(list, [account({ id: 'a1', initialBalance: 0 })], '2026-01-31')
    expect(m.get('a1')).toBe(-1000)
  })

  it('balanceDeltas 不含期初余额', () => {
    const deltas = balanceDeltas([tx({ type: 'income', amount: 500, accountId: 'a1' })])
    expect(deltas.get('a1')).toBe(500)
  })

  it('totalBalance 等于各账户余额之和', () => {
    const data = makeData({ transactions: txs, accounts })
    const expected = accounts.reduce((s, a) => s + accountBalance(txs, a), 0)
    expect(totalBalance(data)).toBe(expected)
  })
})

describe('netWorthAt', () => {
  it('负债账户欠款计入负债并从净资产扣除', () => {
    const accounts = [
      account({ id: 'a1', initialBalance: 100_000 }),
      account({ id: 'a2', name: '房贷', nature: 'liability', initialBalance: -80_000 }),
    ]
    const nw = netWorthAt(makeData({ accounts, transactions: [] }), '2026-12-31')
    expect(nw.assets).toBe(100_000)
    expect(nw.liabilities).toBe(80_000)
    expect(nw.net).toBe(20_000)
  })

  it('负债账户余额为正（溢缴）时计入资产', () => {
    const accounts = [
      account({ id: 'a2', name: '信用卡', kind: 'credit', nature: 'liability', initialBalance: 5_000 }),
    ]
    const nw = netWorthAt(makeData({ accounts, transactions: [] }), '2026-12-31')
    expect(nw.liabilities).toBe(0)
    expect(nw.assets).toBe(5_000)
  })

  it('净资产恒等于所有账户余额之和', () => {
    const accounts = [
      account({ id: 'a1', initialBalance: 10_000 }),
      account({ id: 'a2', nature: 'liability', initialBalance: -3_000 }),
    ]
    const transactions = [tx({ type: 'expense', amount: 2_000, accountId: 'a1' })]
    const data = makeData({ accounts, transactions })
    const nw = netWorthAt(data, '2026-12-31')
    expect(nw.net).toBe(totalBalance(data))
  })

  it('占比之和为 1', () => {
    const accounts = [
      account({ id: 'a1', initialBalance: 60_000 }),
      account({ id: 'a2', initialBalance: 40_000 }),
    ]
    const nw = netWorthAt(makeData({ accounts, transactions: [] }), '2026-12-31')
    expect(nw.assetItems.reduce((s, i) => s + i.share, 0)).toBeCloseTo(1)
  })
})

/* ------------------------------------------------------------------ */
/* 取整与金额                                                          */
/* ------------------------------------------------------------------ */

describe('summarize 金额取整', () => {
  it('累加不会产生浮点误差（全程整数分）', () => {
    const txs = Array.from({ length: 100 }, () => tx({ amount: 10 }))
    expect(summarize(txs).expense).toBe(1000)
    expect(Number.isInteger(summarize(txs).expense)).toBe(true)
  })
})

/* ------------------------------------------------------------------ */
/* 预算                                                                */
/* ------------------------------------------------------------------ */

describe('预算', () => {
  const txs = [
    tx({ type: 'expense', amount: 3_000, categoryId: 'c-food', date: '2026-03-05' }),
    tx({ type: 'expense', amount: 2_000, categoryId: 'c-fun', date: '2026-03-06' }),
    tx({ type: 'income', amount: 9_000, categoryId: 'i-salary', date: '2026-03-07' }),
    tx({ type: 'expense', amount: 7_000, categoryId: 'c-food', date: '2026-04-01' }),
  ]

  it('spentFor 只统计当月支出', () => {
    expect(spentFor(txs, '2026-03', 'all')).toBe(5_000)
    expect(spentFor(txs, '2026-03', 'c-food')).toBe(3_000)
  })

  it('spentByCategory 聚合与 spentFor 等价', () => {
    const map = spentByCategory(txs, '2026-03')
    expect(spentFromMap(map, 'all')).toBe(spentFor(txs, '2026-03', 'all'))
    expect(spentFromMap(map, 'c-food')).toBe(spentFor(txs, '2026-03', 'c-food'))
    expect(spentFromMap(map, 'c-fun')).toBe(spentFor(txs, '2026-03', 'c-fun'))
    expect(spentFromMap(map, 'c-nothing')).toBe(0)
  })

  it('budgetStatus 传入聚合表与不传结果一致', () => {
    const budget: Budget = { id: 'b', month: '2026-03', categoryId: 'c-food', amount: 5_000 }
    const spends = spentByCategory(txs, '2026-03')
    const a = budgetStatus(txs, '2026-03', budget, spends)
    const b = budgetStatus(txs, '2026-03', budget)
    expect(a).toEqual(b)
    expect(a.spent).toBe(3_000)
    expect(a.remaining).toBe(2_000)
    expect(a.over).toBe(false)
  })

  it('超支时 over 为 true', () => {
    const budget: Budget = { id: 'b', month: '2026-03', categoryId: 'all', amount: 4_000 }
    expect(budgetStatus(txs, '2026-03', budget).over).toBe(true)
  })

  it('预算为 0 时 ratio 不会变成 NaN', () => {
    const budget: Budget = { id: 'b', month: '2026-03', categoryId: 'all', amount: 0 }
    expect(budgetStatus(txs, '2026-03', budget).ratio).toBe(0)
  })
})

describe('dailyAllowance', () => {
  it('预算为 0 时返回 null', () => {
    expect(dailyAllowance([], '2026-03', 0)).toBeNull()
  })

  it('remaining / daysLeft 与 todayAllow 自洽', () => {
    const a = dailyAllowance([tx({ amount: 1000, date: '2020-01-05' })], '2020-01', 100_000)
    expect(a).not.toBeNull()
    expect(a!.daysLeft).toBeGreaterThanOrEqual(1)
    expect(Math.max(0, a!.remaining) / a!.daysLeft).toBeCloseTo(a!.todayAllow)
  })
})

/* ------------------------------------------------------------------ */
/* 周期账单：锚定日回归测试                                            */
/* ------------------------------------------------------------------ */

describe('nextRecurringDate', () => {
  it('每月 31 号不会因为 2 月被永久改成 28 号', () => {
    let cursor = '2026-01-31'
    const chain: string[] = []
    for (let i = 0; i < 4; i++) {
      cursor = nextRecurringDate(cursor, 'monthly', 1, 31)
      chain.push(cursor)
    }
    expect(chain).toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
  })

  it('未传锚定日时保持原有行为（向后兼容）', () => {
    expect(nextRecurringDate('2026-01-31', 'monthly', 1)).toBe('2026-02-28')
  })

  it('每月 30 号在 2 月压到月末后能恢复', () => {
    let cursor = '2026-01-30'
    cursor = nextRecurringDate(cursor, 'monthly', 1, 30)
    expect(cursor).toBe('2026-02-28')
    cursor = nextRecurringDate(cursor, 'monthly', 1, 30)
    expect(cursor).toBe('2026-03-30')
  })

  it('闰年 2 月 29 日', () => {
    expect(nextRecurringDate('2024-01-31', 'monthly', 1, 31)).toBe('2024-02-29')
  })

  it('每 2 个月跨年', () => {
    expect(nextRecurringDate('2026-11-30', 'monthly', 2, 30)).toBe('2027-01-30')
  })

  it('每年 2 月 29 日落到 2 月 28 日', () => {
    expect(nextRecurringDate('2024-02-29', 'yearly', 1)).toBe('2025-02-28')
  })

  it('每周 / 每天', () => {
    expect(nextRecurringDate('2026-03-01', 'weekly', 1)).toBe('2026-03-08')
    expect(nextRecurringDate('2026-03-01', 'daily', 5)).toBe('2026-03-06')
  })
})

describe('dueInstances', () => {
  const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({
    id: 'r1',
    name: '房租',
    type: 'expense',
    amount: 300_000,
    categoryId: 'c-home',
    accountId: 'a-bank',
    note: '',
    rule: 'monthly',
    interval: 1,
    nextDate: '2026-01-31',
    anchorDay: 31,
    auto: true,
    enabled: true,
    createdAt: 0,
    ...over,
  })

  it('累计到期且日期锚定在 31 号', () => {
    const { dates, nextDate } = dueInstances(rule(), '2026-04-15')
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
    expect(nextDate).toBe('2026-04-30')
  })

  it('结束日期之后不再生成', () => {
    const { dates } = dueInstances(rule({ endDate: '2026-02-28' }), '2026-04-15')
    expect(dates).toEqual(['2026-01-31', '2026-02-28'])
  })

  it('尚未到期时返回空', () => {
    const { dates } = dueInstances(rule(), '2026-01-01')
    expect(dates).toEqual([])
  })

  it('有 500 次上限，不会无限循环', () => {
    const { dates } = dueInstances(rule({ rule: 'daily', nextDate: '2020-01-01' }), '2026-04-15')
    expect(dates.length).toBeLessThanOrEqual(500)
  })
})

/* ------------------------------------------------------------------ */
/* 负债：零利率回归测试                                                */
/* ------------------------------------------------------------------ */

describe('forecastPayoff', () => {
  it('0% 利率不应产生任何利息（回归测试）', () => {
    const r = forecastPayoff(100_000, 30_000, 0, '2026-01')
    expect(r.months).toBe(4)
    expect(r.totalInterest).toBe(0)
    expect(r.monthlyInterest).toBe(0)
  })

  it('有息贷款产生正利息', () => {
    const r = forecastPayoff(1_000_000, 100_000, 12, '2026-01')
    expect(r.totalInterest).toBeGreaterThan(0)
    // 等额月供下的总利息应远小于本金
    expect(r.totalInterest).toBeLessThan(1_000_000)
  })

  it('已还清时返回 0 个月', () => {
    expect(forecastPayoff(0, 10_000, 5, '2026-01')).toMatchObject({
      months: 0,
      totalInterest: 0,
      feasible: true,
    })
  })

  it('月供为 0 或不足以覆盖利息时不可行', () => {
    expect(forecastPayoff(100_000, 0, 0).feasible).toBe(false)
    expect(forecastPayoff(1_000_000, 100, 24).feasible).toBe(false)
  })

  it('月供刚好覆盖利息时不可行', () => {
    // 本金 120000，月息 1% = 1200，月供 1200 永远还不清
    expect(forecastPayoff(120_000, 1_200, 12).feasible).toBe(false)
  })
})

describe('debtSummary', () => {
  const accounts = [
    account({ id: 'a-card', name: '信用卡', kind: 'credit', nature: 'liability', initialBalance: 0 }),
  ]

  it('消费会增加欠款', () => {
    const data = makeData({
      accounts,
      transactions: [tx({ type: 'expense', amount: 50_000, accountId: 'a-card' })],
    })
    const s = debtSummary(data, '2026-03-15')
    expect(s.items).toHaveLength(1)
    expect(s.items[0].owed).toBe(50_000)
    expect(s.totalOwed).toBe(50_000)
  })

  it('转入负债账户视为还款', () => {
    const data = makeData({
      accounts,
      transactions: [
        tx({ type: 'expense', amount: 50_000, accountId: 'a-card' }),
        tx({ type: 'transfer', amount: 20_000, accountId: 'a1', toAccountId: 'a-card' }),
      ],
    })
    expect(debtSummary(data, '2026-03-15').items[0].owed).toBe(30_000)
  })

  it('无还款计划的账户本金取当前欠款，进度不为负', () => {
    const data = makeData({
      accounts,
      transactions: [tx({ type: 'expense', amount: 30_000, accountId: 'a-card' })],
    })
    const item = debtSummary(data, '2026-03-15').items[0]
    expect(item.principal).toBe(30_000)
    expect(item.repaid).toBe(0)
    expect(item.progress).toBe(0)
  })

  it('还清后 settled 为 true', () => {
    const data = makeData({
      accounts: [
        account({ id: 'a-card', kind: 'credit', nature: 'liability', initialBalance: -10_000 }),
      ],
      transactions: [tx({ type: 'transfer', amount: 10_000, accountId: 'a1', toAccountId: 'a-card' })],
    })
    expect(debtSummary(data, '2026-03-15').settled).toBe(true)
  })

  it('没有负债账户时结果为空', () => {
    const s = debtSummary(makeData({ accounts: [account({ id: 'a1' })] }), '2026-03-15')
    expect(s.items).toHaveLength(0)
    expect(s.totalOwed).toBe(0)
  })
})

describe('debtProjection', () => {
  it('按计划逐月下降直到归零', () => {
    const accounts = [
      account({ id: 'a-card', kind: 'credit', nature: 'liability', initialBalance: -30_000 }),
    ]
    const data = makeData({
      accounts,
      transactions: [],
      debts: [
        { id: 'd1', accountId: 'a-card', principal: 30_000, monthlyPayment: 10_000, apr: 0, createdAt: 0 },
      ],
    })
    const items = debtSummary(data, '2026-03-15').items
    const points = debtProjection(items, 600)
    expect(points[0].balance).toBe(30_000)
    expect(points[points.length - 1].balance).toBe(0)
  })
})

/* ------------------------------------------------------------------ */
/* 热力图 / 对比 / 固定支出                                            */
/* ------------------------------------------------------------------ */

describe('expenseHeatmap', () => {
  it('金额越大等级越高，且给出最忙的一天', () => {
    const txs = [
      tx({ amount: 100, date: '2026-03-01' }),
      tx({ amount: 1000, date: '2026-03-02' }),
    ]
    const h = expenseHeatmap(txs, '2026-03')
    expect(h.days).toHaveLength(31)
    expect(h.max).toBe(1000)
    expect(h.worst?.date).toBe('2026-03-02')
    expect(h.activeDays).toBe(2)
  })

  it('没有支出时 worst 为 null', () => {
    const h = expenseHeatmap([], '2026-03')
    expect(h.worst).toBeNull()
    expect(h.activeDays).toBe(0)
  })

  it('周边界正确（2 月只有 28 天）', () => {
    expect(expenseHeatmap([], '2026-02').days).toHaveLength(28)
    expect(expenseHeatmap([], '2024-02').days).toHaveLength(29)
  })
})

describe('periodComparison', () => {
  it('上月没有数据时 rate 为 null 而不是 Infinity', () => {
    const list = periodComparison([tx({ amount: 500, date: '2026-03-10' })], '2026-03-10')
    expect(list[0].current).toBe(500)
    expect(list[0].previous).toBe(0)
    expect(list[0].rate).toBeNull()
  })
})

describe('fixedExpenses', () => {
  it('跨多月的同备注支出被识别为固定支出', () => {
    const txs = ['2026-01', '2026-02', '2026-03'].map((m, i) =>
      tx({ id: `t${i}`, note: '房租', amount: 300_000, date: `${m}-05` }),
    )
    const r = fixedExpenses(txs, [], '2026-03', 6)
    expect(r.items).toHaveLength(1)
    expect(r.items[0].monthlyAvg).toBe(300_000)
    expect(r.items[0].months).toBe(3)
  })

  it('只出现一个月的支出不算固定支出', () => {
    const r = fixedExpenses([tx({ note: '一次性', date: '2026-03-05' })], [], '2026-03', 6)
    expect(r.items).toHaveLength(0)
  })
})

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */

describe('categoryTrend', () => {
  it('支出趋势（默认）', () => {
    const txs = [tx({ type: 'expense', amount: 1000, categoryId: 'c-food', date: '2026-03-10' })]
    const t = categoryTrend(txs, 'c-food', '2026-03', 6)
    expect(t).toHaveLength(6)
    expect(t[5].amount).toBe(1000)
  })

  it('收入趋势应统计收入而非恒为 0（回归测试）', () => {
    const txs = [tx({ type: 'income', amount: 50_000, categoryId: 'i-salary', date: '2026-03-10' })]
    const t = categoryTrend(txs, 'i-salary', '2026-03', 6, 'income')
    expect(t[5].amount).toBe(50_000)
  })
})

describe('trend', () => {
  it('返回连续 N 个月且按时间升序', () => {
    const t = trend([], '2026-03', 6)
    expect(t.map((p) => p.month)).toEqual([
      '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
    ])
  })
})

describe('overspendStreak', () => {
  it('额度为 0 时返回 0', () => {
    expect(overspendStreak([], 0).streak).toBe(0)
  })

  it('连续超支会被累计', () => {
    const txs = [
      tx({ amount: 5000, date: '2026-03-09' }),
      tx({ amount: 5000, date: '2026-03-08' }),
      tx({ amount: 5000, date: '2026-03-07' }),
    ]
    expect(overspendStreak(txs, 1000, '2026-03-09').streak).toBe(3)
  })

  it('没有超支时中断', () => {
    expect(overspendStreak([tx({ amount: 10, date: '2026-03-09' })], 1000, '2026-03-09').streak).toBe(0)
  })
})

describe('parseQuickAdd', () => {
  const categories = [
    { id: 'c-food', name: '餐饮', icon: 'food' as const, color: '#f00', type: 'expense' as const },
  ]

  it('解析「早餐 12」', () => {
    const r = parseQuickAdd('早餐 12', categories)
    expect(r?.amount).toBe(1200)
    expect(r?.note).toBe('早餐')
  })

  it('带小数点与「元」', () => {
    expect(parseQuickAdd('打车 25.5元', categories)?.amount).toBe(2550)
  })

  it('没有数字时返回 null', () => {
    expect(parseQuickAdd('没有金额', categories)).toBeNull()
  })

  it('金额为 0 时返回 null', () => {
    expect(parseQuickAdd('早餐 0', categories)).toBeNull()
  })

  it('文字整体等于分类名时命中分类', () => {
    const r = parseQuickAdd('餐饮 12', categories)
    expect(r?.categoryId).toBe('c-food')
    expect(r?.note).toBe('')
  })

  it('空输入返回 null', () => {
    expect(parseQuickAdd('   ', categories)).toBeNull()
  })
})
