import { useEffect, useMemo, useState } from 'react'
import type { Transaction } from './types'
import { currentMonth, haptic, todayKey, yuan } from './utils'
import { useStore } from './store'
import { useUi } from './ui'
import { buildBadges, type Badge } from './insights'
import { HomePage, type QuickAddInput } from './components/Home'
import { StatsPage } from './components/Stats'
import { BudgetPage } from './components/Budget'
import { SettingsPage } from './components/Settings'
import { TemplatesSheet } from './components/Templates'
import { AchievementsSheet, BadgeCelebration } from './components/Achievements'
import { TabBar, type QuickMode, type TabKey } from './components/TabBar'
import { QuickAdd } from './components/QuickAdd'

/** 周期账单待确认数量（含尚未生成待办的到期规则） */
export function useDueCount(): number {
  const { data } = useStore()
  const today = todayKey()
  return (
    data.recurringDues.filter((d) => d.date <= today).length +
    data.recurring.filter(
      (r) => r.enabled && !r.auto && r.nextDate <= today && (!r.endDate || r.nextDate <= r.endDate),
    ).length
  )
}

export default function App() {
  const { data, addTransaction, markBadgesSeen } = useStore()
  const { toast } = useUi()
  const [tab, setTab] = useState<TabKey>('home')
  const [month, setMonth] = useState(currentMonth())
  const [quickOpen, setQuickOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [mode, setMode] = useState<QuickMode>('expense')
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [achievementsOpen, setAchievementsOpen] = useState(false)
  const [celebrating, setCelebrating] = useState<Badge[]>([])

  const dueCount = useDueCount()
  const badges = useMemo(() => buildBadges(data), [data])
  const unseen = badges.filter(
    (b) => b.unlocked && !(data.settings?.seenBadges ?? []).includes(b.id),
  )
  const unseenKey = unseen.map((b) => b.id).join(',')

  const openAdd = (nextMode: QuickMode = 'expense') => {
    setEditing(null)
    setMode(nextMode)
    setQuickOpen(true)
  }

  const openEdit = (tx: Transaction) => {
    setEditing(tx)
    setQuickOpen(true)
  }

  const closeQuick = () => {
    setQuickOpen(false)
    setEditing(null)
  }

  const openTemplates = () => {
    setTab('settings')
    setTemplatesOpen(true)
  }

  // 首页快捷栏：直接记一笔
  const handleQuickAdd = (input: QuickAddInput) => {
    addTransaction({
      type: input.type,
      amount: input.amount,
      categoryId: input.categoryId,
      accountId: input.accountId,
      note: input.note,
      date: todayKey(),
    })
    toast(`已记录 ${yuan(input.amount)}`)
  }

  // 切页时回到顶部
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [tab])

  // 有新成就时弹一次庆祝，标记后不再重复
  useEffect(() => {
    if (!unseenKey) return
    setCelebrating(unseen)
    haptic([12, 36, 12])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unseenKey])

  const closeCelebration = () => {
    markBadgesSeen(celebrating.map((b) => b.id))
    setCelebrating([])
  }

  return (
    <div className="app">
      <main className="app__main" key={tab}>
        {tab === 'home' && (
          <HomePage
            month={month}
            onMonthChange={setMonth}
            onEdit={openEdit}
            onAdd={openAdd}
            onQuickAdd={handleQuickAdd}
            onManageTemplates={openTemplates}
            onOpenAchievements={() => setAchievementsOpen(true)}
          />
        )}
        {tab === 'stats' && (
          <StatsPage
            month={month}
            onMonthChange={setMonth}
            onEdit={openEdit}
            onOpenSettings={() => setTab('settings')}
          />
        )}
        {tab === 'budget' && <BudgetPage month={month} onMonthChange={setMonth} />}
        {tab === 'settings' && (
          <SettingsPage onOpenAchievements={() => setAchievementsOpen(true)} />
        )}
      </main>

      <TabBar tab={tab} onChange={setTab} onAdd={openAdd} dueCount={dueCount} />
      <QuickAdd open={quickOpen} draft={editing} mode={mode} onClose={closeQuick} />
      <TemplatesSheet open={templatesOpen} onClose={() => setTemplatesOpen(false)} templates={data.templates} />
      <AchievementsSheet open={achievementsOpen} onClose={() => setAchievementsOpen(false)} />
      <BadgeCelebration badges={celebrating} onClose={closeCelebration} />
    </div>
  )
}
