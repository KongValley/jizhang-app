import { useState } from 'react'
import type { Transaction } from '../types'
import { MonthSwitcher, Segmented } from '../ui'
import { Icon } from '../icons'
import { FlowView } from './FlowView'
import { BalanceView } from './Balance'
import { DebtPage } from './Debt'
import { RecapSheet } from './Recap'

type StatsView = 'flow' | 'balance' | 'debt'

/**
 * 统计页外壳：只负责标题栏、视图切换和月度小结弹层。
 *
 * 三个视图各自的计算全部下沉到了子组件里（FlowView / BalanceView / DebtPage），
 * 这样打开「资产负债」或「还款」时不会预先跑一遍收支统计的全表扫描。
 * 注意这里仍然用条件渲染而非隐藏，切回「收支」会重新计算 —— 这是刻意的取舍：
 * 记账数据随时在变，缓存收益很小，而隐藏渲染会常驻三份计算。
 */
export function StatsPage({
  month,
  onMonthChange,
  onEdit: _onEdit,
  onOpenSettings,
}: {
  month: string
  onMonthChange: (month: string) => void
  /** 预留：后续从统计页点开某笔记账时使用 */
  onEdit?: (tx: Transaction) => void
  onOpenSettings?: () => void
}) {
  const [view, setView] = useState<StatsView>('flow')
  const [recapOpen, setRecapOpen] = useState(false)

  return (
    <div className="page">
      <header className="topbar">
        <h1 className="page-title">统计</h1>
        {view === 'debt' ? (
          <span className="badge">
            <Icon name="calendar" size={12} /> 截至今天
          </span>
        ) : (
          <MonthSwitcher month={month} onChange={onMonthChange} />
        )}
      </header>

      <div className="view-switch">
        <Segmented<StatsView>
          value={view}
          onChange={setView}
          options={[
            { value: 'flow', label: '收支' },
            { value: 'balance', label: '资产负债' },
            { value: 'debt', label: '还款' },
          ]}
        />
      </div>

      {view === 'debt' ? (
        <DebtPage onOpenSettings={onOpenSettings} />
      ) : view === 'balance' ? (
        <BalanceView month={month} onOpenDebt={() => setView('debt')} />
      ) : (
        <FlowView month={month} onOpenRecap={() => setRecapOpen(true)} />
      )}

      <RecapSheet open={recapOpen} month={month} onClose={() => setRecapOpen(false)} />
    </div>
  )
}
