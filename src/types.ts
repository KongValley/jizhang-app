import type { IconName } from './icon-set'

/**
 * expense / income 记账；
 * transfer 转账：accountId 为转出账户，toAccountId 为转入账户，不影响收支统计；
 * adjust 余额调整：用于把“账户校准到某金额”，同样不计入收支。
 */
export type TxType = 'expense' | 'income' | 'transfer' | 'adjust'

/** 影响收支的记账类型 */
export type MoneyType = 'expense' | 'income'

export interface Transaction {
  id: string
  type: TxType
  /** 金额（分），转账与调整时为正数 */
  amount: number
  categoryId: string
  accountId: string
  /** 转账目标账户 */
  toAccountId?: string
  note: string
  /** YYYY-MM-DD */
  date: string
  /** 由周期账单自动生成时，记录来源规则 id，用于幂等去重 */
  sourceRuleId?: string
  createdAt: number
  updatedAt: number
}

export interface Category {
  id: string
  name: string
  icon: IconName
  color: string
  type: MoneyType
  archived?: boolean
}

export type AccountKind = 'cash' | 'wechat' | 'alipay' | 'bank' | 'credit' | 'other'

export type AccountNature = 'asset' | 'liability'

export interface Account {
  id: string
  name: string
  kind: AccountKind
  /** 资产 / 负债；信用卡默认负债 */
  nature: AccountNature
  /** 期初余额（分）；负债账户用负数表示期初欠款 */
  initialBalance: number
  archived?: boolean
}

export interface Budget {
  id: string
  /** YYYY-MM */
  month: string
  /** 'all' 表示月度总预算 */
  categoryId: string
  /** 金额（分） */
  amount: number
}

/* ---------------- 周期账单 ---------------- */

export type RecurrenceRule = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface RecurringRule {
  id: string
  name: string
  type: MoneyType
  /** 金额（分） */
  amount: number
  categoryId: string
  accountId: string
  note: string
  rule: RecurrenceRule
  /** 每 N 个周期执行一次，例如每 2 周 */
  interval: number
  /** 当前周期的记账日期 YYYY-MM-DD，生成后会推进到下一周期 */
  nextDate: string
  /**
   * 每月固定记账的“锚定日”（1-31）。
   * 用于避免 1 月 31 日 → 2 月 28 日之后，后续月份被永久改成 28 日。
   */
  anchorDay?: number
  /** YYYY-MM-DD，到这天之后不再生成 */
  endDate?: string
  /** 到期时是否自动记账；否则提示用户确认 */
  auto: boolean
  enabled: boolean
  createdAt: number
}

/** 周期账单待处理实例（用户确认后再写成账单） */
export interface RecurringDue {
  id: string
  ruleId: string
  /** 应当记账的日期 */
  date: string
  createdAt: number
}

/* ---------------- 快捷记账模板 ---------------- */

export interface QuickTemplate {
  id: string
  label: string
  type: MoneyType
  amount: number
  categoryId: string
  accountId: string
  note: string
  createdAt: number
}

export type ThemeMode = 'auto' | 'light' | 'dark'

export interface Settings {
  theme: ThemeMode
  /** 首页是否显示本月剩余可用（日均预算提醒） */
  budgetReminder: boolean
  /** 超出日均时给出提醒 */
  overspendAlert: boolean
  /** 已经庆祝过的成就，避免重复弹出 */
  seenBadges: string[]
}

/* ---------------- 负债还款计划 ---------------- */

export interface DebtPlan {
  id: string
  accountId: string
  /** 起始本金（分），用于计算还款进度 */
  principal: number
  /** 每月还款额（分）；0 表示按历史还款估算 */
  monthlyPayment: number
  /** 年利率（%），0 表示无息 */
  apr: number
  /** 目标还清月份 YYYY-MM */
  targetDate?: string
  createdAt: number
}

export interface AppData {
  version: number
  transactions: Transaction[]
  categories: Category[]
  accounts: Account[]
  budgets: Budget[]
  recurring: RecurringRule[]
  recurringDues: RecurringDue[]
  templates: QuickTemplate[]
  debts: DebtPlan[]
  settings: Settings
  updatedAt: number
}
