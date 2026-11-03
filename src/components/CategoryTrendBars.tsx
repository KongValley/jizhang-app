import { cn, shortMonthLabel, yuan } from '../utils'

/* ------------------------------------------------------------------ */
/* 分类趋势迷你柱状图                                                    */
/* ------------------------------------------------------------------ */

export function CategoryTrendBars({
  data,
  color,
  large,
}: {
  data: { month: string; amount: number }[]
  color: string
  large?: boolean
}) {
  const max = Math.max(...data.map((p) => p.amount), 1)
  return (
    <div className={cn('cat-trend', large && 'cat-trend--lg')}>
      {data.map((p, i) => (
        <div key={p.month} className={cn('cat-trend__col', i === data.length - 1 && 'is-current')}>
          <div className="cat-trend__bar-wrap">
            <div
              className="cat-trend__bar"
              style={{
                height: p.amount > 0 ? `${Math.max(4, (p.amount / max) * 100)}%` : '0%',
                background: color,
              }}
              title={`${shortMonthLabel(p.month)} · ${yuan(p.amount)}`}
            />
          </div>
          <span className="cat-trend__label">{shortMonthLabel(p.month)}</span>
        </div>
      ))}
    </div>
  )
}