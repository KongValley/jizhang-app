import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { AmountField, EmptyState, ProgressBar, Sheet, useUi } from '../ui'
import { Icon } from '../icons'
import {
  debtProjection,
  debtSummary,
  forecastPayoff,
  type DebtItem,
} from '../stats'
import { accountIcon } from '../storage'
import {
  centsToInput,
  cn,
  currentMonth,
  formatMoney,
  haptic,
  monthLabel,
  parseAmountText,
  shortMonthLabel,
  signedYuan,
  smartYuan,
  yuan,
} from '../utils'

const QUICK_PAYMENTS = [500, 1000, 2000, 3000, 5000]

export function DebtPage({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { data } = useStore()
  const summary = useMemo(() => debtSummary(data), [data])
  const projection = useMemo(() => debtProjection(summary.items, 600), [summary.items])
  const [editingId, setEditingId] = useState<string | null>(null)

  const editing = summary.items.find((i) => i.account.id === editingId) ?? null

  if (summary.items.length === 0) {
    return (
      <EmptyState
        icon="credit-card"
        title="还没有负债账户"
        hint="添加信用卡、房贷或借款账户后，这里会显示还款进度，并预测何时还清"
        action={onOpenSettings ? '去添加账户' : undefined}
        onAction={onOpenSettings}
      />
    )
  }

  const percent = Math.round(summary.progress * 100)
  const cards = summary.items
  const settledCount = cards.filter((i) => i.settled).length

  return (
    <div className="debt-view">
      <section className="balance-card debt-hero">
        <div className="balance-card__glow balance-card__glow--a" />
        <div className="balance-card__glow balance-card__glow--b" />
        <div className="balance-card__top">
          <span className="balance-card__label">
            {summary.settled ? '负债已还清' : '总欠款'}
          </span>
          <span className="worth-hero__date">截至今天</span>
        </div>
        <div className="balance-card__amount">
          <small>¥</small>
          {formatMoney(summary.totalOwed)}
        </div>

        <div className="debt-hero__track">
          <i style={{ width: `${percent}%` }} />
        </div>
        <div className="debt-hero__meta">
          <span>
            已还 <b>{percent}%</b>
          </span>
          <span>
            起始本金 <b>{yuan(summary.totalPrincipal, 0)}</b>
          </span>
          <span>
            本月已还 <b>{yuan(summary.repaidThisMonth, 0)}</b>
          </span>
        </div>

        <div className="debt-hero__forecast">
          {summary.settled ? (
            <>
              <Icon name="check" size={15} />
              所有负债已还清
            </>
          ) : summary.monthsLeft !== null && summary.payoffDate ? (
            <>
              <Icon name="sparkle" size={15} />
              预计 <b>{monthLabel(summary.payoffDate)}</b> 还清，还需 {summary.monthsLeft} 个月
            </>
          ) : (
            <>
              <Icon name="info" size={15} />
              还没有可用的每月还款额，先给每项负债设置计划
            </>
          )}
        </div>
      </section>

      <div className="section-head">
        <h2 className="section-title">还款进度</h2>
        <span className="section-hint">
          {settledCount ? `${settledCount} 项已还清 · ` : ''}
          共 {cards.length} 项
        </span>
      </div>

      <div className="debt-list">
        {cards.map((item) => (
          <DebtRow key={item.account.id} item={item} onClick={() => setEditingId(item.account.id)} />
        ))}
      </div>

      {projection.length > 2 && (
        <section className="card debt-forecast">
          <div className="card__head">
            <h2 className="card__title">还款预测</h2>
            <span className="card__count">
              {summary.monthsLeft === null ? '无法按当前计划还清' : `${summary.monthsLeft} 个月`}
            </span>
          </div>
          <DebtChart data={projection} />
          <p className="card__foot">
            {summary.monthsLeft !== null && summary.payoffDate
              ? `按当前还款计划，预计 ${monthLabel(summary.payoffDate)} 还清${
                  summary.totalInterest > 0
                    ? `，期间利息约 ${yuan(summary.totalInterest, 0)}`
                    : ''
                }。`
              : '有负债的月供低于利息或尚未设置月供，按当前计划无法还清。'}
          </p>
        </section>
      )}

      <p className="footnote">
        还款进度按「起始本金 − 当前欠款」计算；转入负债账户的转账、收入都算还款，消费和转出会增加欠款。
      </p>

      <DebtPlanSheet
        item={editing}
        onClose={() => setEditingId(null)}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */

function DebtRow({ item, onClick }: { item: DebtItem; onClick: () => void }) {
  const percent = Math.round(item.progress * 100)
  const plan = item.plan
  const forecastLabel = item.settled
    ? '已还清'
    : item.forecast.months !== null && item.forecast.date
      ? `${monthLabel(item.forecast.date)}还清`
      : item.monthlyPayment > 0
        ? '按当前月供无法还清'
        : '未设置月供'

  return (
    <button className={cn('debt-row', item.settled && 'is-settled')} onClick={onClick}>
      <span className="debt-row__icon">
        <Icon name={accountIcon(item.account.kind)} size={18} />
      </span>
      <span className="debt-row__main">
        <span className="debt-row__head">
          <b>
            {item.account.name}
            {item.settled && <em className="tag tag--ok">已还清</em>}
            {!plan && !item.settled && <em className="tag">未设计划</em>}
          </b>
          <span className={cn('debt-row__amount', !item.settled && 'is-owed')}>
            {item.settled ? '¥0.00' : signedYuan(-item.owed)}
          </span>
        </span>
        <ProgressBar
          value={percent}
          danger={item.overPrincipal}
          color={item.settled ? 'var(--income)' : undefined}
        />
        <span className="debt-row__meta">
          <span>
            已还 {percent}%
            {item.overPrincipal ? '（欠款高于起始本金）' : ''}
          </span>
          <span>{forecastLabel}</span>
        </span>
        <span className="debt-row__sub">
          {item.monthlyPayment > 0
            ? `每月 ${yuan(item.monthlyPayment, 0)}${
                item.paymentSource === 'history' ? '（按近 6 个月估算）' : ''
              }`
            : '点开设置每月还款额'}
          {plan && plan.apr > 0 ? ` · 年利率 ${plan.apr}%` : ''}
          {item.plan?.targetDate ? ` · 目标 ${monthLabel(item.plan.targetDate)}` : ''}
        </span>
      </span>
      <Icon name="chevron-right" size={16} className="debt-row__chevron" />
    </button>
  )
}

/* ------------------------------------------------------------------ */

function DebtChart({ data }: { data: { month: string; balance: number }[] }) {
  const W = 320
  const H = 150
  const padX = 10
  const padTop = 18
  const padBottom = 24
  const chartH = H - padTop - padBottom
  const max = Math.max(...data.map((d) => d.balance), 1)

  const step = Math.max(1, Math.ceil((data.length - 1) / 8))
  const points = data.filter((_, i) => i % step === 0 || i === data.length - 1)
  const x = (i: number) =>
    padX + (points.length > 1 ? (i / (points.length - 1)) * (W - padX * 2) : 0)
  const y = (value: number) => padTop + chartH - (value / max) * chartH

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.balance)}`).join(' ')
  const area = `${line} L${x(points.length - 1)},${padTop + chartH} L${x(0)},${padTop + chartH} Z`
  const last = points[points.length - 1]

  return (
    <svg className="debt-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="未来欠款预测">
      <defs>
        <linearGradient id="debtFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0.5, 1].map((ratio) => (
        <line
          key={ratio}
          x1={padX}
          x2={W - padX}
          y1={padTop + chartH * (1 - ratio)}
          y2={padTop + chartH * (1 - ratio)}
          className="trend__grid"
        />
      ))}
      <line
        x1={padX}
        x2={W - padX}
        y1={padTop + chartH}
        y2={padTop + chartH}
        className="trend__axis"
      />
      <text x={W - padX} y={padTop - 6} textAnchor="end" className="trend__max">
        {smartYuan(max)}
      </text>
      <path d={area} fill="url(#debtFill)" />
      <path d={line} className="debt-chart__line" />
      {points.map((p, i) => (
        <circle
          key={p.month}
          cx={x(i)}
          cy={y(p.balance)}
          r={i === points.length - 1 ? 3.4 : 2.2}
          className={i === points.length - 1 ? 'debt-chart__dot is-end' : 'debt-chart__dot'}
        >
          <title>{`${shortMonthLabel(p.month)} · 剩余 ${smartYuan(p.balance)}`}</title>
        </circle>
      ))}
      <text x={padX} y={H - 8} textAnchor="start" className="trend__label">
        {monthLabel(points[0].month)}
      </text>
      <text x={W - padX} y={H - 8} textAnchor="end" className="trend__label">
        {monthLabel(last.month)}
      </text>
    </svg>
  )
}

/* ------------------------------------------------------------------ */

function DebtPlanSheet({ item, onClose }: { item: DebtItem | null; onClose: () => void }) {
  return (
    <Sheet
      open={item !== null}
      onClose={onClose}
      title="还款计划"
      subtitle={item ? `${item.account.name} · 当前欠款 ${yuan(item.owed)}` : undefined}
    >
      {item && <DebtPlanForm key={item.account.id} item={item} onClose={onClose} />}
    </Sheet>
  )
}

function DebtPlanForm({ item, onClose }: { item: DebtItem; onClose: () => void }) {
  const { saveDebtPlan, deleteDebtPlan } = useStore()
  const { toast, confirm } = useUi()
  const [principal, setPrincipal] = useState(() => centsToInput(item.principal))
  const [payment, setPayment] = useState(() =>
    item.plan?.monthlyPayment ? centsToInput(item.plan.monthlyPayment) : '',
  )
  const [apr, setApr] = useState(() => (item.plan?.apr ? String(item.plan.apr) : ''))
  const [target, setTarget] = useState(() => item.plan?.targetDate ?? '')

  const paymentCents = parseAmountText(payment) || item.avgReduction || 0
  const forecast = forecastPayoff(item.owed, paymentCents, Number(apr) || 0)
  const targetLate =
    forecast?.date && target && target < forecast.date ? target : null
  const needed = target ? suggestPayment(item.owed, target, Number(apr) || 0) : 0

  const submit = () => {
    const principalCents = parseAmountText(principal)
    if (principalCents <= 0) {
      toast('请填写起始本金')
      return
    }
    saveDebtPlan(item.account.id, {
      principal: principalCents,
      monthlyPayment: parseAmountText(payment),
      apr: Number(apr) || 0,
      targetDate: target || undefined,
    })
    haptic(8)
    toast('还款计划已保存')
    onClose()
  }

  const remove = async () => {
    const ok = await confirm({
      title: `删除「${item.account.name}」的还款计划？`,
      message: '只删除计划和预测，不影响账户和账单。',
      confirmText: '删除',
      danger: true,
    })
    if (!ok) return
    deleteDebtPlan(item.account.id)
    toast('还款计划已删除')
    onClose()
  }

  return (
    <div className="sheet__body">
      <div className="field">
        <span className="field__label">起始本金（用来算还款进度）</span>
        <AmountField value={principal} onChange={setPrincipal} placeholder="0.00" />
      </div>

      <div className="field">
        <span className="field__label">每月还款额</span>
        <AmountField value={payment} onChange={setPayment} placeholder="留空按近 6 个月平均" />
        <div className="chips chips--wrap">
          {QUICK_PAYMENTS.map((v) => (
            <button
              key={v}
              className={cn('chip chip--sm', payment === String(v) && 'is-active')}
              onClick={() => setPayment(String(v))}
            >
              ¥{v}
            </button>
          ))}
        </div>
        {item.paymentSource === 'history' && !payment && (
          <p className="field__hint">近 6 个月平均每月还款约 {yuan(item.avgReduction, 0)}</p>
        )}
      </div>

      <div className="field-row">
        <label className="field">
          <span className="field__label">年利率 %</span>
          <input
            inputMode="decimal"
            value={apr}
            name="apr"
            aria-label="年利率"
            placeholder="0"
            onChange={(e) => {
              const next = e.target.value.replace(/[^\d.]/g, '')
              if (/^\d*\.?\d{0,2}$/.test(next)) setApr(next)
            }}
          />
        </label>
        <label className="field">
          <span className="field__label">目标还清月份</span>
          <input
            type="month"
            value={target}
            name="targetDate"
            aria-label="目标还清月份"
            onChange={(e) => setTarget(e.target.value)}
          />
        </label>
      </div>

      <div className={cn('debt-preview', forecast && !forecast.feasible && 'is-warn')}>
        {item.owed <= 0 ? (
          <>
            <Icon name="check" size={16} /> 这项负债已经还清了
          </>
        ) : forecast?.feasible && forecast.date ? (
          <>
            <Icon name="sparkle" size={16} />
            <span>
              预计 <b>{monthLabel(forecast.date)}</b> 还清 · 共 {forecast.months} 个月
              {forecast.totalInterest > 0
                ? ` · 利息约 ${yuan(forecast.totalInterest, 0)}`
                : ''}
            </span>
          </>
        ) : paymentCents > 0 ? (
          <>
            <Icon name="alert" size={16} />
            <span>按这个月供无法还清，月供需要高于每月利息 {yuan(forecast?.monthlyInterest ?? 0, 0)}</span>
          </>
        ) : (
          <>
            <Icon name="info" size={16} />
            <span>填入每月还款额后，这里会预测还清时间</span>
          </>
        )}
      </div>
      {targetLate && (
        <p className="field__hint">
          按当前计划会比目标 {monthLabel(targetLate)} 晚，需要把月供提高到{' '}
          {needed > 0 ? yuan(needed, 0) : '—'}。
        </p>
      )}

      <button className="btn btn--primary btn--block btn--tall" onClick={submit}>
        保存计划
      </button>
      {item.plan && (
        <button className="link-danger" onClick={remove}>
          <Icon name="trash" size={16} /> 删除计划
        </button>
      )}
    </div>
  )
}

/** 在目标月份内还清需要的月供（无息近似 + 利率按等额本息反推） */
function suggestPayment(owed: number, targetMonth: string, apr: number): number {
  if (owed <= 0) return 0
  const months = Math.max(1, monthsBetween(currentMonth(), targetMonth))
  const rate = Math.max(0, apr) / 100 / 12
  if (rate === 0) return Math.ceil(owed / months)
  return Math.ceil((owed * rate) / (1 - Math.pow(1 + rate, -months)))
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}
