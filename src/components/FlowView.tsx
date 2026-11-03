import { useMemo, useState } from 'react'
import type { MoneyType } from '../types'
import { useStore } from '../store'
import { EmptyState, ProgressBar, Segmented } from '../ui'
import { Icon } from '../icons'
import {
  annualSummary,
  breakdown,
  categoryTrend,
  expenseHeatmap,
  fixedExpenses,
  periodComparison,
  summarize,
  topWithRest,
  trend,
  txInMonth,
} from '../stats'
import {
  addMonths,
  cn,
  formatDayLabel,
  monthLabel,
  monthProgress,
  shortMonthLabel,
  smartYuan,
  todayKey,
  yuan,
} from '../utils'
import { Donut, TrendBars } from './charts'
import { CategoryTrendBars } from './CategoryTrendBars'

const WEEK_HEAD = ['一', '二', '三', '四', '五', '六', '日']

/**
 * 统计页的「收支」视图。
 *
 * 这个视图涉及十余次全表扫描（分类占比、时段对比、热力图、固定支出、年度总结），
 * 因此单独成组件，只在用户真正切到「收支」时才计算，
 * 不会在打开「资产负债」或「还款」时白算一遍。
 */
export function FlowView({
  month,
  onOpenRecap,
}: {
  month: string
  onOpenRecap: () => void
}) {
  const { data } = useStore()
  const [type, setType] = useState<MoneyType>('expense')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const openRecap = onOpenRecap

  const monthTx = useMemo(() => txInMonth(data.transactions, month), [data.transactions, month])
  const summary = useMemo(() => summarize(monthTx), [monthTx])
  const items = useMemo(() => breakdown(monthTx, data.categories, type), [monthTx, data.categories, type])
  const displayItems = useMemo(() => topWithRest(items, 6), [items])
  const trendData = useMemo(() => trend(data.transactions, month, 6), [data.transactions, month])

  const comparisons = useMemo(() => periodComparison(data.transactions), [data.transactions])
  const heatmap = useMemo(() => expenseHeatmap(data.transactions, month), [data.transactions, month])
  const fixed = useMemo(
    () => fixedExpenses(data.transactions, data.categories, month, 6),
    [data.transactions, data.categories, month],
  )
  const annual = useMemo(() => annualSummary(data.transactions, data.categories, month), [
    data.transactions,
    data.categories,
    month,
  ])

  const total = type === 'expense' ? summary.expense : summary.income
  const count = items.reduce((s, i) => s + i.count, 0)
  const avg = count > 0 ? total / count : 0
  const progress = monthProgress(month)
  const daily = total / Math.max(1, progress.elapsed || progress.total)

  const prevMonth = addMonths(month, -1)
  const prev = useMemo(
    () => summarize(txInMonth(data.transactions, prevMonth)),
    [data.transactions, prevMonth],
  )
  const currentValue = type === 'expense' ? summary.expense : summary.income
  const prevValue = type === 'expense' ? prev.expense : prev.income
  const diff = currentValue - prevValue

  const biggest = useMemo(() => {
    const list = monthTx.filter((t) => t.type === type)
    return list.length ? list.reduce((a, b) => (b.amount > a.amount ? b : a)) : null
  }, [monthTx, type])
  const biggestCat = biggest ? data.categories.find((c) => c.id === biggest.categoryId) : undefined

  const catMap = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories])
  const biggestName = biggest ? catMap.get(biggest.categoryId)?.name ?? '未分类' : ''

  const selected =
    selectedCategory && selectedCategory !== '__rest__'
      ? catMap.get(selectedCategory) ?? null
      : null
  const selectedTrend = useMemo(
    () => (selected ? categoryTrend(data.transactions, selected.id, month, 6, type) : []),
    [selected, data.transactions, month, type],
  )

  const toggleTrend = (id: string) => {
    setSelectedCategory((cur) => (cur === id ? null : id))
  }

  const today = todayKey()
  const todayHeat = heatmap.days.find((d) => d.date === today)
  const avgPerActiveDay = heatmap.activeDays > 0 ? heatmap.total / heatmap.activeDays : 0
  const fixedItems = fixed.items.slice(0, 5)

  return (
    <>
          {summary.count > 0 && (
            <button className="recap-banner" onClick={openRecap}>
              <span className="recap-banner__icon">
                <Icon name="sparkle" size={18} />
              </span>
              <span className="recap-banner__body">
                <b>{monthLabel(month)}小结</b>
                <em>
                  {summary.count} 笔记录 ·{' '}
                  {summary.net >= 0 ? `结余 ${yuan(summary.net, 0)}` : `超支 ${yuan(-summary.net, 0)}`}
                </em>
              </span>
              <span className="recap-banner__cta">
                查看
                <Icon name="chevron-right" size={14} />
              </span>
            </button>
          )}
      <section className="card">
        <div className="card__head">
          <h2 className="card__title">分类占比</h2>
          <Segmented
            value={type}
            onChange={setType}
            options={[
              { value: 'expense', label: '支出' },
              { value: 'income', label: '收入' },
            ]}
          />
        </div>

        {total === 0 ? (
          <EmptyState
            icon="chart"
            title={`${monthLabel(month)}还没有${type === 'expense' ? '支出' : '收入'}记录`}
            hint="记几笔账，这里就会出现分类占比"
          />
        ) : (
          <>
            <div className="donut-wrap">
              <Donut items={displayItems} total={total} />
              <div className="donut-center">
                <span>{type === 'expense' ? '总支出' : '总收入'}</span>
                <b>{yuan(total, 0)}</b>
                <em>{count} 笔</em>
              </div>
            </div>
            <ul className="legend">
              {displayItems.map((item) => {
                const isRest = item.id === '__rest__'
                const isOn = selectedCategory === item.id && !isRest
                const tr = isOn ? selectedTrend : []
                const cur = tr.length ? tr[tr.length - 1].amount : 0
                const last = tr.length > 1 ? tr[tr.length - 2].amount : 0
                return (
                  <li key={item.id} className={cn('legend__row', isRest && 'is-rest')}>
                    <span className="legend__dot" style={{ background: item.color }} />
                    <span className="legend__name">
                      <span className="legend__icon" style={{ color: item.color }} aria-hidden="true">
                        <Icon name={item.icon} size={15} />
                      </span>
                      {item.name}
                    </span>
                    <span className="legend__pct">{Math.round(item.share * 100)}%</span>
                    <span className="legend__amount">{yuan(item.amount)}</span>
                    {!isRest ? (
                      <button
                        type="button"
                        className={cn('legend__trend-btn', isOn && 'is-active')}
                        aria-label={`查看${item.name}近 6 个月趋势`}
                        aria-expanded={isOn}
                        title="查看趋势"
                        onClick={() => toggleTrend(item.id)}
                      >
                        <Icon name="trending-up" size={14} />
                      </button>
                    ) : (
                      <span className="legend__trend-btn is-placeholder" aria-hidden="true" />
                    )}
                    {isOn && (
                      <div className="legend__trend">
                        <div className="legend__trend-head">
                          <span>{item.name} · 近 6 个月</span>
                          <span className="legend__trend-cmp">
                            本月 {smartYuan(cur)} · 上月 {smartYuan(last)}
                          </span>
                        </div>
                        <CategoryTrendBars data={tr} color={item.color} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>

      <section className="card compare-card">
        <div className="card__head">
          <h2 className="card__title">时段对比</h2>
          <span className="card__count">支出</span>
        </div>
        <ul className="compare-list">
          {comparisons.map((cmp) => {
            const up = cmp.diff > 0
            const flat = cmp.diff === 0
            return (
              <li key={cmp.label} className="compare-row">
                <div className="compare-row__main">
                  <span className="compare-row__label">{cmp.label}</span>
                  <div className="compare-row__values">
                    <b>{smartYuan(cmp.current)}</b>
                    <em className="compare-row__prev">
                      {cmp.label.startsWith('今天')
                        ? '昨天'
                        : cmp.label.startsWith('近 7 天')
                          ? '前 7 天'
                          : '上月同期'}{' '}
                      {smartYuan(cmp.previous)}
                    </em>
                  </div>
                </div>
                <span className="compare-row__delta">
                  {cmp.rate === null ? (
                    <em className="compare-row__empty">无对比数据</em>
                  ) : flat ? (
                    <span className="compare-row__flat">持平</span>
                  ) : (
                    <span className={cn('compare-row__rate', up ? 'is-danger' : 'is-income')}>
                      <Icon name={up ? 'trending-up' : 'trending-down'} size={14} />
                      {`${up ? '+' : '-'}${Math.abs(Math.round(cmp.rate))}%`}
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="stat-grid">
        <div className="stat-tile">
          <span>日均{type === 'expense' ? '支出' : '收入'}</span>
          <b>{smartYuan(daily)}</b>
          <em>{progress.elapsed || progress.total} 天</em>
        </div>
        <div className="stat-tile">
          <span>单笔平均</span>
          <b>{smartYuan(avg)}</b>
          <em>{count} 笔</em>
        </div>
        <div className="stat-tile">
          <span>最大一笔</span>
          <b>{biggest ? smartYuan(biggest.amount) : '—'}</b>
          <em>{biggest ? biggestName : '暂无'}</em>
        </div>
      </div>

      {biggest && (
        <div className="hint-line">
          <Icon name="calendar" size={15} />
          <span className="hint-line__text">
            {formatDayLabel(biggest.date)} · <Icon name={biggestCat?.icon ?? 'box'} size={14} />{' '}
            {biggestName}
            {biggest.note ? ` · ${biggest.note}` : ''}
          </span>
        </div>
      )}

      <section className="card">
        <div className="card__head">
          <h2 className="card__title">近 6 个月{type === 'expense' ? '支出' : '收入'}趋势</h2>
          <div className="inline-legend">
            <span>
              <i className={`dot dot--${type}`} />
              {type === 'expense' ? '支出' : '收入'}
            </span>
          </div>
        </div>
        <TrendBars data={trendData} series={type} />
        <p className="card__foot">
          {monthLabel(month)}
          {type === 'expense' ? '支出' : '收入'} {yuan(currentValue, 0)}，
          {prevValue === 0
            ? '上月无记录'
            : `比上月${diff >= 0 ? '多' : '少'} ${yuan(Math.abs(diff), 0)}（${Math.abs(
                Math.round((diff / prevValue) * 100),
              )}%）`}
        </p>
      </section>

      {selected && (
        <section className="card category-trend">
          <div className="card__head">
            <h2 className="card__title">
              <span className="category-trend__icon" style={{ color: selected.color }}>
                <Icon name={selected.icon} size={16} />
              </span>
              {selected.name}趋势
            </h2>
            <button
              className="icon-btn icon-btn--sm"
              onClick={() => setSelectedCategory(null)}
              aria-label="收起趋势"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <CategoryTrendBars
            data={selectedTrend}
            color={selected.color}
            large
          />
          <p className="category-trend__foot">
            本月 {smartYuan(selectedTrend[selectedTrend.length - 1]?.amount ?? 0)} · 上月{' '}
            {smartYuan(selectedTrend[selectedTrend.length - 2]?.amount ?? 0)}
            {selectedTrend[selectedTrend.length - 1]?.amount ? (
              <>
                {' '}
                · 近 6 个月月均{' '}
                {smartYuan(
                  selectedTrend.reduce((s, p) => s + p.amount, 0) / Math.max(1, selectedTrend.length),
                )}
              </>
            ) : null}
          </p>
        </section>
      )}

      <section className="card heatmap-card">
        <div className="card__head">
          <h2 className="card__title">每日支出热力</h2>
          <span className="card__count">{monthLabel(month)}</span>
        </div>
        <p className="heatmap-summary">
          日均 {smartYuan(avgPerActiveDay)}
          {' · '}
          最忙的一天{' '}
          {heatmap.worst
            ? `${Number(heatmap.worst.date.slice(5, 7))}月${Number(heatmap.worst.date.slice(8, 10))}日 ${smartYuan(heatmap.worst.expense)}`
            : '暂无'}
          {' · '}
          记账 {heatmap.activeDays} 天
        </p>
        <div className="heatmap">
          <div className="heatmap__head">
            {WEEK_HEAD.map((w) => (
              <span key={w} className="heatmap__head-cell">
                {w}
              </span>
            ))}
          </div>
          <div className="heatmap__grid">
            {heatmap.weeks.map((week, wi) =>
              week.map((day, di) =>
                day ? (
                  <div
                    key={day.date}
                    className={cn('heat-cell', day.date === today && 'is-today')}
                    data-level={day.level}
                    title={`${Number(day.date.slice(5, 7))}月${Number(day.date.slice(8, 10))}日 · ${yuan(day.expense)}`}
                  >
                    <span>{Number(day.date.slice(8, 10))}</span>
                  </div>
                ) : (
                  <div key={`pad-${wi}-${di}`} className="heat-cell is-empty" aria-hidden="true" />
                ),
              ),
            )}
          </div>
          <div className="heatmap__legend" aria-hidden="true">
            <span>少</span>
            {[0, 1, 2, 3, 4].map((lv) => (
              <i key={lv} className="heat-cell-swatch" data-level={lv} />
            ))}
            <span>多</span>
          </div>
        </div>
        {month === today.slice(0, 7) && (
          <p className="card__foot">
            今天 {todayHeat ? `已支出 ${smartYuan(todayHeat.expense)}` : '还没有支出记录'}
          </p>
        )}
      </section>

      <section className="card fixed-card">
        <div className="card__head">
          <h2 className="card__title">固定支出</h2>
          <span className="card__count">近 {fixed.monthsUsed} 个月</span>
        </div>
        {fixedItems.length === 0 ? (
          <EmptyState
            icon="repeat"
            title="记账满 3 个月后，这里会识别房租、订阅这类固定支出"
          />
        ) : (
          <>
            <p className="fixed-card__summary">
              固定支出约占总支出的 <b>{Math.round(fixed.share * 100)}%</b>
              <span className="fixed-card__avg">每月平均 {smartYuan(fixed.monthlyTotal)}</span>
            </p>
            <ul className="fixed-list">
              {fixedItems.map((item) => (
                <li key={item.key} className="fixed-list__row">
                  <span className="fixed-list__icon" style={{ color: item.color }}>
                    <Icon name={item.icon} size={16} />
                  </span>
                  <div className="fixed-list__main">
                    <div className="fixed-list__title">
                      <span className="fixed-list__name">{item.name}</span>
                      <span className="fixed-list__months">
                        {item.months >= fixed.monthsUsed ? '每月均有' : `${item.months}/${fixed.monthsUsed} 月`}
                      </span>
                      <b className="fixed-list__amount">{smartYuan(item.monthlyAvg)}</b>
                    </div>
                    <ProgressBar value={Math.round(item.share * 100)} color={item.color} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card annual-card">
        <div className="card__head">
          <h2 className="card__title">{annual.year} 年度总结</h2>
          <span className="card__count">{annual.monthsRecorded} 个月有记账</span>
        </div>
        <div className="annual-grid">
          <div className="annual-tile">
            <span>全年支出</span>
            <b>{smartYuan(annual.expense)}</b>
          </div>
          <div className="annual-tile">
            <span>全年收入</span>
            <b className="is-income">{smartYuan(annual.income)}</b>
          </div>
          <div className="annual-tile">
            <span>结余</span>
            <b className={annual.net >= 0 ? 'is-income' : 'is-danger'}>{smartYuan(annual.net)}</b>
          </div>
          <div className="annual-tile">
            <span>记账笔数</span>
            <b>{annual.count} 笔</b>
          </div>
          <div className="annual-tile">
            <span>月均支出</span>
            <b>{smartYuan(annual.monthlyAvg)}</b>
          </div>
          <div className="annual-tile">
            <span>支出最高月份</span>
            <b>{annual.topMonth ? shortMonthLabel(annual.topMonth.month) : '—'}</b>
            <em>{annual.topMonth ? smartYuan(annual.topMonth.amount) : ''}</em>
          </div>
          <div className="annual-tile annual-tile--wide">
            <span>最常见分类</span>
            <b className="annual-tile__cat">
              {annual.topCategory ? (
                <>
                  <span style={{ color: annual.topCategory.color }}>
                    <Icon name={annual.topCategory.icon} size={15} />
                  </span>
                  {annual.topCategory.name}
                  <em>{annual.topCategory.count} 次</em>
                </>
              ) : (
                '—'
              )}
            </b>
          </div>
        </div>
      </section>
    </>
  )
}