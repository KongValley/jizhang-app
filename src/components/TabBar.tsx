import { Icon, type IconName } from '../icons'
import { cn } from '../utils'

export type TabKey = 'home' | 'stats' | 'budget' | 'settings'

/** 记账弹层的初始模式 */
export type QuickMode = 'expense' | 'income' | 'transfer'

function TabItem({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: IconName
  label: string
  active: boolean
  badge?: number
  onClick: () => void
}) {
  return (
    <button className={cn('tab', active && 'is-active')} onClick={onClick} aria-current={active}>
      <span className="tab__icon">
        <Icon name={icon} size={22} strokeWidth={active ? 2.1 : 1.8} />
        {badge ? <i className="tab__badge">{badge > 9 ? '9+' : badge}</i> : null}
      </span>
      <span>{label}</span>
    </button>
  )
}

export function TabBar({
  tab,
  onChange,
  onAdd,
  dueCount,
}: {
  tab: TabKey
  onChange: (tab: TabKey) => void
  onAdd: (mode?: QuickMode) => void
  dueCount?: number
}) {
  return (
    <nav className="tabbar" aria-label="主导航">
      <div className="tabbar__inner">
        <TabItem icon="list" label="明细" active={tab === 'home'} onClick={() => onChange('home')} />
        <TabItem icon="chart" label="统计" active={tab === 'stats'} onClick={() => onChange('stats')} />
        <div className="tabbar__fab">
          <button className="fab" onClick={() => onAdd()} aria-label="记一笔">
            <Icon name="plus" size={27} strokeWidth={2.3} />
          </button>
        </div>
        <TabItem
          icon="target"
          label="预算"
          active={tab === 'budget'}
          badge={dueCount}
          onClick={() => onChange('budget')}
        />
        <TabItem icon="user" label="我的" active={tab === 'settings'} onClick={() => onChange('settings')} />
      </div>
    </nav>
  )
}
