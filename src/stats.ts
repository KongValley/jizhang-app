import type {
  Account,
  AppData,
  Budget,
  Category,
  DebtPlan,
  MoneyType,
  QuickTemplate,
  RecurrenceRule,
  RecurringRule,
  Transaction,
} from './types'
import type { IconName } from './icon-set'
import { addMonths, clamp, currentMonth, daysInMonth, monthEndKey, monthProgress, todayKey } from './utils'

export interface Summary {
  expense: number
  income: number
  net: number
  count: number
}

/* ---------------- 类型判断 ---------------- */

export function isMoneyTx(t: Transaction): boolean {
  return t.type === 'expense' || t.type === 'income'
}

export function txTypeLabel(t: Transaction, accounts?: Account[]): string {
  if (t.type === 'transfer') {
    const from = accounts?.find((a) => a.id === t.accountId)?.name ?? '账户'
    const to = accounts?.find((a) => a.id === t.toAccountId)?.name ?? '账户'
    return `${from} → ${to}`
  }
  if (t.type === 'adjust') return '余额调整'
  return t.type === 'income' ? '收入' : '支出'
}

/* ---------------- 基础汇总 ---------------- */

export function sortTx(txs: Transaction[]): Transaction[] {
  return [...txs].sort((a, b) =>
    a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1,
  )
}

export function txInMonth(txs: Transaction[], month: string): Transaction[] {
  return txs.filter((t) => t.date.startsWith(month))
}

/** 只统计收支，转账与余额调整不计入 */
export function summarize(txs: Transaction[]): Summary {
  let expense = 0
  let income = 0
  let count = 0
  for (const t of txs) {
    if (t.type === 'income') {
      income += t.amount
      count += 1
    } else if (t.type === 'expense') {
      expense += t.amount
      count += 1
    }
  }
  return { expense, income, net: income - expense, count }
}

export interface BreakdownItem {
  id: string
  name: string
  icon: IconName
  color: string
  amount: number
  count: number
  share: number
}

export function breakdown(txs: Transaction[], categories: Category[], type: MoneyType): BreakdownItem[] {
  const map = new Map<string, { amount: number; count: number }>()
  let total = 0
  for (const t of txs) {
    if (t.type !== type) continue
    const entry = map.get(t.categoryId) ?? { amount: 0, count: 0 }
    entry.amount += t.amount
    entry.count += 1
    map.set(t.categoryId, entry)
    total += t.amount
  }
  const catMap = new Map(categories.map((c) => [c.id, c]))
  return [...map.entries()]
    .map(([id, v]) => {
      const c = catMap.get(id)
      return {
        id,
        name: c?.name ?? '未分类',
        icon: c?.icon ?? 'box',
        color: c?.color ?? '#94a3b8',
        amount: v.amount,
        count: v.count,
        share: total > 0 ? v.amount / total : 0,
      }
    })
    .sort((a, b) => b.amount - a.amount)
}

/** 把尾部小项合并成“其他”，让图例保持简洁 */
export function topWithRest(items: BreakdownItem[], n: number): BreakdownItem[] {
  if (items.length <= n + 1) return items
  const head = items.slice(0, n)
  const rest = items.slice(n)
  const amount = rest.reduce((s, i) => s + i.amount, 0)
  const count = rest.reduce((s, i) => s + i.count, 0)
  const headAmount = head.reduce((s, i) => s + i.amount, 0)
  return [
    ...head,
    {
      id: '__rest__',
      name: `其他 ${rest.length} 类`,
      icon: 'ellipsis',
      color: '#94a3b8',
      amount,
      count,
      share: headAmount + amount > 0 ? amount / (headAmount + amount) : 0,
    },
  ]
}

export interface TrendPoint {
  month: string
  expense: number
  income: number
}

export function trend(txs: Transaction[], endMonth: string, count: number): TrendPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const month = addMonths(endMonth, i - count + 1)
    const s = summarize(txInMonth(txs, month))
    return { month, expense: s.expense, income: s.income }
  })
}

/** 单个分类近 N 个月的金额（供分类趋势使用）；type 决定统计支出还是收入 */
export function categoryTrend(
  txs: Transaction[],
  categoryId: string,
  endMonth: string,
  count: number,
  type: MoneyType = 'expense',
): { month: string; amount: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const month = addMonths(endMonth, i - count + 1)
    let amount = 0
    for (const t of txs) {
      if (t.type === type && t.categoryId === categoryId && t.date.startsWith(month)) {
        amount += t.amount
      }
    }
    return { month, amount }
  })
}

/* ---------------- 账户余额 ---------------- */

function applyTx(balance: number, t: Transaction, accountId: string): number {
  switch (t.type) {
    case 'income':
      return t.accountId === accountId ? balance + t.amount : balance
    case 'expense':
      return t.accountId === accountId ? balance - t.amount : balance
    case 'transfer':
      if (t.accountId === accountId) return balance - t.amount
      if (t.toAccountId === accountId) return balance + t.amount
      return balance
    case 'adjust':
      return t.accountId === accountId ? balance + t.amount : balance
    default:
      return balance
  }
}

export function accountBalance(txs: Transaction[], account: Account): number {
  let balance = account.initialBalance
  for (const t of txs) {
    balance = applyTx(balance, t, account.id)
  }
  return balance
}

/**
 * 一次遍历算出所有账户的余额变动（不含期初余额）。
 * 避免「每个账户各扫一遍全表」的 O(账户数 × 账单数) 开销。
 */
export function balanceDeltas(txs: Transaction[], cutoff = '9999-12-31'): Map<string, number> {
  const deltas = new Map<string, number>()
  const add = (id: string | undefined, amount: number) => {
    if (!id) return
    deltas.set(id, (deltas.get(id) ?? 0) + amount)
  }
  for (const t of txs) {
    if (t.date > cutoff) continue
    switch (t.type) {
      case 'income':
        add(t.accountId, t.amount)
        break
      case 'expense':
        add(t.accountId, -t.amount)
        break
      case 'adjust':
        add(t.accountId, t.amount)
        break
      case 'transfer':
        add(t.accountId, -t.amount)
        add(t.toAccountId, t.amount)
        break
    }
  }
  return deltas
}

/** 基于 balanceDeltas 的账户余额查询表 */
export function balanceMap(
  txs: Transaction[],
  accounts: Account[],
  cutoff = '9999-12-31',
): Map<string, number> {
  const deltas = balanceDeltas(txs, cutoff)
  const map = new Map<string, number>()
  for (const a of accounts) {
    map.set(a.id, a.initialBalance + (deltas.get(a.id) ?? 0))
  }
  return map
}

export function accountNature(account: Account): 'asset' | 'liability' {
  return account.nature ?? (account.kind === 'credit' ? 'liability' : 'asset')
}

/** 截至某一天（含当天）的账户余额 */
export function accountBalanceAt(txs: Transaction[], account: Account, cutoff: string): number {
  let balance = account.initialBalance
  for (const t of txs) {
    if (t.date > cutoff) continue
    balance = applyTx(balance, t, account.id)
  }
  return balance
}

/** 余额校准：生成一笔调整记录，把账户当前余额对齐到目标值 */
export function adjustTransaction(
  account: Account,
  txs: Transaction[],
  targetBalance: number,
  date = todayKey(),
): Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> | null {
  const diff = Math.round(targetBalance) - accountBalance(txs, account)
  if (diff === 0) return null
  return {
    type: 'adjust',
    amount: diff,
    categoryId: '',
    accountId: account.id,
    note: diff > 0 ? '余额调增' : '余额调减',
    date,
  }
}

export interface WorthItem {
  account: Account
  balance: number
  share: number
}

export interface NetWorthSnapshot {
  assets: number
  liabilities: number
  net: number
  assetItems: WorthItem[]
  liabilityItems: WorthItem[]
}

/**
 * 资产负债快照：
 * - 资产账户余额直接计入资产（可为负）
 * - 负债账户余额为负时，绝对值计入负债；为正（溢缴）时计入资产
 * - 净资产 = 总资产 - 总负债 = 所有账户余额之和
 */
export function netWorthAt(data: AppData, cutoff: string): NetWorthSnapshot {
  const assetItems: WorthItem[] = []
  const liabilityItems: WorthItem[] = []
  let assets = 0
  let liabilities = 0
  // 一次遍历算出全部账户余额，避免逐账户重扫全表
  const balances = balanceMap(data.transactions, data.accounts, cutoff)

  for (const account of data.accounts) {
    const balance = balances.get(account.id) ?? account.initialBalance
    if (accountNature(account) === 'liability') {
      if (balance < 0) {
        const owed = -balance
        liabilities += owed
        liabilityItems.push({ account, balance: owed, share: 0 })
      } else {
        assets += balance
        assetItems.push({ account, balance, share: 0 })
      }
    } else {
      assets += balance
      assetItems.push({ account, balance, share: 0 })
    }
  }

  const assetSum = assetItems.reduce((sum, item) => sum + Math.max(item.balance, 0), 0)
  for (const item of assetItems) {
    item.share = assetSum > 0 ? Math.max(item.balance, 0) / assetSum : 0
  }
  for (const item of liabilityItems) {
    item.share = liabilities > 0 ? item.balance / liabilities : 0
  }

  assetItems.sort((a, b) => b.balance - a.balance)
  liabilityItems.sort((a, b) => b.balance - a.balance)

  return { assets, liabilities, net: assets - liabilities, assetItems, liabilityItems }
}

export interface WorthTrendPoint {
  month: string
  assets: number
  liabilities: number
  net: number
}

export function balanceTrend(data: AppData, endMonth: string, count: number): WorthTrendPoint[] {
  const now = currentMonth()
  return Array.from({ length: count }, (_, i) => {
    const month = addMonths(endMonth, i - count + 1)
    const cutoff = month === now ? todayKey() : monthEndKey(month)
    const snapshot = netWorthAt(data, cutoff)
    return {
      month,
      assets: snapshot.assets,
      liabilities: snapshot.liabilities,
      net: snapshot.net,
    }
  })
}

export function totalBalance(data: AppData): number {
  // 单次遍历：账户余额之和 = 期初余额之和 + 所有账户净变动
  const deltas = balanceDeltas(data.transactions)
  let sum = 0
  for (const a of data.accounts) sum += a.initialBalance
  for (const v of deltas.values()) sum += v
  return sum
}

/* ---------------- 预算 ---------------- */

export function findBudget(budgets: Budget[], month: string, categoryId: string): Budget | undefined {
  return budgets.find((b) => b.month === month && b.categoryId === categoryId)
}

export function spentFor(txs: Transaction[], month: string, categoryId: string): number {
  let total = 0
  for (const t of txs) {
    if (t.type !== 'expense' || !t.date.startsWith(month)) continue
    if (categoryId !== 'all' && t.categoryId !== categoryId) continue
    total += t.amount
  }
  return total
}

/** 一次遍历统计本月各分类支出，供预算列表复用，避免每个预算各扫一遍 */
export function spentByCategory(txs: Transaction[], month: string): Map<string, number> {
  const map = new Map<string, number>()
  for (const t of txs) {
    if (t.type !== 'expense' || !t.date.startsWith(month)) continue
    map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount)
  }
  return map
}

/** 从 spentByCategory 的结果里取某个分类（或全部）的支出 */
export function spentFromMap(map: Map<string, number>, categoryId: string): number {
  if (categoryId !== 'all') return map.get(categoryId) ?? 0
  let total = 0
  for (const v of map.values()) total += v
  return total
}

export interface BudgetStatus {
  budget: number
  spent: number
  remaining: number
  ratio: number
  over: boolean
  daysLeft: number
  dailyLeft: number
}

export function budgetStatus(
  txs: Transaction[],
  month: string,
  budget: Budget,
  /** 可选：复用已算好的本月分类支出，避免重复全表扫描 */
  spends?: Map<string, number>,
): BudgetStatus {
  const spent = spends ? spentFromMap(spends, budget.categoryId) : spentFor(txs, month, budget.categoryId)
  const remaining = budget.amount - spent
  const { left } = monthProgress(month)
  const daysLeft = month === currentMonth() ? left + 1 : left > 0 ? left : 0
  return {
    budget: budget.amount,
    spent,
    remaining,
    ratio: budget.amount > 0 ? spent / budget.amount : 0,
    over: spent > budget.amount,
    daysLeft,
    dailyLeft: daysLeft > 0 ? Math.max(remaining, 0) / daysLeft : 0,
  }
}

export function daysLeftInMonth(month: string): number {
  return monthProgress(month).left
}

export function daysTotal(month: string): number {
  return daysInMonth(month)
}

/* ---------------- 日均预算提醒 ---------------- */

export interface DailyAllowance {
  /** 本月总预算 */
  budget: number
  /** 本月已支出 */
  spent: number
  /** 剩余额度 */
  remaining: number
  /** 剩余天数（含今天） */
  daysLeft: number
  /** 今天还能花多少 */
  todayAllow: number
  /** 今天已花 */
  todaySpent: number
  /** 今天是否已经超过今天额度 */
  overToday: boolean
  /** 进度：理想进度（按时间）vs 实际花费占比 */
  idealRatio: number
  actualRatio: number
  /** 是否超前消费（实际支出比例明显超过时间进度） */
  ahead: boolean
}

export function dailyAllowance(
  txs: Transaction[],
  month: string,
  budget: number,
  today = todayKey(),
): DailyAllowance | null {
  if (budget <= 0) return null
  const spent = spentFor(txs, month, 'all')
  const { elapsed, total, left } = monthProgress(month)
  // 当前月要把今天算进剩余天数，返回值与实际除数保持一致，
  // 避免调用方用 remaining / daysLeft 得到与 todayAllow 不同的结果
  const daysLeft = month === currentMonth() ? left + 1 : Math.max(1, left)
  const remaining = budget - spent
  const todaySpent = txs
    .filter((t) => t.type === 'expense' && t.date === today)
    .reduce((s, t) => s + t.amount, 0)
  const todayAllow = Math.max(0, remaining) / daysLeft
  return {
    budget,
    spent,
    remaining,
    daysLeft,
    todayAllow,
    todaySpent,
    overToday: todaySpent > todayAllow,
    idealRatio: elapsed / total,
    actualRatio: spent / budget,
    ahead: spent / budget > (elapsed / total) * 1.15 && elapsed < total,
  }
}

/* ---------------- 每日热力图 ---------------- */

export interface HeatDay {
  date: string
  expense: number
  income: number
  /** 1-4 档，0 表示当天没有支出 */
  level: 0 | 1 | 2 | 3 | 4
}

export interface HeatmapData {
  /** 最多 6 行，每行从周一开始，第一期可能以 null 补齐 */
  weeks: (HeatDay | null)[][]
  days: HeatDay[]
  max: number
  total: number
  worst: HeatDay | null
  activeDays: number
}

/* ---------------- 年度总结 ---------------- */

export interface AnnualSummary {
  year: string
  expense: number
  income: number
  net: number
  count: number
  monthsRecorded: number
  monthlyAvg: number
  topMonth: { month: string; amount: number } | null
  topCategory: { name: string; icon: IconName; color: string; count: number } | null
}

/** 某一年的收支总结：全年合计、最高支出月份、最常出现的分类 */
export function annualSummary(
  txs: Transaction[],
  categories: { id: string; name: string; icon: IconName; color: string }[],
  month: string,
): AnnualSummary {
  const year = month.slice(0, 4)
  const catMap = new Map(categories.map((c) => [c.id, c]))
  const byMonth = new Map<string, number>()
  const byCat = new Map<string, number>()
  let expense = 0
  let income = 0
  let count = 0

  for (const t of txs) {
    if (t.type !== 'expense' && t.type !== 'income') continue
    if (!t.date.startsWith(year)) continue
    const m = t.date.slice(0, 7)
    count += 1
    if (t.type === 'expense') {
      expense += t.amount
      byMonth.set(m, (byMonth.get(m) ?? 0) + t.amount)
      byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + 1)
    } else {
      income += t.amount
    }
  }

  let topMonth: AnnualSummary['topMonth'] = null
  for (const [m, amount] of byMonth) {
    if (!topMonth || amount > topMonth.amount) topMonth = { month: m, amount }
  }

  let topCatId: string | null = null
  let topCatCount = 0
  for (const [id, c] of byCat) {
    if (c > topCatCount) {
      topCatId = id
      topCatCount = c
    }
  }
  const topCat = topCatId ? catMap.get(topCatId) : undefined

  return {
    year,
    expense,
    income,
    net: income - expense,
    count,
    monthsRecorded: byMonth.size,
    monthlyAvg: byMonth.size > 0 ? expense / byMonth.size : 0,
    topMonth,
    topCategory: topCat
      ? { name: topCat.name, icon: topCat.icon, color: topCat.color, count: topCatCount }
      : null,
  }
}

export function expenseHeatmap(txs: Transaction[], month: string): HeatmapData {
  const total = daysInMonth(month)
  const daily = new Map<string, { expense: number; income: number }>()
  for (const t of txs) {
    if (!t.date.startsWith(month)) continue
    if (t.type !== 'expense' && t.type !== 'income') continue
    const key = t.date
    const entry = daily.get(key) ?? { expense: 0, income: 0 }
    if (t.type === 'expense') entry.expense += t.amount
    else entry.income += t.amount
    daily.set(key, entry)
  }

  const values = [...daily.values()].map((v) => v.expense).filter((v) => v > 0)
  const max = values.length ? Math.max(...values) : 0

  const days: HeatDay[] = []
  for (let d = 1; d <= total; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`
    const v = daily.get(date) ?? { expense: 0, income: 0 }
    let level: HeatDay['level'] = 0
    if (v.expense > 0 && max > 0) {
      const ratio = v.expense / max
      level = ratio >= 0.75 ? 4 : ratio >= 0.5 ? 3 : ratio >= 0.25 ? 2 : 1
    }
    days.push({ date, expense: v.expense, income: v.income, level })
  }

  const [y, m] = month.split('-').map(Number)
  const firstWeekday = (new Date(y, m - 1, 1).getDay() + 6) % 7 // 周一为 0
  const weeks: (HeatDay | null)[][] = []
  let current: (HeatDay | null)[] = Array.from({ length: firstWeekday }, () => null)
  for (const day of days) {
    current.push(day)
    if (current.length === 7) {
      weeks.push(current)
      current = []
    }
  }
  if (current.length) {
    while (current.length < 7) current.push(null)
    weeks.push(current)
  }

  const worst = days.reduce<HeatDay | null>(
    (best, d) => (!best || d.expense > best.expense ? d : best),
    null,
  )

  return {
    weeks: weeks.slice(-6),
    days,
    max,
    total: days.reduce((s, d) => s + d.expense, 0),
    worst: worst && worst.expense > 0 ? worst : null,
    activeDays: days.filter((d) => d.expense > 0).length,
  }
}

/* ---------------- 时段对比 ---------------- */

export interface PeriodCompare {
  label: string
  current: number
  previous: number
  diff: number
  /** 相对变化百分比，previous 为 0 时返回 null */
  rate: number | null
}

function sumExpense(txs: Transaction[]): number {
  return txs
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0)
}

function dayOffset(base: string, days: number): string {
  const [y, m, d] = base.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate(),
  ).padStart(2, '0')}`
}

function compare(label: string, current: number, previous: number): PeriodCompare {
  const diff = current - previous
  return {
    label,
    current,
    previous,
    diff,
    rate: previous > 0 ? (diff / previous) * 100 : null,
  }
}

/** 今天 vs 昨天、本周 vs 上周、本月 vs 上月同期 */
export function periodComparison(txs: Transaction[], today = todayKey()): PeriodCompare[] {
  const yesterday = dayOffset(today, -1)
  const thisMonth = today.slice(0, 7)
  const prevMonth = addMonths(thisMonth, -1)
  const day = Number(today.slice(8, 10))
  const sameDayPrevMonth = `${prevMonth}-${String(Math.min(day, daysInMonth(prevMonth))).padStart(2, '0')}`

  const thisWeekFrom = dayOffset(today, -6)
  const lastWeekFrom = dayOffset(today, -13)
  const lastWeekTo = dayOffset(today, -7)

  const inRange = (from: string, to: string) =>
    txs.filter((t) => t.date >= from && t.date <= to)

  const todayTx = txs.filter((t) => t.date === today)
  const yesterdayTx = txs.filter((t) => t.date === yesterday)

  return [
    compare('今天 vs 昨天', sumExpense(todayTx), sumExpense(yesterdayTx)),
    compare(
      '近 7 天 vs 前 7 天',
      sumExpense(inRange(thisWeekFrom, today)),
      sumExpense(inRange(lastWeekFrom, lastWeekTo)),
    ),
    compare(
      '本月 vs 上月同期',
      sumExpense(txs.filter((t) => t.date >= `${thisMonth}-01` && t.date <= today)),
      sumExpense(txs.filter((t) => t.date >= `${prevMonth}-01` && t.date <= sameDayPrevMonth)),
    ),
  ]
}

/* ---------------- 固定支出 ---------------- */

export interface FixedItem {
  /** 'category:xxx' 表示分类级别，'note:xxx' 表示具体项目 */
  key: string
  name: string
  icon: IconName
  color: string
  categoryId: string
  monthlyAvg: number
  lastAmount: number
  months: number
  share: number
}

export interface FixedExpenseResult {
  items: FixedItem[]
  monthlyTotal: number
  total: number
  share: number
  monthsUsed: number
}

/**
 * 识别固定支出：在最近 N 个月里至少出现一半月份的支出项目。
 * 有备注的按“分类 + 备注”归并（更精细，比如房租），没有备注的按分类归并。
 */
export function fixedExpenses(
  txs: Transaction[],
  categories: Category[],
  endMonth: string,
  months = 6,
): FixedExpenseResult {
  const monthList = Array.from({ length: months }, (_, i) => addMonths(endMonth, i - months + 1))
  const monthSet = new Set(monthList)
  const catMap = new Map(categories.map((c) => [c.id, c]))
  const groups = new Map<
    string,
    { categoryId: string; note: string; byMonth: Map<string, number>; lastDate: string; lastAmount: number }
  >()

  for (const t of txs) {
    if (t.type !== 'expense') continue
    const month = t.date.slice(0, 7)
    if (!monthSet.has(month)) continue
    const note = t.note.trim()
    const key = note ? `note:${t.categoryId}:${note}` : `category:${t.categoryId}`
    const g =
      groups.get(key) ??
      { categoryId: t.categoryId, note, byMonth: new Map(), lastDate: '', lastAmount: 0 }
    g.byMonth.set(month, (g.byMonth.get(month) ?? 0) + t.amount)
    if (t.date >= g.lastDate) {
      g.lastDate = t.date
      g.lastAmount = t.amount
    }
    groups.set(key, g)
  }

  const minMonths = Math.max(2, Math.ceil(months / 2))
  const items: FixedItem[] = []
  let monthlyTotal = 0
  let total = 0

  for (const [key, g] of groups) {
    if (g.byMonth.size < minMonths) continue
    const sum = [...g.byMonth.values()].reduce((s, v) => s + v, 0)
    const monthlyAvg = sum / g.byMonth.size
    const cat = catMap.get(g.categoryId)
    items.push({
      key,
      name: g.note || cat?.name || '未分类',
      icon: cat?.icon ?? 'box',
      color: cat?.color ?? '#94a3b8',
      categoryId: g.categoryId,
      monthlyAvg,
      lastAmount: g.lastAmount,
      months: g.byMonth.size,
      share: 0,
    })
    monthlyTotal += monthlyAvg
    total += sum
  }

  items.sort((a, b) => b.monthlyAvg - a.monthlyAvg)
  const regularTotal = txs
    .filter((t) => t.type === 'expense' && monthSet.has(t.date.slice(0, 7)))
    .reduce((s, t) => s + t.amount, 0)
  for (const item of items) {
    item.share = monthlyTotal > 0 ? item.monthlyAvg / monthlyTotal : 0
  }

  return {
    items,
    monthlyTotal,
    total,
    share: regularTotal > 0 ? total / regularTotal : 0,
    monthsUsed: months,
  }
}

/* ---------------- 负债还款计划 ---------------- */

export interface PayoffForecast {
  /** 还需几个月；null 表示无法还清 */
  months: number | null
  /** 预计还清月份 YYYY-MM */
  date: string | null
  /** 每月利息（分） */
  monthlyInterest: number
  /** 预计总利息（分） */
  totalInterest: number
  /** 月供是否足够覆盖利息并逐步还清 */
  feasible: boolean
}

/** 按等额月供估算还清时间（含利息） */
export function forecastPayoff(
  owed: number,
  monthlyPayment: number,
  aprPercent = 0,
  fromMonth = currentMonth(),
): PayoffForecast {
  const rate = Math.max(0, aprPercent) / 100 / 12
  const monthlyInterest = Math.round(owed * rate)
  if (owed <= 0) {
    return { months: 0, date: fromMonth, monthlyInterest: 0, totalInterest: 0, feasible: true }
  }
  if (monthlyPayment <= 0) {
    return { months: null, date: null, monthlyInterest, totalInterest: 0, feasible: false }
  }
  if (rate > 0 && monthlyPayment <= monthlyInterest) {
    return { months: null, date: null, monthlyInterest, totalInterest: 0, feasible: false }
  }
  let months: number
  if (rate === 0) {
    months = Math.ceil(owed / monthlyPayment)
  } else {
    months = Math.ceil(Math.log(monthlyPayment / (monthlyPayment - monthlyInterest)) / Math.log(1 + rate))
  }
  if (!Number.isFinite(months) || months <= 0 || months > 1200) {
    return { months: null, date: null, monthlyInterest, totalInterest: 0, feasible: false }
  }
  // 无息贷款没有利息；有息时总利息 = 总还款额 - 本金
  const totalInterest = rate === 0 ? 0 : Math.max(0, Math.round(months * monthlyPayment - owed))
  return {
    months,
    date: addMonths(fromMonth, months),
    monthlyInterest,
    totalInterest,
    feasible: true,
  }
}

export interface DebtItem {
  account: Account
  plan?: DebtPlan
  /** 当前欠款（正数） */
  owed: number
  /** 起始本金（正数） */
  principal: number
  /** 已还本金，可能为负（新增借款） */
  repaid: number
  /** 还款进度 0-1 */
  progress: number
  monthlyPayment: number
  paymentSource: 'plan' | 'history' | 'none'
  /** 近 6 个月平均每月净还款 */
  avgReduction: number
  forecast: PayoffForecast
  /** 本月净还款 */
  repaidThisMonth: number
  /** 是否已还清 */
  settled: boolean
  /** 欠款是否已超过起始本金 */
  overPrincipal: boolean
}

export interface DebtSummary {
  items: DebtItem[]
  totalOwed: number
  totalPrincipal: number
  totalRepaid: number
  progress: number
  monthlyPayment: number
  monthsLeft: number | null
  payoffDate: string | null
  totalInterest: number
  repaidThisMonth: number
  settled: boolean
  /** 是否存在无法按当前计划还清的债务 */
  stalled: boolean
}

/** 近 6 个月平均每月减少的欠款（基于已算好的余额表，避免重复扫全表） */
function averageReduction(startBalance: number, currentBalance: number): number {
  const startDebt = Math.max(0, -startBalance)
  const current = Math.max(0, -currentBalance)
  const reduction = (startDebt - current) / 6
  return reduction > 0 ? Math.round(reduction) : 0
}

export function debtSummary(data: AppData, today = todayKey()): DebtSummary {
  const items: DebtItem[] = []
  const plans = new Map(data.debts.map((d) => [d.accountId, d]))
  const thisMonth = today.slice(0, 7)
  const prevMonthEnd = monthEndKey(addMonths(thisMonth, -1))
  const startMonthEnd = monthEndKey(addMonths(thisMonth, -6))

  // 三张余额表各只需一次全表遍历，替代原来每个负债账户各扫 3 遍
  const nowBalances = balanceMap(data.transactions, data.accounts)
  const prevBalances = balanceMap(data.transactions, data.accounts, prevMonthEnd)
  const startBalances = balanceMap(data.transactions, data.accounts, startMonthEnd)

  for (const account of data.accounts) {
    if (accountNature(account) !== 'liability') continue
    const plan = plans.get(account.id)
    const balance = nowBalances.get(account.id) ?? account.initialBalance
    const owed = Math.max(0, -balance)
    const isTracked = plan !== undefined || account.initialBalance < 0 || owed > 0
    if (!isTracked) continue
    // 有还款计划时以计划本金为准；否则用「当前欠款 / 期初欠款」中较大者，
    // 这样新增借款会让 repaid 变负、overPrincipal 真正生效
    const principal = plan?.principal ?? Math.max(owed, Math.abs(account.initialBalance))
    const repaid = principal - owed
    const progress = principal > 0 ? clamp(repaid / principal, 0, 1) : 0
    const avgReduction = averageReduction(
      startBalances.get(account.id) ?? account.initialBalance,
      balance,
    )
    const monthlyPayment =
      plan && plan.monthlyPayment > 0 ? plan.monthlyPayment : avgReduction
    const paymentSource: DebtItem['paymentSource'] =
      plan && plan.monthlyPayment > 0 ? 'plan' : avgReduction > 0 ? 'history' : 'none'
    const forecast = forecastPayoff(owed, monthlyPayment, plan?.apr ?? 0, thisMonth)
    const prevOwed = Math.max(0, -(prevBalances.get(account.id) ?? account.initialBalance))

    items.push({
      account,
      plan,
      owed,
      principal,
      repaid,
      progress,
      monthlyPayment,
      paymentSource,
      avgReduction,
      forecast,
      repaidThisMonth: Math.max(0, prevOwed - owed),
      settled: owed <= 0,
      overPrincipal: owed > principal,
    })
  }

  items.sort((a, b) => b.owed - a.owed)
  const active = items.filter((i) => i.owed > 0)
  const totalOwed = items.reduce((s, i) => s + i.owed, 0)
  const totalPrincipal = items.reduce((s, i) => s + i.principal, 0)
  const totalRepaid = totalPrincipal - totalOwed
  const monthlyPayment = items.reduce((s, i) => s + i.monthlyPayment, 0)
  const stalled = active.some((i) => i.forecast.months === null)
  const monthsLeft = active.length
    ? stalled
      ? null
      : Math.max(...active.map((i) => i.forecast.months ?? 0))
    : 0
  const payoffDate = monthsLeft === null ? null : addMonths(thisMonth, monthsLeft)
  const totalInterest = active.reduce((s, i) => s + i.forecast.totalInterest, 0)
  const repaidThisMonth = items.reduce((s, i) => s + i.repaidThisMonth, 0)
  const settled = active.length === 0

  return {
    items,
    totalOwed,
    totalPrincipal,
    totalRepaid,
    progress: totalPrincipal > 0 ? clamp(totalRepaid / totalPrincipal, 0, 1) : 0,
    monthlyPayment,
    monthsLeft,
    payoffDate,
    totalInterest,
    repaidThisMonth,
    settled,
    stalled,
  }
}

/** 未来若干个月的总欠款走势（按每个债务各自的月供与利率模拟） */
export function debtProjection(items: DebtItem[], maxMonths = 600): { month: string; balance: number }[] {
  const active = items.filter((i) => i.owed > 0)
  if (!active.length) return []
  const startMonth = currentMonth()
  const balances = active.map((i) => i.owed)
  const payments = active.map((i) => i.monthlyPayment)
  const rates = active.map((i) => Math.max(0, i.plan?.apr ?? 0) / 100 / 12)
  const points: { month: string; balance: number }[] = [
    { month: startMonth, balance: balances.reduce((s, v) => s + v, 0) },
  ]
  let month = startMonth
  for (let m = 1; m <= maxMonths; m++) {
    let alive = false
    for (let i = 0; i < balances.length; i++) {
      if (balances[i] <= 0) continue
      balances[i] = balances[i] * (1 + rates[i]) - payments[i]
      if (balances[i] > 0.5) alive = true
      else balances[i] = 0
    }
    month = addMonths(startMonth, m)
    points.push({ month, balance: Math.max(0, Math.round(balances.reduce((s, v) => s + v, 0))) })
    if (!alive) break
  }
  return points
}

/* ---------------- 连续超支 ---------------- */

export interface OverspendSignal {
  /** 连续多少天高于日均额度 */
  streak: number
  /** 这些天的平均支出 */
  average: number
  /** 日均额度 */
  allowance: number
}

/** 从今天往前数，连续超出日均额度的天数（今天还没花钱则从昨天开始算） */
export function overspendStreak(
  txs: Transaction[],
  allowance: number,
  today = todayKey(),
): OverspendSignal {
  if (allowance <= 0) return { streak: 0, average: 0, allowance: 0 }
  const byDay = new Map<string, number>()
  for (const t of txs) {
    if (t.type !== 'expense') continue
    byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.amount)
  }
  let streak = 0
  let sum = 0
  let cursor = today
  for (let i = 0; i < 30; i++) {
    const spent = byDay.get(cursor) ?? 0
    if (i === 0 && spent === 0) {
      cursor = dayOffset(cursor, -1)
      continue
    }
    if (spent <= allowance) break
    streak += 1
    sum += spent
    cursor = dayOffset(cursor, -1)
  }
  return { streak, average: streak ? sum / streak : 0, allowance }
}

/* ---------------- 快捷记账解析 ---------------- */

export interface ParsedQuickAdd {
  amount: number
  categoryId: string | null
  categoryName: string | null
  note: string
}

const AMOUNT_PATTERN = /(?:^|\s)(\d{1,7}(?:\.\d{1,2})?)(?:\s*元)?(?=\s|$)/

/**
 * 解析“早餐 12”“打车 25.5元”这类输入。
 * 数字作为金额；文字整体等于某个分类名时用该分类，
 * 否则只把文字当备注（不做模糊包含匹配，避免“打车”被认成“餐饮”）。
 */
export function parseQuickAdd(text: string, categories: Category[]): ParsedQuickAdd | null {
  const raw = text.trim()
  if (!raw) return null
  const match = raw.match(AMOUNT_PATTERN)
  if (!match) return null
  const amount = Math.round(Number(match[1]) * 100)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const start = match.index ?? 0
  const rest = (raw.slice(0, start) + ' ' + raw.slice(start + match[0].length))
    .replace(/元/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

  const active = categories.filter((c) => c.type === 'expense' && !c.archived)
  const matched =
    active.find((c) => rest === c.name) ??
    (rest.startsWith('早餐') ? active.find((c) => c.name === '餐饮') ?? null : null)

  return {
    amount,
    categoryId: matched?.id ?? null,
    categoryName: matched?.name ?? null,
    note: matched && rest === matched.name ? '' : rest,
  }
}

/** 根据历史记录生成快捷记账模板：按“分类 + 备注”统计最近 90 天出现次数 */
export function suggestTemplates(txs: Transaction[], limit = 4): QuickTemplate[] {
  const cutoff = dayOffset(todayKey(), -90)
  const groups = new Map<string, { count: number; last: Transaction; sum: number }>()
  for (const t of txs) {
    if (t.type !== 'expense' || t.date < cutoff) continue
    const key = `${t.categoryId}|${t.note.trim()}`
    const g = groups.get(key)
    if (g) {
      g.count += 1
      g.sum += t.amount
      if (t.date >= g.last.date) g.last = t
    } else {
      groups.set(key, { count: 1, last: t, sum: t.amount })
    }
  }
  return [...groups.values()]
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((g, i) => ({
      id: `suggest-${i}`,
      label: g.last.note.trim() || '常用记账',
      type: 'expense' as const,
      amount: Math.round(g.sum / g.count),
      categoryId: g.last.categoryId,
      accountId: g.last.accountId,
      note: g.last.note,
      createdAt: Date.now(),
    }))
}

/* ---------------- 周期账单 ---------------- */

/**
 * 在给定日期上加周期。
 * anchorDay 用于「每月固定某天」的场景：从 1 月 31 日推进到 2 月会得到 2 月 28 日，
 * 但下个月应当回到 31 日，而不是永久停在 28 日。
 */
export function nextRecurringDate(
  date: string,
  rule: RecurrenceRule,
  interval: number,
  anchorDay?: number,
): string {
  const [y, m, d] = date.split('-').map(Number)
  const step = Math.max(1, interval)
  if (rule === 'daily') {
    const dt = new Date(y, m - 1, d + step)
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
      dt.getDate(),
    ).padStart(2, '0')}`
  }
  if (rule === 'weekly') return dayOffset(date, step * 7)
  if (rule === 'yearly') {
    const target = new Date(y + step, m - 1, d)
    // 2 月 29 日等情况会被自动滚到 3 月 1 日，这里回退到月末
    if (target.getDate() !== d) target.setDate(0)
    return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(
      target.getDate(),
    ).padStart(2, '0')}`
  }
  const monthIndex = y * 12 + (m - 1) + step
  const ty = Math.floor(monthIndex / 12)
  const tm = (monthIndex % 12) + 1
  const maxDay = daysInMonth(`${ty}-${String(tm).padStart(2, '0')}`)
  // 优先用锚定日，保证「每月最后一天」这类规则不会因为 2 月而永久偏移
  const day = Math.min(Math.max(1, anchorDay ?? d), maxDay)
  return `${ty}-${String(tm).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * 计算某条周期规则到今天为止应该生成的所有账单日期（不改动原对象）。
 * 返回 dates 与推进后的 nextDate。
 */
export function dueInstances(
  rule: RecurringRule,
  today = todayKey(),
): { dates: string[]; nextDate: string } {
  const dates: string[] = []
  // 锚定日取规则里显式记录的值，缺失时用首次的 nextDate 兜底
  const anchor = rule.anchorDay ?? Number(rule.nextDate.slice(8, 10))
  let cursor = rule.nextDate
  let guard = 0
  while (cursor <= today && (!rule.endDate || cursor <= rule.endDate) && guard < 500) {
    dates.push(cursor)
    cursor = nextRecurringDate(cursor, rule.rule, rule.interval, anchor)
    guard += 1
  }
  return { dates, nextDate: cursor }
}
