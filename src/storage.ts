import type {
  Account,
  AccountKind,
  AppData,
  Budget,
  Category,
  DebtPlan,
  QuickTemplate,
  RecurrenceRule,
  RecurringDue,
  RecurringRule,
  Settings,
  ThemeMode,
  Transaction,
  TxType,
} from './types'
import { emojiToIcon, isIconName, type IconName } from './icon-set'
import { todayKey, uid } from './utils'

export const STORAGE_KEY = 'jizhang.data.v1'
export const DATA_VERSION = 4

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-\d{2}$/

function isDate(value: unknown): value is string {
  return typeof value === 'string' && DATE_RE.test(value)
}

const COLORS = [
  '#f97316',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#ef4444',
  '#eab308',
  '#06b6d4',
  '#84cc16',
  '#6366f1',
  '#f43f5e',
  '#64748b',
]

const SEED_CATEGORIES: Category[] = [
  { id: 'c-food', name: '餐饮', icon: 'food', color: COLORS[0], type: 'expense' },
  { id: 'c-transport', name: '交通', icon: 'bus', color: COLORS[1], type: 'expense' },
  { id: 'c-shopping', name: '购物', icon: 'shopping', color: COLORS[3], type: 'expense' },
  { id: 'c-home', name: '居家', icon: 'home', color: COLORS[2], type: 'expense' },
  { id: 'c-fun', name: '娱乐', icon: 'game', color: COLORS[7], type: 'expense' },
  { id: 'c-health', name: '医疗', icon: 'health', color: COLORS[5], type: 'expense' },
  { id: 'c-study', name: '学习', icon: 'book', color: COLORS[9], type: 'expense' },
  { id: 'c-phone', name: '通讯', icon: 'phone', color: COLORS[4], type: 'expense' },
  { id: 'c-gift', name: '人情', icon: 'gift', color: COLORS[10], type: 'expense' },
  { id: 'c-travel', name: '旅行', icon: 'plane', color: COLORS[1], type: 'expense' },
  { id: 'c-pet', name: '宠物', icon: 'pet', color: COLORS[8], type: 'expense' },
  { id: 'c-other', name: '其他', icon: 'box', color: COLORS[11], type: 'expense' },
  { id: 'i-salary', name: '工资', icon: 'money', color: '#10b981', type: 'income' },
  { id: 'i-bonus', name: '奖金', icon: 'award', color: '#f59e0b', type: 'income' },
  { id: 'i-invest', name: '理财', icon: 'invest', color: '#3b82f6', type: 'income' },
  { id: 'i-parttime', name: '兼职', icon: 'briefcase', color: '#8b5cf6', type: 'income' },
  { id: 'i-redpacket', name: '红包', icon: 'redpacket', color: '#ef4444', type: 'income' },
  { id: 'i-other', name: '其他', icon: 'box', color: COLORS[11], type: 'income' },
]

const SEED_ACCOUNTS: Account[] = [
  { id: 'a-cash', name: '现金', kind: 'cash', nature: 'asset', initialBalance: 0 },
  { id: 'a-wechat', name: '微信', kind: 'wechat', nature: 'asset', initialBalance: 0 },
  { id: 'a-alipay', name: '支付宝', kind: 'alipay', nature: 'asset', initialBalance: 0 },
  { id: 'a-bank', name: '银行卡', kind: 'bank', nature: 'asset', initialBalance: 0 },
]

export function seedData(): AppData {
  return {
    version: DATA_VERSION,
    transactions: [],
    categories: SEED_CATEGORIES.map((c) => ({ ...c })),
    accounts: SEED_ACCOUNTS.map((a) => ({ ...a })),
    budgets: [],
    recurring: [],
    recurringDues: [],
    templates: [],
    debts: [],
    settings: { theme: 'auto', budgetReminder: true, overspendAlert: true, seenBadges: [] },
    updatedAt: Date.now(),
  }
}

export function categoryColor(index: number): string {
  return COLORS[index % COLORS.length]
}

export const ACCOUNT_KINDS: { value: AccountKind; label: string; icon: IconName }[] = [
  { value: 'cash', label: '现金', icon: 'money' },
  { value: 'wechat', label: '微信', icon: 'chat' },
  { value: 'alipay', label: '支付宝', icon: 'wallet' },
  { value: 'bank', label: '银行卡', icon: 'bank' },
  { value: 'credit', label: '信用卡', icon: 'credit-card' },
  { value: 'other', label: '其他', icon: 'folder' },
]

export const RECURRENCE_OPTIONS: { value: RecurrenceRule; label: string; unit: string }[] = [
  { value: 'daily', label: '每天', unit: '天' },
  { value: 'weekly', label: '每周', unit: '周' },
  { value: 'monthly', label: '每月', unit: '月' },
  { value: 'yearly', label: '每年', unit: '年' },
]

export function accountIcon(kind: AccountKind): IconName {
  return ACCOUNT_KINDS.find((k) => k.value === kind)?.icon ?? 'folder'
}

/* ---------------- 读取 / 保存 ---------------- */

function isTheme(v: unknown): v is ThemeMode {
  return v === 'auto' || v === 'light' || v === 'dark'
}

function normalizeTx(input: any): Transaction | null {
  if (!input || typeof input !== 'object') return null
  const type: TxType =
    input.type === 'income' || input.type === 'transfer' || input.type === 'adjust'
      ? input.type
      : 'expense'
  const amount = Math.round(Number(input.amount))
  if (!Number.isFinite(amount)) return null
  // 余额调整允许负数（调减），其余类型必须为正
  if (type === 'adjust' ? amount === 0 : amount <= 0) return null
  if (!isDate(input.date)) return null
  if (typeof input.categoryId !== 'string' || typeof input.accountId !== 'string') return null
  const isTransfer = type === 'transfer' && typeof input.toAccountId === 'string' && input.toAccountId
  return {
    id: typeof input.id === 'string' && input.id ? input.id : uid('t-'),
    type,
    amount,
    categoryId: input.categoryId,
    accountId: input.accountId,
    toAccountId: isTransfer ? input.toAccountId : undefined,
    note: typeof input.note === 'string' ? input.note : '',
    date: input.date,
    createdAt: Number(input.createdAt) || Date.now(),
    updatedAt: Number(input.updatedAt) || Date.now(),
  }
}

function normalizeCategory(input: any): Category | null {
  if (!input || typeof input !== 'object') return null
  if (!input.id || !input.name) return null
  const icon: IconName = isIconName(input.icon) ? input.icon : emojiToIcon(input.emoji)
  return {
    id: String(input.id),
    name: String(input.name),
    icon,
    color: typeof input.color === 'string' ? input.color : COLORS[11],
    type: input.type === 'income' ? 'income' : 'expense',
    archived: Boolean(input.archived) || undefined,
  }
}

function normalizeAccount(input: any): Account | null {
  if (!input || typeof input !== 'object') return null
  if (!input.id || !input.name) return null
  const kind: AccountKind = ACCOUNT_KINDS.some((k) => k.value === input.kind) ? input.kind : 'other'
  const nature = input.nature === 'liability' || input.nature === 'asset'
    ? input.nature
    : kind === 'credit'
      ? 'liability'
      : 'asset'
  return {
    id: String(input.id),
    name: String(input.name),
    kind,
    nature,
    initialBalance: Math.round(Number(input.initialBalance)) || 0,
    archived: Boolean(input.archived) || undefined,
  }
}

function normalizeBudget(input: any): Budget | null {
  if (!input || typeof input !== 'object') return null
  const amount = Math.round(Number(input.amount))
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (typeof input.month !== 'string' || !MONTH_RE.test(input.month)) return null
  if (typeof input.categoryId !== 'string') return null
  return {
    id: typeof input.id === 'string' && input.id ? input.id : uid('b-'),
    month: input.month,
    categoryId: input.categoryId,
    amount,
  }
}

const RECURRENCE_RULES: RecurrenceRule[] = ['daily', 'weekly', 'monthly', 'yearly']

function normalizeRecurring(input: any): RecurringRule | null {
  if (!input || typeof input !== 'object') return null
  const amount = Math.round(Number(input.amount))
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (typeof input.categoryId !== 'string' || typeof input.accountId !== 'string') return null
  if (!isDate(input.nextDate)) return null
  const rule: RecurrenceRule = RECURRENCE_RULES.includes(input.rule) ? input.rule : 'monthly'
  return {
    id: typeof input.id === 'string' && input.id ? input.id : uid('r-'),
    name: typeof input.name === 'string' && input.name ? input.name : '周期账单',
    type: input.type === 'income' ? 'income' : 'expense',
    amount,
    categoryId: input.categoryId,
    accountId: input.accountId,
    note: typeof input.note === 'string' ? input.note : '',
    rule,
    interval: Math.min(60, Math.max(1, Math.round(Number(input.interval)) || 1)),
    nextDate: input.nextDate,
    endDate: isDate(input.endDate) ? input.endDate : undefined,
    auto: Boolean(input.auto),
    enabled: input.enabled !== false,
    createdAt: Number(input.createdAt) || Date.now(),
  }
}

function normalizeDue(input: any): RecurringDue | null {
  if (!input || typeof input !== 'object') return null
  if (typeof input.ruleId !== 'string' || !isDate(input.date)) return null
  return {
    id: typeof input.id === 'string' && input.id ? input.id : uid('d-'),
    ruleId: input.ruleId,
    date: input.date,
    createdAt: Number(input.createdAt) || Date.now(),
  }
}

function normalizeTemplate(input: any): QuickTemplate | null {  if (!input || typeof input !== 'object') return null
  const amount = Math.round(Number(input.amount))
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (typeof input.categoryId !== 'string' || typeof input.accountId !== 'string') return null
  return {
    id: typeof input.id === 'string' && input.id ? input.id : uid('q-'),
    label: typeof input.label === 'string' && input.label ? input.label : '快捷记账',
    type: input.type === 'income' ? 'income' : 'expense',
    amount,
    categoryId: input.categoryId,
    accountId: input.accountId,
    note: typeof input.note === 'string' ? input.note : '',
    createdAt: Number(input.createdAt) || Date.now(),
  }
}

function normalizeDebtPlan(input: any): DebtPlan | null {
  if (!input || typeof input !== 'object') return null
  if (typeof input.accountId !== 'string' || !input.accountId) return null
  const principal = Math.round(Number(input.principal))
  if (!Number.isFinite(principal) || principal < 0) return null
  const monthlyPayment = Math.max(0, Math.round(Number(input.monthlyPayment)) || 0)
  const apr = Math.min(100, Math.max(0, Number(input.apr) || 0))
  return {
    id: typeof input.id === 'string' && input.id ? input.id : uid('dp-'),
    accountId: input.accountId,
    principal,
    monthlyPayment,
    apr,
    targetDate:
      typeof input.targetDate === 'string' && MONTH_RE.test(input.targetDate)
        ? input.targetDate
        : undefined,
    createdAt: Number(input.createdAt) || Date.now(),
  }
}

export function normalizeData(input: any): AppData {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('文件内容不是有效的记账数据')
  }
  const hasShape =
    'version' in input || Array.isArray(input.transactions) || Array.isArray(input.accounts)
  if (!hasShape) throw new Error('文件内容不是有效的记账数据')
  const seed = seedData()
  const categories = Array.isArray(input.categories)
    ? (input.categories.map(normalizeCategory).filter(Boolean) as Category[])
    : []
  const accounts = Array.isArray(input.accounts)
    ? (input.accounts.map(normalizeAccount).filter(Boolean) as Account[])
    : []
  const transactions = Array.isArray(input.transactions)
    ? (input.transactions.map(normalizeTx).filter(Boolean) as Transaction[])
    : []
  const budgets = Array.isArray(input.budgets)
    ? (input.budgets.map(normalizeBudget).filter(Boolean) as Budget[])
    : []
  const recurring = Array.isArray(input.recurring)
    ? (input.recurring.map(normalizeRecurring).filter(Boolean) as RecurringRule[])
    : []
  const ruleIds = new Set(recurring.map((r) => r.id))
  const dueList = Array.isArray(input.recurringDues)
    ? (input.recurringDues.map(normalizeDue).filter(Boolean) as RecurringDue[])
    : []
  const recurringDues = dueList.filter((d) => ruleIds.has(d.ruleId))
  const templates = Array.isArray(input.templates)
    ? (input.templates.map(normalizeTemplate).filter(Boolean) as QuickTemplate[])
    : []
  const accountIds = new Set(accounts.map((a) => a.id))
  const debts = Array.isArray(input.debts)
    ? (input.debts.map(normalizeDebtPlan).filter(Boolean) as DebtPlan[]).filter((d) =>
        accountIds.has(d.accountId),
      )
    : []
  const settings: Settings = {
    theme: isTheme(input.settings?.theme) ? input.settings.theme : 'auto',
    budgetReminder: input.settings?.budgetReminder !== false,
    overspendAlert: input.settings?.overspendAlert !== false,
    seenBadges: Array.isArray(input.settings?.seenBadges)
      ? input.settings.seenBadges.filter((v: unknown): v is string => typeof v === 'string')
      : [],
  }
  return {
    version: DATA_VERSION,
    transactions,
    categories: categories.length ? categories : seed.categories,
    accounts: accounts.length ? accounts : seed.accounts,
    budgets,
    recurring,
    recurringDues,
    templates,
    debts,
    settings,
    updatedAt: Number(input.updatedAt) || Date.now(),
  }
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seedData()
    return normalizeData(JSON.parse(raw))
  } catch {
    return seedData()
  }
}

export function saveData(data: AppData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, updatedAt: Date.now() }))
    return true
  } catch (error) {
    console.error('本地数据保存失败，可能是存储空间已满', error)
    return false
  }
}

/* ---------------- 导出 ---------------- */

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function toCSV(data: AppData, month?: string): string {
  const catName = new Map(data.categories.map((c) => [c.id, c.name]))
  const accName = new Map(data.accounts.map((a) => [a.id, a.name]))
  const rows: string[][] = [['日期', '类型', '分类', '账户', '金额', '备注']]
  const list = [...data.transactions]
    .filter((t) => !month || t.date.startsWith(month))
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1))
  for (const t of list) {
    if (t.type === 'transfer') {
      rows.push([
        t.date,
        '转账',
        `${accName.get(t.accountId) ?? '未知账户'} → ${accName.get(t.toAccountId ?? '') ?? '未知账户'}`,
        '不计收支',
        (t.amount / 100).toFixed(2),
        t.note || '',
      ])
      continue
    }
    if (t.type === 'adjust') {
      rows.push([
        t.date,
        '余额调整',
        '账户校准',
        accName.get(t.accountId) ?? '未知账户',
        (t.amount / 100).toFixed(2),
        t.note || '',
      ])
      continue
    }
    rows.push([
      t.date,
      t.type === 'expense' ? '支出' : '收入',
      catName.get(t.categoryId) ?? '未分类',
      accName.get(t.accountId) ?? '未知账户',
      (t.amount / 100).toFixed(2),
      t.note || '',
    ])
  }
  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
}

export function toBackup(data: AppData): string {
  return JSON.stringify(data, null, 2)
}

export function download(filename: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function stamp(): string {
  return todayKey().replace(/-/g, '')
}
