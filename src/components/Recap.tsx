import { useMemo } from 'react'
import { useStore } from '../store'
import { buildRecap } from '../insights'
import { ProgressBar, Sheet } from '../ui'
import { Icon } from '../icons'
import { cn, formatDayLabel, monthLabel, signedYuan, yuan } from '../utils'

export function RecapSheet({
  open,
  month,
  onClose,
}: {
  open: boolean
  month: string
  onClose: () => void
}) {
  const { data } = useStore()
  const recap = useMemo(() => buildRecap(data, month), [data, month])

  return (
    <Sheet
      open={open && recap !== null}
      onClose={onClose}
      hideClose
      className="sheet--recap"
      label={`${monthLabel(month)} 月度小结`}
    >
      {recap && (
        <>
          <button className="icon-btn recap-close" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={20} />
          </button>
          <div className="recap-scroll">
            <header className="recap-hero">
              <div className="recap-hero__glow" />
              <span className="recap-hero__kicker">{monthLabel(month)} · 月度小结</span>
              <h2 className="recap-hero__title">{recap.title}</h2>
              <div className="recap-hero__net">
                <span>这个月结余</span>
                <b className={cn(recap.net < 0 && 'is-negative')}>{signedYuan(recap.net)}</b>
              </div>
              <p className="recap-hero__meta">
                {recap.activeDays} 天有记录 · 共 {recap.count} 笔
              </p>
            </header>

            <div className="recap-grid">
              <div>
                <span>支出</span>
                <b>{yuan(recap.expense, 0)}</b>
                <em>
                  {recap.diffRate === null
                    ? '上月无记录'
                    : `比上月${recap.diffRate >= 0 ? '多' : '少'} ${Math.abs(
                        Math.round(recap.diffRate),
                      )}%`}
                </em>
              </div>
              <div>
                <span>收入</span>
                <b className="is-income">{yuan(recap.income, 0)}</b>
                <em>{recap.count} 笔</em>
              </div>
              <div>
                <span>日均支出</span>
                <b>{yuan(recap.expense / Math.max(1, recap.activeDays), 0)}</b>
                <em>按记账天数算</em>
              </div>
              <div>
                <span>最大一笔</span>
                <b>{recap.biggest ? yuan(recap.biggest.amount, 0) : '—'}</b>
                <em>{recap.biggest?.category?.name ?? '暂无'}</em>
              </div>
            </div>

            {recap.top && (
              <section className="recap-section">
                <h3>钱花在哪</h3>
                <div className="recap-top">
                  <span
                    className="recap-top__icon"
                    style={{ background: `${recap.top.color}1a`, color: recap.top.color }}
                  >
                    <Icon name={recap.top.icon} size={20} />
                  </span>
                  <div className="recap-top__body">
                    <b>{recap.top.name}</b>
                    <em>
                      {recap.top.count} 笔 · 占 {Math.round(recap.top.share * 100)}%
                    </em>
                  </div>
                  <span className="recap-top__amount">{yuan(recap.top.amount, 0)}</span>
                </div>
                <ProgressBar value={recap.top.share * 100} color={recap.top.color} />
                {recap.frequent && recap.frequent.name !== recap.top.name && (
                  <p className="recap-note">
                    去得最勤的是「{recap.frequent.name}」，这个月 {recap.frequent.count} 次。
                  </p>
                )}
              </section>
            )}

            {recap.biggest && (
              <section className="recap-section">
                <h3>最大的一笔</h3>
                <p className="recap-big">
                  <b>{yuan(recap.biggest.amount, 0)}</b>
                  <span>
                    {recap.biggest.category?.name ?? '未分类'}
                    {recap.biggest.note ? ` · ${recap.biggest.note}` : ''}
                  </span>
                </p>
                <p className="recap-date">{formatDayLabel(recap.biggest.date)}</p>
              </section>
            )}

            {recap.budget && (
              <section className="recap-section">
                <h3>预算</h3>
                <div className="recap-budget">
                  <b className={recap.budget.kept ? 'is-income' : 'is-danger'}>
                    {recap.budget.kept ? '守住了预算' : '超支了'}
                  </b>
                  <span>
                    {yuan(recap.budget.spent, 0)} / {yuan(recap.budget.amount, 0)}
                  </span>
                </div>
                <ProgressBar value={recap.budget.ratio * 100} danger={!recap.budget.kept} />
              </section>
            )}

            <blockquote className="recap-quote">{recap.note}</blockquote>

            <button className="btn btn--primary btn--block btn--tall" onClick={onClose}>
              收下这份小结
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}
