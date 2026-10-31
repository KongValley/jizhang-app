import { useMemo, useState } from 'react'
import type { Category, RecurrenceRule, RecurringRule } from '../types'
import { useStore, type RecurringInput } from '../store'
import {
  AmountField,
  EmptyState,
  MonthSwitcher,
  ProgressBar,
  Segmented,
  Sheet,
  Toggle,
  useUi,
} from '../ui'
import { budgetStatus, dailyAllowance, findBudget, spentFor, summarize, txInMonth } from '../stats'
import { RECURRENCE_OPTIONS } from '../storage'
import {
  addMonths,
  centsToInput,
  cn,
  formatDayLabel,
  monthLabel,
  parseAmountText,
  signedYuan,
  smartYuan,
  todayKey,
  yuan,
} from '../utils'
import { Icon } from '../icons'

const QUICK_AMOUNTS = [500, 1000, 2000, 3000, 5000]

/* ------------------------------------------------------------------ */
/* 周期账单辅助                                                         */
/* ------------------------------------------------------------------ */

/** 规则描述，例如“每月”“每 2 周” */
function recurrenceLabel(rule: RecurrenceRule, interval: number): string {
  const opt = RECURRENCE_OPTIONS.find((o) => o.value === rule)
  const n = Math.max(1, Math.round(interval) || 1)
  return n > 1 ? `每 ${n} ${opt?.unit ?? '月'}` : (opt?.label ?? '每月')
}

interface RecurringDraft {
  name: string
  type: 'expense' | 'income'
  amount: string
  categoryId: string
  accountId: string
  rule: RecurrenceRule
  interval: string
  nextDate: string
  endDate: string
  auto: boolean
  note: string
}

function draftFromRule(rule: RecurringRule): RecurringDraft {
  return {
    name: rule.name,
    type: rule.type,
    amount: centsToInput(rule.amount),
    categoryId: rule.categoryId,
    accountId: rule.accountId,
    rule: rule.rule,
    interval: String(rule.interval || 1),
    nextDate: rule.nextDate,
    endDate: rule.endDate ?? '',
    auto: rule.auto,
    note: rule.note,
  }
}

export function BudgetPage({
  month,
  onMonthChange,
}: {
  month: string
  onMonthChange: (month: string) => void
}) {
  const {
    data,
    setBudget,
    removeBudget,
    addRecurring,
    updateRecurring,
    deleteRecurring,
    resolveRecurringDue,
  } = useStore()
  const { toast, confirm } = useUi()
  const [sheetCategory, setSheetCategory] = useState<string | null>(null)
  const [amount, setAmount] = useState('')

  /* ---------------- 周期账单状态 ---------------- */
  // '' = 新建；其它为规则 id
  const [recurringOpen, setRecurringOpen] = useState<string | null>(null)
  const [recurringDraft, setRecurringDraft] = useState<RecurringDraft>(() =>
    draftFromRule({
      id: '',
      name: '',
      type: 'expense',
      amount: 0,
      categoryId: '',
      accountId: '',
      note: '',
      rule: 'monthly',
      interval: 1,
      nextDate: todayKey(),
      auto: false,
      enabled: true,
      createdAt: 0,
    }),
  )

  const monthTx = useMemo(() => txInMonth(data.transactions, month), [data.transactions, month])
  const summary = useMemo(() => summarize(monthTx), [monthTx])

  const overall = findBudget(data.budgets, month, 'all')
  const status = overall ? budgetStatus(data.transactions, month, overall) : null
  const allowance = overall ? dailyAllowance(data.transactions, month, overall.amount) : null

  const catBudgets = data.budgets.filter((b) => b.month === month && b.categoryId !== 'all')
  const catMap = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories])
  const expenseCats = data.categories.filter((c) => c.type === 'expense' && !c.archived)
  const budgetedIds = new Set(catBudgets.map((b) => b.categoryId))
  const unbudgeted = expenseCats.filter((c) => !budgetedIds.has(c.id))

  const lastMonth = addMonths(month, -1)
  const lastBudgets = data.budgets.filter((b) => b.month === lastMonth)
  const hasAnyBudget = data.budgets.some((b) => b.month === month)
  const canCopy = !hasAnyBudget && lastBudgets.length > 0

  const existing = sheetCategory ? findBudget(data.budgets, month, sheetCategory) : undefined
  const sheetCat = sheetCategory && sheetCategory !== 'all' ? catMap.get(sheetCategory) : undefined
  const sheetTitle =
    sheetCategory === 'all'
      ? '本月总预算'
      : sheetCategory
        ? `${sheetCat?.name ?? '分类'}预算`
        : ''

  const openSheet = (categoryId: string) => {
    const found = findBudget(data.budgets, month, categoryId)
    setAmount(found ? centsToInput(found.amount) : '')
    setSheetCategory(categoryId)
  }

  const closeSheet = () => setSheetCategory(null)

  const save = () => {
    if (!sheetCategory) return
    const cents = parseAmountText(amount)
    if (cents <= 0) {
      toast('请输入预算金额')
      return
    }
    setBudget(month, sheetCategory, cents)
    toast('预算已保存')
    closeSheet()
  }

  const remove = () => {
    if (!existing) return
    removeBudget(existing.id)
    toast('预算已删除')
    closeSheet()
  }

  const copyLast = () => {
    lastBudgets.forEach((b) => setBudget(month, b.categoryId, b.amount))
    toast('已复制上月预算')
  }

  const pct = status ? Math.round(status.ratio * 100) : 0

  /* ---------------- 周期账单 ---------------- */

  const ruleMap = useMemo(
    () => new Map(data.recurring.map((r) => [r.id, r])),
    [data.recurring],
  )
  const dues = useMemo(
    () =>
      data.recurringDues
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt)),
    [data.recurringDues],
  )

  const recurringSorted = useMemo(() => {
    const items = data.recurring.map((r) => ({ rule: r, cat: catMap.get(r.categoryId) }))
    return items.sort((a, b) => {
      if (a.rule.enabled !== b.rule.enabled) return a.rule.enabled ? -1 : 1
      return a.rule.nextDate < b.rule.nextDate ? -1 : 1
    })
  }, [data.recurring, catMap])

  const editingRule =
    recurringOpen && recurringOpen !== 'new' ? ruleMap.get(recurringOpen) : undefined
  const draftCats = data.categories.filter(
    (c) => c.type === recurringDraft.type && !c.archived,
  )
  const activeAccounts = data.accounts.filter((a) => !a.archived)

  const patchDraft = (patch: Partial<RecurringDraft>) =>
    setRecurringDraft((d) => ({ ...d, ...patch }))

  const openRecurring = (ruleId: string) => {
    const rule = ruleId === 'new' ? null : ruleMap.get(ruleId)
    if (rule) {
      setRecurringDraft(draftFromRule(rule))
    } else {
      const firstCat = data.categories.find((c) => c.type === 'expense' && !c.archived)
      setRecurringDraft({
        name: '',
        type: 'expense',
        amount: '',
        categoryId: firstCat?.id ?? '',
        accountId: activeAccounts[0]?.id ?? '',
        rule: 'monthly',
        interval: '1',
        nextDate: todayKey(),
        endDate: '',
        auto: false,
        note: '',
      })
    }
    setRecurringOpen(ruleId)
  }

  const closeRecurring = () => setRecurringOpen(null)

  const setDraftType = (type: 'expense' | 'income') => {
    const list = data.categories.filter((c) => c.type === type && !c.archived)
    setRecurringDraft((d) => {
      const stillValid = list.some((c) => c.id === d.categoryId)
      return { ...d, type, categoryId: stillValid ? d.categoryId : (list[0]?.id ?? '') }
    })
  }

  const saveRecurring = () => {
    const cents = parseAmountText(recurringDraft.amount)
    if (cents <= 0) {
      toast('请输入金额')
      return
    }
    if (!recurringDraft.name.trim()) {
      toast('给这条周期账单起个名字')
      return
    }
    if (!recurringDraft.categoryId) {
      toast('请选择分类')
      return
    }
    if (!recurringDraft.accountId) {
      toast('请选择账户')
      return
    }
    if (!recurringDraft.nextDate) {
      toast('请选择下次日期')
      return
    }
    if (recurringDraft.endDate && recurringDraft.endDate < recurringDraft.nextDate) {
      toast('结束日期不能早于下次日期')
      return
    }
    const interval = Math.max(1, Math.round(Number(recurringDraft.interval) || 1))
    const input: RecurringInput = {
      name: recurringDraft.name.trim(),
      type: recurringDraft.type,
      amount: cents,
      categoryId: recurringDraft.categoryId,
      accountId: recurringDraft.accountId,
      note: recurringDraft.note.trim(),
      rule: recurringDraft.rule,
      interval,
      nextDate: recurringDraft.nextDate,
      endDate: recurringDraft.endDate || undefined,
      auto: recurringDraft.auto,
      enabled: editingRule ? editingRule.enabled : true,
    }
    if (editingRule) {
      updateRecurring(editingRule.id, input)
      toast('周期账单已更新')
    } else {
      addRecurring(input)
      toast('周期账单已添加')
    }
    closeRecurring()
  }

  const removeRecurring = async () => {
    if (!editingRule) return
    const ok = await confirm({
      title: '删除这条周期账单？',
      message: `「${editingRule.name || editingRule.note || '周期账单'}」将不再自动生成账单，已入账的记录保留。`,
      confirmText: '删除',
      danger: true,
    })
    if (!ok) return
    deleteRecurring(editingRule.id)
    toast('周期账单已删除')
    closeRecurring()
  }

  const postDue = (dueId: string) => {
    resolveRecurringDue(dueId, 'post')
    toast('已入账')
  }

  const skipDue = (dueId: string) => {
    resolveRecurringDue(dueId, 'skip')
    toast('已跳过这次')
  }

  const ruleIcon = (cat: Category | undefined) => cat?.icon ?? 'repeat'

  return (
    <div className="page">
      <header className="topbar">
        <h1 className="page-title">预算</h1>
        <MonthSwitcher month={month} onChange={onMonthChange} />
      </header>

      {dues.length > 0 && (
        <section className="card due-card">
          <div className="card__head">
            <h2 className="card__title">待入账的周期账单</h2>
            <span className="card__count">{dues.length}</span>
          </div>
          <p className="due-card__hint">已到期的周期账单，确认后计入账本</p>
          <div className="due-list">
            {dues.map((due) => {
              const rule = ruleMap.get(due.ruleId)
              const cat = rule ? catMap.get(rule.categoryId) : undefined
              const title = rule?.name || rule?.note || cat?.name || '周期账单'
              return (
                <div className="due-row" key={due.id}>
                  <span
                    className="due-row__icon"
                    style={{
                      background: `${cat?.color ?? '#94a3b8'}1a`,
                      color: cat?.color ?? '#94a3b8',
                    }}
                    aria-hidden="true"
                  >
                    <Icon name={ruleIcon(cat)} size={18} />
                  </span>
                  <span className="due-row__main">
                    <span className="due-row__title">{title}</span>
                    <span className="due-row__sub">{formatDayLabel(due.date)}</span>
                  </span>
                  <span className="due-row__right">
                    <b
                      className={cn(
                        'due-row__amount',
                        rule?.type === 'income' && 'is-income',
                      )}
                    >
                      {rule ? signedYuan(rule.type === 'expense' ? -rule.amount : rule.amount) : '--'}
                    </b>
                    <span className="due-row__actions">
                      <button className="btn btn--ghost btn--sm" onClick={() => skipDue(due.id)}>
                        跳过
                      </button>
                      <button className="btn btn--primary btn--sm" onClick={() => postDue(due.id)}>
                        入账
                      </button>
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className="card budget-hero">
        <div className="card__head">
          <h2 className="card__title">总预算</h2>
          <button className="text-btn" onClick={() => openSheet('all')}>
            {overall ? '编辑' : '设置'}
          </button>
        </div>

        {overall && status ? (
          <>
            <div className="budget-hero__nums">
              <div>
                <span>已支出</span>
                <b className={status.over ? 'is-danger' : ''}>{yuan(status.spent)}</b>
              </div>
              <div className="budget-hero__right">
                <span>{status.over ? '已超支' : '剩余可用'}</span>
                <b className={status.over ? 'is-danger' : ''}>{yuan(Math.abs(status.remaining))}</b>
              </div>
            </div>
            <ProgressBar value={status.ratio * 100} danger={status.over} />
            <div className="budget-hero__foot">
              <span>
                预算 {yuan(status.budget, 0)} · 已用 {pct}%
              </span>
              <span>
                {status.daysLeft > 0
                  ? allowance
                    ? `剩 ${status.daysLeft} 天 · 日均可用 ${smartYuan(allowance.todayAllow)}`
                    : `剩 ${status.daysLeft} 天`
                  : '本月已结束'}
              </span>
            </div>

            {status.over ? (
              <div className="banner banner--danger">
                <Icon name="alert" size={16} />
                本月已超支 {yuan(-status.remaining)}，接下来的开销记得悠着点
              </div>
            ) : status.ratio >= 0.9 ? (
              <div className="banner banner--warn">
                <Icon name="alert" size={16} />
                预算快用完了，只剩 {yuan(status.remaining)} 可用
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon="target"
            title="还没有设置本月预算"
            hint="定个目标，花钱更有数"
            action="设置总预算"
            onAction={() => openSheet('all')}
          />
        )}
      </section>

      <section className="card recurring-card">
        <div className="card__head">
          <h2 className="card__title">
            周期账单 <span className="card__count">{data.recurring.length}</span>
          </h2>
          <button className="text-btn" onClick={() => openRecurring('new')}>
            <Icon name="plus" size={14} /> 添加
          </button>
        </div>

        {recurringSorted.length === 0 ? (
          <EmptyState
            icon="repeat"
            title="还没有周期账单，房租、订阅、工资都可以自动记"
            action="添加周期账单"
            onAction={() => openRecurring('new')}
          />
        ) : (
          <div className="recurring-list">
            {recurringSorted.map(({ rule, cat }) => (
              <div
                key={rule.id}
                className={cn('recurring-row', !rule.enabled && 'is-off')}
                role="button"
                tabIndex={0}
                onClick={() => openRecurring(rule.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openRecurring(rule.id)
                  }
                }}
              >
                <span
                  className="recurring-row__icon"
                  style={{
                    background: `${cat?.color ?? '#94a3b8'}1a`,
                    color: cat?.color ?? '#94a3b8',
                  }}
                  aria-hidden="true"
                >
                  <Icon name={ruleIcon(cat)} size={18} />
                </span>
                <span className="recurring-row__main">
                  <span className="recurring-row__head">
                    <b>{rule.name || rule.note || cat?.name || '周期账单'}</b>
                    {rule.auto ? (
                      <em className="tag tag--auto">自动</em>
                    ) : (
                      <em className="tag tag--nowrap">需确认</em>
                    )}
                    <span
                      className={cn(
                        'recurring-row__amount',
                        rule.type === 'income' && 'is-income',
                      )}
                    >
                      {signedYuan(rule.type === 'expense' ? -rule.amount : rule.amount)}
                    </span>
                  </span>
                  <span className="recurring-row__sub">
                    {recurrenceLabel(rule.rule, rule.interval)}
                    {rule.name && rule.note ? ` · ${rule.note}` : ''}
                    {' · '}
                    下次 {formatDayLabel(rule.nextDate)}
                    {cat ? ` · ${cat.name}` : ''}
                    {rule.endDate ? ` · 至 ${rule.endDate}` : ''}
                  </span>
                </span>
                <span
                  className="recurring-row__toggles"
                  role="group"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Toggle
                    checked={rule.auto}
                    onChange={(auto) => updateRecurring(rule.id, { auto })}
                    label={`${rule.name || '周期账单'} 到期自动记账`}
                  />
                  <Toggle
                    checked={rule.enabled}
                    onChange={(enabled) => updateRecurring(rule.id, { enabled })}
                    label={`${rule.name || '周期账单'} 启用`}
                  />
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {canCopy && (
        <button className="btn btn--soft btn--block" onClick={copyLast}>
          <Icon name="restore" size={17} /> 复制上月预算（{lastBudgets.length} 项）
        </button>
      )}

      <div className="section-head">
        <h2 className="section-title">分类预算</h2>
        <span className="section-hint">{catBudgets.length} 项</span>
      </div>

      {catBudgets.length === 0 ? (
        <p className="muted-line">给容易超支的分类单独设个额度，比如餐饮、购物。</p>
      ) : (
        <div className="budget-list">
          {catBudgets.map((b) => {
            const cat = catMap.get(b.categoryId)
            const st = budgetStatus(data.transactions, month, b)
            return (
              <button key={b.id} className="budget-row" onClick={() => openSheet(b.categoryId)}>
                <span
                  className="budget-row__icon"
                  style={{
                    background: `${cat?.color ?? '#94a3b8'}1a`,
                    color: cat?.color ?? '#94a3b8',
                  }}
                  aria-hidden="true"
                >
                  <Icon name={cat?.icon ?? 'box'} size={18} />
                </span>
                <span className="budget-row__main">
                  <span className="budget-row__head">
                    <b>
                      {cat?.name ?? '未知分类'}
                      {st.over && <em className="tag tag--danger">超支</em>}
                    </b>
                    <span className={st.over ? 'is-danger' : ''}>
                      {yuan(st.spent, 0)} / {yuan(st.budget, 0)}
                    </span>
                  </span>
                  <ProgressBar value={st.ratio * 100} danger={st.over} color={cat?.color} />
                </span>
              </button>
            )
          })}
        </div>
      )}

      {unbudgeted.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">添加分类预算</h2>
          </div>
          <div className="chips chips--wrap">
            {unbudgeted.map((c) => (
              <button key={c.id} className="chip chip--add" onClick={() => openSheet(c.id)}>
                <Icon name="plus" size={14} />
                <Icon name={c.icon} size={14} /> {c.name}
              </button>
            ))}
          </div>
        </>
      )}

      <p className="footnote">
        {monthLabel(month)}共支出 {yuan(summary.expense, 0)}
        {status ? ` · 剩余预算 ${yuan(Math.max(status.remaining, 0), 0)}` : ''}
        {summary.count === 0 ? ' · 还没有记账' : ''}
      </p>

      <Sheet
        open={sheetCategory !== null}
        onClose={closeSheet}
        title={sheetTitle}
        subtitle={monthLabel(month)}
      >
        <div className="sheet__body">
          <AmountField value={amount} onChange={setAmount} autoFocus />
          <div className="chips chips--wrap quick-amounts">
            {QUICK_AMOUNTS.map((v) => (
              <button key={v} className="chip chip--sm" onClick={() => setAmount(String(v))}>
                ¥{v}
              </button>
            ))}
          </div>
          <button className="btn btn--primary btn--block btn--tall" onClick={save}>
            保存预算
          </button>
          {existing && (
            <button className="link-danger" onClick={remove}>
              <Icon name="trash" size={16} /> 删除该预算
            </button>
          )}
          {sheetCategory && sheetCategory !== 'all' && (
            <p className="sheet-hint">
              该分类本月已支出 {yuan(spentFor(data.transactions, month, sheetCategory), 0)}
            </p>
          )}
        </div>
      </Sheet>

      <Sheet
        open={recurringOpen !== null}
        onClose={closeRecurring}
        title={editingRule ? '编辑周期账单' : '新建周期账单'}
        subtitle={editingRule ? recurrenceLabel(editingRule.rule, editingRule.interval) : '到点自动记账或提醒你确认'}
        className="sheet--tall"
      >
        <div className="sheet__body">
          <label className="field">
            <span className="field__label">名称</span>
            <input
              value={recurringDraft.name}
              placeholder="例如：房租、视频会员、工资"
              maxLength={30}
              onChange={(e) => patchDraft({ name: e.target.value })}
            />
          </label>

          <div className="field">
            <span className="field__label">类型</span>
            <Segmented
              value={recurringDraft.type}
              options={[
                { value: 'expense', label: '支出' },
                { value: 'income', label: '收入' },
              ]}
              onChange={setDraftType}
            />
          </div>

          <div className="field">
            <span className="field__label">金额</span>
            <AmountField
              value={recurringDraft.amount}
              onChange={(v) => patchDraft({ amount: v })}
              autoFocus={!editingRule}
            />
          </div>

          <div className="field">
            <span className="field__label">分类</span>
            <div className="chips chips--wrap">
              {draftCats.map((c) => (
                <button
                  key={c.id}
                  className={cn('chip', recurringDraft.categoryId === c.id && 'is-active')}
                  onClick={() => patchDraft({ categoryId: c.id })}
                >
                  <Icon name={c.icon} size={14} /> {c.name}
                </button>
              ))}
              {draftCats.length === 0 && (
                <p className="field__hint">这个类型下还没有可用分类</p>
              )}
            </div>
          </div>

          <div className="field">
            <span className="field__label">账户</span>
            <div className="chips chips--wrap">
              {activeAccounts.map((a) => (
                <button
                  key={a.id}
                  className={cn('chip', recurringDraft.accountId === a.id && 'is-active')}
                  onClick={() => patchDraft({ accountId: a.id })}
                >
                  {a.name}
                </button>
              ))}
              {activeAccounts.length === 0 && (
                <p className="field__hint">先去「我的」里添加一个账户</p>
              )}
            </div>
          </div>

          <div className="field">
            <span className="field__label">频率</span>
            <Segmented
              value={recurringDraft.rule}
              options={RECURRENCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(rule) => patchDraft({ rule })}
            />
          </div>

          <div className="field recurring-interval">
            <span className="field__label">
              每 N{' '}
              {RECURRENCE_OPTIONS.find((o) => o.value === recurringDraft.rule)?.unit ?? '月'}
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              value={recurringDraft.interval}
              onChange={(e) => patchDraft({ interval: e.target.value.replace(/[^\d]/g, '') })}
              onBlur={() =>
                patchDraft({ interval: String(Math.max(1, Number(recurringDraft.interval) || 1)) })
              }
            />
          </div>

          <div className="field">
            <span className="field__label">下次日期</span>
            <input
              type="date"
              value={recurringDraft.nextDate}
              onChange={(e) => patchDraft({ nextDate: e.target.value })}
            />
          </div>

          <div className="field">
            <span className="field__label">结束日期（可选）</span>
            <input
              type="date"
              value={recurringDraft.endDate}
              min={recurringDraft.nextDate || undefined}
              onChange={(e) => patchDraft({ endDate: e.target.value })}
            />
            <p className="field__hint">留空表示长期有效</p>
          </div>

          <div className="field">
            <div className="recurring-switch">
              <span>
                <span className="field__label">是否自动记账</span>
                <p className="field__hint">关闭时到期会提醒你确认</p>
              </span>
              <Toggle
                checked={recurringDraft.auto}
                onChange={(auto) => patchDraft({ auto })}
                label="到期自动记账"
              />
            </div>
          </div>

          <label className="field">
            <span className="field__label">备注</span>
            <input
              value={recurringDraft.note}
              placeholder="选填，会写进账单备注"
              maxLength={40}
              onChange={(e) => patchDraft({ note: e.target.value })}
            />
          </label>

          <button className="btn btn--primary btn--block btn--tall" onClick={saveRecurring}>
            {editingRule ? '保存修改' : '添加周期账单'}
          </button>
          {editingRule && (
            <button className="link-danger" onClick={removeRecurring}>
              <Icon name="trash" size={16} /> 删除该周期账单
            </button>
          )}
        </div>
      </Sheet>
    </div>
  )
}
