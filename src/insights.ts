import type { AppData, Category, Transaction } from './types'
import type { IconName } from './icon-set'
import {
  accountBalance,
  accountNature,
  breakdown,
  findBudget,
  spentFor,
  summarize,
  totalBalance,
  txInMonth,
} from './stats'
import {
  addMonths,
  clamp,
  currentMonth,
  daysInMonth,
  todayKey,
  yuan,
} from './utils'

/* ================================================================
   连续记账
   ================================================================ */

export interface StreakInfo {
  /** 当前连续天数（今天还没记时从昨天算，避免白天掉链子） */
  current: number
  /** 历史最长连续天数 */
  best: number
  /** 累计记账天数 */
  totalDays: number
  lastDate: string | null
}

function shiftDate(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d + delta)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate(),
  ).padStart(2, '0')}`
}

export function recordStreak(txs: Transaction[], today = todayKey()): StreakInfo {
  const days = new Set(txs.filter((t) => t.type === 'expense' || t.type === 'income').map((t) => t.date))
  if (days.size === 0) return { current: 0, best: 0, totalDays: 0, lastDate: null }

  const dates = [...days].sort()
  let best = 1
  let run = 1
  for (let i = 1; i < dates.length; i++) {
    run = shiftDate(dates[i - 1], 1) === dates[i] ? run + 1 : 1
    if (run > best) best = run
  }

  let cursor = days.has(today) ? today : shiftDate(today, -1)
  let current = 0
  while (days.has(cursor)) {
    current += 1
    cursor = shiftDate(cursor, -1)
  }

  return { current, best, totalDays: dates.length, lastDate: dates[dates.length - 1] }
}

export function greetingFor(date = new Date()): string {
  const h = date.getHours()
  if (h < 5) return '夜深了'
  if (h < 9) return '早上好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  if (h < 23) return '晚上好'
  return '夜深了'
}

/* ================================================================
   成就徽章
   ================================================================ */

export type BadgeUnit = 'count' | 'days' | 'money' | 'flag'

export interface Badge {
  id: string
  name: string
  desc: string
  icon: IconName
  color: string
  unit: BadgeUnit
  goal: number
  value: number
  progress: number
  unlocked: boolean
}

interface BadgeContext {
  txCount: number
  streak: StreakInfo
  netWorth: number
  positiveMonths: number
  budgetKeptMonths: number
  budgetsSet: number
  debtSettled: boolean
  recurringCount: number
  templateCount: number
}

interface BadgeDef extends Omit<Badge, 'value' | 'progress' | 'unlocked'> {
  value: (ctx: BadgeContext) => number
}

const BLUE = '#4c6fff'
const GREEN = '#10b981'
const ORANGE = '#f59e0b'
const CYAN = '#06b6d4'
const PURPLE = '#8b5cf6'
const RED = '#ef4444'

const BADGE_DEFS: BadgeDef[] = [
  {
    id: 'first-tx',
    name: '第一笔',
    desc: '记下第一笔账，账本正式开张',
    icon: 'sparkle',
    color: BLUE,
    unit: 'count',
    goal: 1,
    value: (c) => c.txCount,
  },
  {
    id: 'tx-50',
    name: '小有记录',
    desc: '累计记账 50 笔',
    icon: 'list',
    color: CYAN,
    unit: 'count',
    goal: 50,
    value: (c) => c.txCount,
  },
  {
    id: 'tx-200',
    name: '账本达人',
    desc: '累计记账 200 笔',
    icon: 'book',
    color: PURPLE,
    unit: 'count',
    goal: 200,
    value: (c) => c.txCount,
  },
  {
    id: 'tx-500',
    name: '一丝不苟',
    desc: '累计记账 500 笔',
    icon: 'award',
    color: ORANGE,
    unit: 'count',
    goal: 500,
    value: (c) => c.txCount,
  },
  {
    id: 'streak-7',
    name: '一周不落',
    desc: '连续记账 7 天',
    icon: 'flame',
    color: ORANGE,
    unit: 'days',
    goal: 7,
    value: (c) => c.streak.best,
  },
  {
    id: 'streak-30',
    name: '月度坚持',
    desc: '连续记账 30 天',
    icon: 'flame',
    color: RED,
    unit: 'days',
    goal: 30,
    value: (c) => c.streak.best,
  },
  {
    id: 'streak-100',
    name: '百日成金',
    desc: '连续记账 100 天',
    icon: 'flame',
    color: PURPLE,
    unit: 'days',
    goal: 100,
    value: (c) => c.streak.best,
  },
  {
    id: 'budget-set',
    name: '有目标的人',
    desc: '第一次设置月度预算',
    icon: 'target',
    color: GREEN,
    unit: 'flag',
    goal: 1,
    value: (c) => (c.budgetsSet > 0 ? 1 : 0),
  },
  {
    id: 'budget-kept',
    name: '说到做到',
    desc: '完整一个月没有超预算',
    icon: 'shield',
    color: GREEN,
    unit: 'flag',
    goal: 1,
    value: (c) => (c.budgetKeptMonths > 0 ? 1 : 0),
  },
  {
    id: 'debt-free',
    name: '无债一身轻',
    desc: '把一笔负债还到零',
    icon: 'check',
    color: GREEN,
    unit: 'flag',
    goal: 1,
    value: (c) => (c.debtSettled ? 1 : 0),
  },
  {
    id: 'save-10k',
    name: '第一桶金',
    desc: '净资产达到 ¥10,000',
    icon: 'money',
    color: BLUE,
    unit: 'money',
    goal: 1_000_000,
    value: (c) => Math.max(0, c.netWorth),
  },
  {
    id: 'save-100k',
    name: '十万里程碑',
    desc: '净资产达到 ¥100,000',
    icon: 'invest',
    color: PURPLE,
    unit: 'money',
    goal: 10_000_000,
    value: (c) => Math.max(0, c.netWorth),
  },
  {
    id: 'positive-months',
    name: '稳步向前',
    desc: '有 3 个月是收入大于支出',
    icon: 'trending-up',
    color: GREEN,
    unit: 'count',
    goal: 3,
    value: (c) => c.positiveMonths,
  },
  {
    id: 'recurring',
    name: '自动生活',
    desc: '创建第一个周期账单',
    icon: 'repeat',
    color: CYAN,
    unit: 'flag',
    goal: 1,
    value: (c) => (c.recurringCount > 0 ? 1 : 0),
  },
  {
    id: 'template',
    name: '熟能生巧',
    desc: '保存第一个快捷模板',
    icon: 'zap',
    color: ORANGE,
    unit: 'flag',
    goal: 1,
    value: (c) => (c.templateCount > 0 ? 1 : 0),
  },
]

export function buildBadges(data: AppData, today = todayKey()): Badge[] {
  const streak = recordStreak(data.transactions, today)
  const thisMonth = currentMonth()
  let positiveMonths = 0
  let budgetKeptMonths = 0
  for (let i = 1; i <= 6; i++) {
    const month = addMonths(thisMonth, -i)
    const summary = summarize(txInMonth(data.transactions, month))
    if (summary.count > 0 && summary.net > 0) positiveMonths += 1
    const budget = findBudget(data.budgets, month, 'all')
    if (budget && spentFor(data.transactions, month, 'all') <= budget.amount) {
      budgetKeptMonths += 1
    }
  }

  const trackedLiabilities = data.accounts.filter(
    (a) =>
      accountNature(a) === 'liability' &&
      (a.initialBalance < 0 || data.debts.some((d) => d.accountId === a.id)),
  )
  const debtSettled =
    trackedLiabilities.length > 0 &&
    trackedLiabilities.every((a) => -accountBalance(data.transactions, a) <= 0)

  const ctx: BadgeContext = {
    txCount: data.transactions.length,
    streak,
    netWorth: totalBalance(data),
    positiveMonths,
    budgetKeptMonths,
    budgetsSet: data.budgets.length,
    debtSettled,
    recurringCount: data.recurring.length,
    templateCount: data.templates.length,
  }

  const seen = new Set(data.settings?.seenBadges ?? [])
  return BADGE_DEFS.map((def) => {
    const value = def.value(ctx)
    const unlocked = seen.has(def.id) || value >= def.goal
    return {
      id: def.id,
      name: def.name,
      desc: def.desc,
      icon: def.icon,
      color: def.color,
      unit: def.unit,
      goal: def.goal,
      value,
      progress: unlocked ? 1 : clamp(value / def.goal, 0, 1),
      unlocked,
    }
  })
}

/** 徽章进度文案 */
export function badgeProgressLabel(badge: Badge): string {
  if (badge.unlocked) return '已解锁'
  switch (badge.unit) {
    case 'money':
      return `${yuan(badge.value, 0)} / ${yuan(badge.goal, 0)}`
    case 'days':
      return `${badge.value} / ${badge.goal} 天`
    case 'count':
      return `${badge.value} / ${badge.goal}`
    default:
      return '未达成'
  }
}

/* ================================================================
   月度回顾
   ================================================================ */

export interface RecapCategory {
  name: string
  icon: IconName
  color: string
  amount: number
  count: number
  share: number
}

export interface MonthlyRecap {
  month: string
  title: string
  expense: number
  income: number
  net: number
  count: number
  activeDays: number
  totalDays: number
  prevExpense: number
  diffRate: number | null
  top?: RecapCategory
  frequent?: RecapCategory
  biggest?: { amount: number; category?: Category; note: string; date: string }
  budget?: { amount: number; spent: number; ratio: number; kept: boolean }
  note: string
}

export function buildRecap(data: AppData, month: string): MonthlyRecap | null {
  const txs = txInMonth(data.transactions, month)
  const summary = summarize(txs)
  if (summary.count === 0) return null

  const expenseTx = txs.filter((t) => t.type === 'expense')
  const activeDays = new Set(
    txs.filter((t) => t.type === 'expense' || t.type === 'income').map((t) => t.date),
  ).size
  const items = breakdown(txs, data.categories, 'expense')
  const top = items[0]
  const frequent = items.length
    ? [...items].sort((a, b) => b.count - a.count || b.amount - a.amount)[0]
    : undefined
  const biggestTx = expenseTx.length
    ? expenseTx.reduce((a, b) => (b.amount > a.amount ? b : a))
    : null
  const biggestCategory = biggestTx
    ? data.categories.find((c) => c.id === biggestTx.categoryId)
    : undefined
  const prev = summarize(txInMonth(data.transactions, addMonths(month, -1)))
  const budget = findBudget(data.budgets, month, 'all')
  const budgetSpent = spentFor(data.transactions, month, 'all')
  const kept = budget ? budgetSpent <= budget.amount : false

  const title =
    summary.net > 0 && kept
      ? '稳稳的一个月'
      : summary.net > 0
        ? '有结余的一个月'
        : budget && !kept
          ? '花得有点猛'
          : '认真生活的一个月'

  const notes: string[] = []
  if (budget) {
    notes.push(
      kept
        ? '预算守住了，这种掌控感很值钱。'
        : `预算超了 ${yuan(budgetSpent - budget.amount, 0)}，别太苛责自己，下个月微调就好。`,
    )
  }
  if (summary.net > 0) {
    notes.push(`这个月攒下了 ${yuan(summary.net, 0)}，离想要的生活又近一步。`)
  } else if (summary.net < 0) {
    notes.push('这个月花得比收入多一点，慢慢找回来就好。')
  }
  if (summary.count >= 20) {
    notes.push(`认真记了 ${summary.count} 笔，生活被你好好对待了。`)
  }
  if (!notes.length) notes.push('每个月的记录，都是在为生活留一份底稿。')

  return {
    month,
    title,
    expense: summary.expense,
    income: summary.income,
    net: summary.net,
    count: summary.count,
    activeDays,
    totalDays: daysInMonth(month),
    prevExpense: prev.expense,
    diffRate: prev.expense > 0 ? ((summary.expense - prev.expense) / prev.expense) * 100 : null,
    top: top
      ? { name: top.name, icon: top.icon, color: top.color, amount: top.amount, count: top.count, share: top.share }
      : undefined,
    frequent: frequent
      ? {
          name: frequent.name,
          icon: frequent.icon,
          color: frequent.color,
          amount: frequent.amount,
          count: frequent.count,
          share: frequent.share,
        }
      : undefined,
    biggest: biggestTx
      ? {
          amount: biggestTx.amount,
          category: biggestCategory,
          note: biggestTx.note,
          date: biggestTx.date,
        }
      : undefined,
    budget: budget
      ? { amount: budget.amount, spent: budgetSpent, ratio: budgetSpent / budget.amount, kept }
      : undefined,
    note: notes.slice(0, 2).join(' '),
  }
}
