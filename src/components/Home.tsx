import { useMemo, useState } from 'react'
import type { QuickTemplate, Transaction } from '../types'
import { useStore } from '../store'
import { EmptyState, MonthSwitcher, useUi } from '../ui'
import { Icon } from '../icons'
import { BrandMark } from './BrandMark'
import { greetingFor, recordStreak } from '../insights'
import { accountIcon } from '../storage'
import {
  accountBalance,
  dailyAllowance,
  findBudget,
  overspendStreak,
  sortTx,
  suggestTemplates,
  summarize,
  txInMonth,
  txTypeLabel,
} from '../stats'
import {
  cn,
  currentMonth,
  daysInMonth,
  formatCalendarDate,
  formatDayLabel,
  formatMoney,
  monthLabel,
  monthProgress,
  parseMonth,
  signedYuan,
  smartYuan,
  todayKey,
  yuan,
} from '../utils'

export interface QuickAddInput {
  type: 'expense' | 'income'
  amount: number
  categoryId: string
  accountId: string
  note: string
}

interface HomeProps {
  month: string
  onMonthChange: (month: string) => void
  onEdit: (tx: Transaction) => void
  onAdd: (mode?: 'expense' | 'income' | 'transfer') => void
  onQuickAdd: (input: QuickAddInput) => void
  onManageTemplates: () => void
  onOpenAchievements: () => void
}

export function HomePage({
  month,
  onMonthChange,
  onEdit,
  onAdd,
  onQuickAdd,
  onManageTemplates,
  onOpenAchievements,
}: HomeProps) {
  const { data, addTemplate } = useStore()
  const { toast } = useUi()
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [accountFilter, setAccountFilter] = useState('all')

  const now = currentMonth()
  const activeAccounts = useMemo(() => data.accounts.filter((a) => !a.archived), [data.accounts])
  const catMap = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories])
  const accMap = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts])

  const monthTx = useMemo(() => txInMonth(data.transactions, month), [data.transactions, month])
  const summary = useMemo(() => summarize(monthTx), [monthTx])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = monthTx.filter((t) => {
      if (accountFilter !== 'all' && t.accountId !== accountFilter) return false
      if (!q) return true
      const cat = catMap.get(t.categoryId)?.name ?? ''
      const acc = accMap.get(t.accountId)?.name ?? ''
      const toAcc = t.toAccountId ? (accMap.get(t.toAccountId)?.name ?? '') : ''
      return `${t.note} ${cat} ${acc} ${toAcc} ${t.amount / 100}`.toLowerCase().includes(q)
    })
    return sortTx(list)
  }, [monthTx, accountFilter, search, catMap, accMap])

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const t of filtered) {
      const arr = map.get(t.date)
      if (arr) arr.push(t)
      else map.set(t.date, [t])
    }
    return [...map.entries()].map(([date, items]) => ({ date, items, ...summarize(items) }))
  }, [filtered])

  const accounts = activeAccounts
  const budget = findBudget(data.budgets, month, 'all')
  const usage = budget ? (summary.expense / budget.amount) * 100 : 0
  const remaining = budget ? budget.amount - summary.expense : 0
  const elapsedDays = Math.max(1, monthProgress(month).elapsed || daysInMonth(month))
  const isThisMonth = month === now

  /* ---------------- 快捷记账条 ---------------- */
  const quickItems = useMemo(() => {
    const saved = data.templates.map((t) => ({ ...t, suggest: false }))
    const savedKeys = new Set(saved.map((t) => `${t.categoryId}|${t.note.trim()}|${t.amount}`))
    const suggest = suggestTemplates(data.transactions)
      .filter((t) => !savedKeys.has(`${t.categoryId}|${t.note.trim()}|${t.amount}`))
      .map((t) => ({ ...t, suggest: true }))
    return [...saved, ...suggest]
  }, [data.templates, data.transactions])

  const handleQuickAdd = (tpl: QuickTemplate & { suggest?: boolean }) => {
    const categoryId =
      tpl.categoryId && catMap.has(tpl.categoryId) ? tpl.categoryId : (data.categories.find((c) => c.type === tpl.type)?.id ?? '')
    const accountId =
      tpl.accountId && activeAccounts.some((a) => a.id === tpl.accountId)
        ? tpl.accountId
        : (activeAccounts[0]?.id ?? '')
    if (!accountId) {
      toast('请先添加一个账户', 'warn')
      return
    }
    onQuickAdd({
      type: tpl.type,
      amount: tpl.amount,
      categoryId,
      accountId,
      note: tpl.note,
    })
    if (tpl.suggest) {
      const exists = data.templates.some(
        (t) => t.categoryId === categoryId && t.note === tpl.note && t.amount === tpl.amount,
      )
      if (!exists) {
        addTemplate({
          label: tpl.label,
          type: tpl.type,
          amount: tpl.amount,
          categoryId,
          accountId,
          note: tpl.note,
        })
      }
    }
    toast(`已记录 ${tpl.label}`)
  }

  /* ---------------- 今日概览 ---------------- */
  const today = todayKey()
  const todaySummary = useMemo(
    () => summarize(data.transactions.filter((t) => t.date === today)),
    [data.transactions, today],
  )

  /* ---------------- 日均预算提醒 ---------------- */
  const allowance = useMemo(
    () => (isThisMonth && budget ? dailyAllowance(data.transactions, month, budget.amount) : null),
    [isThisMonth, budget, data.transactions, month],
  )
  const showAllowance = isThisMonth && data.settings.budgetReminder && !!allowance
  const streak = useMemo(
    () => (data.settings.overspendAlert && allowance ? overspendStreak(data.transactions, allowance.todayAllow) : null),
    [data.settings.overspendAlert, data.transactions, allowance],
  )
  const overToday = allowance ? allowance.todaySpent > allowance.todayAllow : false
  const record = useMemo(() => recordStreak(data.transactions), [data.transactions])
  const greeting = greetingFor()

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <BrandMark className="brand__logo" />
          <div className="brand__text">
            <span className="brand__greeting">{greeting}</span>
            <button className="brand__streak" onClick={onOpenAchievements}>
              <Icon name="flame" size={12} />
              {record.current > 0 ? `连续记账 ${record.current} 天` : '还没有开始记账'}
              <Icon name="chevron-right" size={11} />
            </button>
          </div>
        </div>
        <div className="topbar__actions">
          <button
            className={cn('icon-btn', searchOpen && 'is-active')}
            onClick={() => {
              setSearchOpen((v) => !v)
              if (searchOpen) setSearch('')
            }}
            aria-label="搜索"
          >
            <Icon name="search" size={20} />
          </button>
        </div>
      </header>

      {searchOpen && (
        <div className="search-bar">
          <Icon name="search" size={17} />
          <input
            autoFocus
            name="search"
            aria-label="搜索账单"
            value={search}
            placeholder="搜索备注、分类、账户或金额"
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="icon-btn icon-btn--sm" onClick={() => setSearch('')} aria-label="清空">
              <Icon name="close" size={15} />
            </button>
          )}
        </div>
      )}

      <section className="balance-card">
        <div className="balance-card__glow balance-card__glow--a" />
        <div className="balance-card__glow balance-card__glow--b" />
        <div className="balance-card__top">
          <span className="balance-card__label">
            {isThisMonth ? '本月支出' : `${parseMonth(month).m}月支出`}
          </span>
          <MonthSwitcher month={month} onChange={onMonthChange} className="month-nav--on-card" />
        </div>
        <div className="balance-card__amount">
          <small>¥</small>
          {formatMoney(summary.expense)}
        </div>

        {budget ? (
          <div className="balance-budget">
            <div className="balance-budget__track">
              <i
                className={cn(remaining < 0 && 'is-over')}
                style={{ width: `${Math.min(Math.max(usage, 0), 100)}%` }}
              />
            </div>
            <div className="balance-budget__foot">
              <span>预算 {yuan(budget.amount, 0)}</span>
              <span className={cn(remaining < 0 && 'is-over')}>
                {remaining < 0 ? `已超支 ${yuan(-remaining, 0)}` : `剩余 ${yuan(remaining, 0)}`}
              </span>
            </div>
            {showAllowance && allowance && (
              <div
                className={cn('daily-budget', overToday && 'is-danger')}
                role="status"
              >
                <div className="daily-budget__row">
                  <span className="daily-budget__label">
                    {overToday ? '今天已超出' : '今天还能花'}
                  </span>
                  <b className="daily-budget__amount">
                    {smartYuan(overToday ? allowance.todaySpent - allowance.todayAllow : allowance.todayAllow)}
                  </b>
                  <span className="daily-budget__spent">今天已花 {smartYuan(allowance.todaySpent)}</span>
                </div>
                {streak && streak.streak >= 3 && (
                  <div className="daily-budget__streak">
                    <Icon name="flame" size={13} />
                    <span>已连续 {streak.streak} 天超过日均，注意控制开销</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="balance-card__hint">{monthLabel(month)} · 共 {summary.count} 笔记录</div>
        )}

        <div className="balance-card__stats">
          <div>
            <span>收入</span>
            <b className="is-income">¥{formatMoney(summary.income)}</b>
          </div>
          <div>
            <span>结余</span>
            <b className={cn(summary.net < 0 && 'is-negative')}>{signedYuan(summary.net)}</b>
          </div>
          <div>
            <span>日均支出</span>
            <b>{smartYuan(summary.expense / elapsedDays)}</b>
          </div>
        </div>
      </section>

      {quickItems.length > 0 && (
        <div className="quick-strip">
          <div className="quick-strip__scroll">
            {quickItems.map((tpl) => {
              const cat = catMap.get(tpl.categoryId)
              return (
                <button
                  key={tpl.id}
                  className={cn('quick-strip__chip', tpl.suggest && 'is-suggest')}
                  onClick={() => handleQuickAdd(tpl)}
                  title={tpl.note || tpl.label}
                >
                  <span
                    className="quick-strip__icon"
                    style={{ color: cat?.color ?? 'var(--text-3)' }}
                  >
                    <Icon name={cat?.icon ?? 'box'} size={15} />
                  </span>
                  <span className="quick-strip__label">{tpl.label}</span>
                  <em className="quick-strip__amt">{smartYuan(tpl.amount)}</em>
                </button>
              )
            })}
          </div>
          <button className="quick-strip__more" onClick={onManageTemplates} aria-label="管理快捷记账">
            <Icon name="plus-circle" size={20} />
          </button>
        </div>
      )}

      {isThisMonth && (
        <div className="today-strip">
          <Icon name="calendar" size={14} />
          <span>{formatCalendarDate(todayKey())}</span>
          <em>·</em>
          <span>
            支出 ¥{formatMoney(todaySummary.expense)}
            <em>·</em>
            收入 ¥{formatMoney(todaySummary.income)}
            <em>·</em>共 {todaySummary.count} 笔
          </span>
        </div>
      )}

      {accounts.length > 0 && (
        <div className="chips chips--scroll account-filter">
          <button
            className={cn('chip chip--sm', accountFilter === 'all' && 'is-active')}
            onClick={() => setAccountFilter('all')}
          >
            全部账户
          </button>
          {accounts.map((a) => (
            <button
              key={a.id}
              className={cn('chip chip--sm', accountFilter === a.id && 'is-active')}
              onClick={() => setAccountFilter(accountFilter === a.id ? 'all' : a.id)}
            >
              <Icon name={accountIcon(a.kind)} size={15} />
              {a.name}
              <em className="chip__value">{formatMoney(accountBalance(data.transactions, a), 0)}</em>
            </button>
          ))}
        </div>
      )}

      <div className="tx-groups">
        {groups.length === 0 ? (
          <EmptyState
            icon={search || accountFilter !== 'all' ? 'search' : 'receipt'}
            title={search || accountFilter !== 'all' ? '没有找到匹配的记录' : '这个月还没有账单'}
            hint={
              search || accountFilter !== 'all'
                ? '换个关键词或账户试试'
                : '记下第一笔，给这个月留个开头'
            }
            action={search || accountFilter !== 'all' ? '清除筛选' : '记第一笔'}
            onAction={() => {
              if (search || accountFilter !== 'all') {
                setSearch('')
                setAccountFilter('all')
              } else {
                onAdd()
              }
            }}
          />
        ) : (
          groups.map((group) => (
            <section className="day-group" key={group.date}>
              <div className="day-head">
                <span className="day-head__date">{formatDayLabel(group.date)}</span>
                <span className="day-head__sum">
                  {group.expense > 0 && <span>支 {formatMoney(group.expense)}</span>}
                  {group.income > 0 && <span className="is-income">收 {formatMoney(group.income)}</span>}
                </span>
              </div>
              <ul className="tx-list">
                {group.items.map((tx) => {
                  const isTransfer = tx.type === 'transfer'
                  const isAdjust = tx.type === 'adjust'
                  const iconName = isTransfer
                    ? 'transfer'
                    : isAdjust
                      ? (tx.amount > 0 ? 'plus-circle' : 'minus-circle')
                      : (catMap.get(tx.categoryId)?.icon ?? 'box')
                  const iconColor = isTransfer || isAdjust
                    ? 'var(--text-3)'
                    : (catMap.get(tx.categoryId)?.color ?? '#94a3b8')
                  const accName = accMap.get(tx.accountId)?.name ?? '未知账户'
                  const archived = accMap.get(tx.accountId)?.archived ? '（已归档）' : ''
                  const title = isTransfer || isAdjust
                    ? txTypeLabel(tx, data.accounts)
                    : (catMap.get(tx.categoryId)?.name ?? '未分类')
                  const sub = isTransfer ? '转账' : `${accName}${archived}`
                  const showNote = !!tx.note && !isAdjust
                  return (
                    <li key={tx.id}>
                      <button className="tx" onClick={() => onEdit(tx)}>
                        <span
                          className="tx__icon"
                          style={{ background: `${iconColor}1a`, color: iconColor }}
                          aria-hidden="true"
                        >
                          <Icon name={iconName} size={20} />
                        </span>
                        <span className="tx__main">
                          <span className="tx__title">
                            <span>{title}</span>
                            {showNote && <em>{tx.note}</em>}
                          </span>
                          <span className="tx__sub">{sub}</span>
                        </span>
                        <span
                          className={cn(
                            'tx__amount',
                            tx.type === 'income' && 'is-income',
                            (isTransfer || isAdjust) && 'tx__amount--plain',
                            tx.amount >= 100_000_000 && 'is-long',
                          )}
                        >
                          {isTransfer
                            ? formatMoney(tx.amount)
                            : isAdjust
                              ? `${tx.amount > 0 ? '+' : '-'}${formatMoney(Math.abs(tx.amount))}`
                              : `${tx.type === 'income' ? '+' : '-'}${formatMoney(tx.amount)}`}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      {groups.length > 0 && <p className="list-end">— 共 {filtered.length} 笔 —</p>}
    </div>
  )
}
