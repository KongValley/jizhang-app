import { useMemo } from 'react'
import { useStore } from '../store'
import { accountIcon } from '../storage'
import { Icon } from '../icons'
import { balanceTrend, netWorthAt } from '../stats'
import {
  addMonths,
  currentMonth,
  formatMoney,
  monthEndKey,
  smartYuan,
  todayKey,
  yuan,
} from '../utils'
import { BalanceTrend } from './charts'

const MONTHS = 6

export function BalanceView({ month, onOpenDebt }: { month: string; onOpenDebt?: () => void }) {
  const { data } = useStore()

  const cutoff = month === currentMonth() ? todayKey() : monthEndKey(month)
  const snapshot = useMemo(() => netWorthAt(data, cutoff), [data, cutoff])
  const prev = useMemo(() => netWorthAt(data, monthEndKey(addMonths(month, -1))), [data, month])
  const points = useMemo(() => balanceTrend(data, month, MONTHS), [data, month])

  const diff = snapshot.net - prev.net
  const diffPercent = prev.net !== 0 ? (diff / Math.abs(prev.net)) * 100 : 0
  const base = points[0]
  const diffLong = snapshot.net - base.net
  const rate = snapshot.assets > 0 ? (snapshot.liabilities / snapshot.assets) * 100 : 0

  const assetItems = snapshot.assetItems.some((i) => i.balance !== 0)
    ? snapshot.assetItems.filter((i) => i.balance !== 0)
    : snapshot.assetItems
  const liabilityItems = snapshot.liabilityItems

  const [, mm, dd] = cutoff.split('-').map(Number)

  return (
    <div className="worth-view">
      <section className="balance-card worth-hero">
        <div className="balance-card__glow balance-card__glow--a" />
        <div className="balance-card__glow balance-card__glow--b" />
        <div className="balance-card__top">
          <span className="balance-card__label">净资产</span>
          <span className="worth-hero__date">
            截至 {mm}月{dd}日
          </span>
        </div>
        <div className="balance-card__amount">
          <small>{snapshot.net < 0 ? '-¥' : '¥'}</small>
          {formatMoney(Math.abs(snapshot.net))}
        </div>

        <div className="worth-split">
          <div>
            <span>
              <i className="dot dot--asset" />
              总资产
            </span>
            <b>{yuan(snapshot.assets, 0)}</b>
          </div>
          <div>
            <span>
              <i className="dot dot--liability" />
              总负债
            </span>
            <b className={snapshot.liabilities > 0 ? 'is-liability' : ''}>
              {yuan(snapshot.liabilities, 0)}
            </b>
          </div>
        </div>

        <div className="worth-hero__foot">
          <span>
            较上月
            <b className={diff < 0 ? 'is-down' : 'is-up'}>
              {diff >= 0 ? '+' : '−'}
              {smartYuan(Math.abs(diff))}
            </b>
            {prev.net !== 0 && <em>（{Math.abs(diffPercent).toFixed(1)}%）</em>}
          </span>
          <span>资产负债率 {Math.round(rate)}%</span>
        </div>
      </section>

      <section className="card">
        <div className="card__head">
          <h2 className="card__title">
            资产 <span className="card__count">{assetItems.length}</span>
          </h2>
          <span className="card__amount">{yuan(snapshot.assets, 0)}</span>
        </div>
        {assetItems.length === 0 ? (
          <div className="worth-empty">
            <Icon name="bank" size={20} />
            <p>还没有资产账户，到「我的 → 账户」添加现金或银行卡</p>
          </div>
        ) : (
          <div className="worth-list">
            {assetItems.map((item) => (
              <div className="worth-row" key={item.account.id}>
                <span className="worth-row__icon" aria-hidden="true">
                  <Icon name={accountIcon(item.account.kind)} size={18} />
                </span>
                <div className="worth-row__main">
                  <div className="worth-row__head">
                    <span className="worth-row__name">
                      {item.account.name}
                      {item.account.archived && <em className="tag">已归档</em>}
                    </span>
                    <b className={item.balance < 0 ? 'is-danger' : ''}>
                      {smartYuan(item.balance)}
                    </b>
                  </div>
                  <div className="progress progress--thin">
                    <i
                      className="is-asset"
                      style={{ width: `${item.balance > 0 ? Math.max(item.share * 100, 2) : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card__head">
          <h2 className="card__title">
            负债 <span className="card__count">{liabilityItems.length}</span>
          </h2>
          <span className="card__amount is-liability">{yuan(snapshot.liabilities, 0)}</span>
        </div>
        {liabilityItems.length === 0 ? (
          <div className="worth-empty">
            <Icon name="credit-card" size={20} />
            <p>还没有负债账户。信用卡、房贷、借款可以在「我的 → 账户」中添加，性质选「负债」</p>
          </div>
        ) : (
          <div className="worth-list">
            {liabilityItems.map((item) => (
              <div className="worth-row" key={item.account.id}>
                <span className="worth-row__icon worth-row__icon--liability" aria-hidden="true">
                  <Icon name={accountIcon(item.account.kind)} size={18} />
                </span>
                <div className="worth-row__main">
                  <div className="worth-row__head">
                    <span className="worth-row__name">
                      {item.account.name}
                      {item.account.archived && <em className="tag">已归档</em>}
                    </span>
                    <b className="is-liability">{smartYuan(item.balance)}</b>
                  </div>
                  <div className="progress progress--thin progress--liability">
                    <i style={{ width: `${Math.max(item.share * 100, 2)}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {liabilityItems.length > 0 && onOpenDebt && (
          <button className="text-btn worth-link" onClick={onOpenDebt}>
            查看还款进度与预测
            <Icon name="chevron-right" size={14} />
          </button>
        )}
      </section>

      <section className="card">
        <div className="card__head">
          <h2 className="card__title">近 {MONTHS} 个月资产负债</h2>
          <div className="inline-legend">
            <span>
              <i className="dot dot--asset" />
              资产
            </span>
            <span>
              <i className="dot dot--liability" />
              负债
            </span>
          </div>
        </div>
        <BalanceTrend data={points} />
        <p className="card__foot">
          净资产 {yuan(snapshot.net, 0)}，较 {MONTHS - 1} 个月前
          {diffLong >= 0 ? '增加' : '减少'} {yuan(Math.abs(diffLong), 0)}
          {base.net !== 0 ? `（${Math.abs((diffLong / Math.abs(base.net)) * 100).toFixed(1)}%）` : ''}
        </p>
      </section>

      <p className="footnote">
        按账户流水计算：净资产 = 总资产 − 总负债。负债账户的欠款计入负债，溢缴部分计入资产。
      </p>
    </div>
  )
}
