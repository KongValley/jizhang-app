import type { BreakdownItem, TrendPoint, WorthTrendPoint } from '../stats'
import { compactYuan, shortMonthLabel } from '../utils'

export function Donut({
  items,
  total,
  size = 172,
  thickness = 20,
}: {
  items: BreakdownItem[]
  total: number
  size?: number
  thickness?: number
}) {
  const r = (size - thickness) / 2
  const circumference = 2 * Math.PI * r
  const center = size / 2
  const lengths = items.map((item) =>
    total > 0 ? (item.amount / total) * circumference : 0,
  )
  const offsets = lengths.map((_, index) =>
    lengths.slice(0, index).reduce((sum, value) => sum + value, 0),
  )

  return (
    <svg
      className="donut"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        strokeWidth={thickness}
        className="donut__track"
      />
      <g transform={`rotate(-90 ${center} ${center})`}>
        {items.map((item, index) => {
          const length = lengths[index]
          const dash = Math.max(length - 3, 0)
          return (
            <circle
              key={item.id}
              cx={center}
              cy={center}
              r={r}
              fill="none"
              stroke={item.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offsets[index]}
              strokeLinecap="round"
            />
          )
        })}
      </g>
    </svg>
  )
}

const PAD_TOP = 20
const PAD_BOTTOM = 26
const PAD_X = 10
const W = 320
const H = 172

function niceCeil(value: number): number {
  if (value <= 0) return 1
  const exp = Math.floor(Math.log10(value))
  const base = 10 ** exp
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (step * base >= value) return step * base
  }
  return 10 * base
}

export function TrendBars({ data, series }: { data: TrendPoint[]; series: 'expense' | 'income' }) {  const chartH = H - PAD_TOP - PAD_BOTTOM
  const max = niceCeil(Math.max(...data.map((d) => d[series]), 1))
  const groupW = (W - PAD_X * 2) / Math.max(data.length, 1)
  const barW = Math.min(26, groupW * 0.46)
  const yOf = (value: number) => PAD_TOP + chartH - (value / max) * chartH

  return (
    <svg className="trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="近 6 个月趋势">
      {[0.25, 0.5, 0.75, 1].map((ratio) => (
        <line
          key={ratio}
          x1={PAD_X}
          x2={W - PAD_X}
          y1={PAD_TOP + chartH * (1 - ratio)}
          y2={PAD_TOP + chartH * (1 - ratio)}
          className="trend__grid"
        />
      ))}
      <line
        x1={PAD_X}
        x2={W - PAD_X}
        y1={PAD_TOP + chartH}
        y2={PAD_TOP + chartH}
        className="trend__axis"
      />
      <text x={W - PAD_X} y={PAD_TOP - 7} textAnchor="end" className="trend__max">
        {compactYuan(max)}
      </text>

      {data.map((point, i) => {
        const cx = PAD_X + groupW * i + groupW / 2
        const value = point[series]
        const height = value > 0 ? Math.max(3, (value / max) * chartH) : 0
        return (
          <g key={point.month}>
            {height > 0 && (
              <rect
                x={cx - barW / 2}
                y={yOf(value)}
                width={barW}
                height={height}
                rx={Math.min(6, barW / 2)}
                className={`trend__bar trend__bar--${series}`}
              >
                <title>{`${shortMonthLabel(point.month)} ${series === 'expense' ? '支出' : '收入'} ${compactYuan(value)}`}</title>
              </rect>
            )}
            <text x={cx} y={H - 8} textAnchor="middle" className="trend__label">
              {shortMonthLabel(point.month)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function BalanceTrend({ data }: { data: WorthTrendPoint[] }) {
  const chartH = H - PAD_TOP - PAD_BOTTOM
  const max = niceCeil(Math.max(...data.flatMap((d) => [d.assets, d.liabilities]), 1))
  const groupW = (W - PAD_X * 2) / Math.max(data.length, 1)
  const barW = Math.min(12, groupW * 0.28)
  const gap = 3
  const yOf = (value: number) => PAD_TOP + chartH - (value / max) * chartH

  return (
    <svg className="trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="近几个月资产负债趋势">
      {[0.25, 0.5, 0.75, 1].map((ratio) => (
        <line
          key={ratio}
          x1={PAD_X}
          x2={W - PAD_X}
          y1={PAD_TOP + chartH * (1 - ratio)}
          y2={PAD_TOP + chartH * (1 - ratio)}
          className="trend__grid"
        />
      ))}
      <line
        x1={PAD_X}
        x2={W - PAD_X}
        y1={PAD_TOP + chartH}
        y2={PAD_TOP + chartH}
        className="trend__axis"
      />
      <text x={W - PAD_X} y={PAD_TOP - 7} textAnchor="end" className="trend__max">
        {compactYuan(max)}
      </text>

      {data.map((point, i) => {
        const cx = PAD_X + groupW * i + groupW / 2
        const assetH = point.assets > 0 ? Math.max(3, (point.assets / max) * chartH) : 0
        const liabilityH =
          point.liabilities > 0 ? Math.max(3, (point.liabilities / max) * chartH) : 0
        return (
          <g key={point.month}>
            {assetH > 0 && (
              <rect
                x={cx - barW - gap / 2}
                y={yOf(point.assets)}
                width={barW}
                height={assetH}
                rx={Math.min(6, barW / 2)}
                className="trend__bar trend__bar--asset"
              >
                <title>{`${shortMonthLabel(point.month)} 资产 ${compactYuan(point.assets)}`}</title>
              </rect>
            )}
            {liabilityH > 0 && (
              <rect
                x={cx + gap / 2}
                y={yOf(point.liabilities)}
                width={barW}
                height={liabilityH}
                rx={Math.min(6, barW / 2)}
                className="trend__bar trend__bar--liability"
              >
                <title>{`${shortMonthLabel(point.month)} 负债 ${compactYuan(point.liabilities)}`}</title>
              </rect>
            )}
            <text x={cx} y={H - 8} textAnchor="middle" className="trend__label">
              {shortMonthLabel(point.month)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
