import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import type { Account, AccountKind, AccountNature, Category, MoneyType, ThemeMode } from '../types'
import { useStore } from '../store'
import { ACCOUNT_KINDS, accountIcon, categoryColor, download, normalizeData, stamp, toBackup, toCSV } from '../storage'
import { Dialog, Segmented, Sheet, Toggle, useUi } from '../ui'
import { Icon, type IconName } from '../icons'
import { ICON_CHOICES, ICON_LABELS } from '../icon-set'
import { buildBadges, recordStreak } from '../insights'
import { accountBalance, accountNature, netWorthAt } from '../stats'
import {
  centsToInput,
  cn,
  currentMonth,
  monthLabel,
  parseAmountText,
  signedYuan,
  todayKey,
  yuan,
} from '../utils'
import { ReconcileSheet, TemplatesSheet } from './Templates'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function useInstallPrompt() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null)
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setEvent(e as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])
  const install = async () => {
    if (!event) return false
    await event.prompt()
    const choice = await event.userChoice
    setEvent(null)
    return choice.outcome === 'accepted'
  }
  return { canInstall: Boolean(event), install }
}

export function SettingsPage({
  onOpenAchievements,
}: {
  onOpenAchievements: () => void
}) {
  const {
    data,
    setTheme,
    replaceData,
    clearTransactions,
    resetAll,
    deleteAccount,
    deleteCategory,
    updateAccount,
    updateCategory,
    updateSettings,
  } = useStore()
  const { toast, confirm } = useUi()
  const fileRef = useRef<HTMLInputElement>(null)
  const { canInstall, install } = useInstallPrompt()
  const badges = useMemo(() => buildBadges(data), [data])
  const streak = useMemo(() => recordStreak(data.transactions), [data.transactions])
  const unlockedCount = badges.filter((b) => b.unlocked).length

  const [accountSheet, setAccountSheet] = useState<Account | 'new' | null>(null)
  const [reconcileAccountId, setReconcileAccountId] = useState<string | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categoryTab, setCategoryTab] = useState<MoneyType>('expense')
  const [categoryEdit, setCategoryEdit] = useState<{ category: Category | null } | null>(null)

  const accounts = data.accounts
  const sizeKB = Math.max(1, Math.round(JSON.stringify(data).length / 1024))
  const worth = useMemo(() => netWorthAt(data, todayKey()), [data])

  const exportCSV = (month?: string) => {
    if (data.transactions.length === 0) {
      toast('还没有账单可以导出')
      return
    }
    const filename = month ? `记账本-${month}.csv` : `记账本-全部-${stamp()}.csv`
    download(filename, toCSV(data, month), 'text/csv;charset=utf-8')
    toast('CSV 已导出')
  }

  const backup = () => {
    download(`记账本备份-${stamp()}.json`, toBackup(data), 'application/json')
    toast('备份文件已生成')
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const next = normalizeData(JSON.parse(await file.text()))
      const ok = await confirm({
        title: '用备份覆盖当前数据？',
        message: `备份包含 ${next.transactions.length} 笔账单、${next.accounts.length} 个账户、${next.categories.length} 个分类。当前数据将被替换。`,
        confirmText: '恢复',
      })
      if (!ok) return
      replaceData(next)
      toast('备份已恢复')
    } catch {
      toast('文件解析失败，请选择正确的备份文件')
    }
  }

  const clearAllTransactions = async () => {
    const ok = await confirm({
      title: '清空所有账单？',
      message: `将删除全部 ${data.transactions.length} 笔账单和预算，账户与分类保留。建议先备份。`,
      confirmText: '清空',
      danger: true,
    })
    if (!ok) return
    clearTransactions()
    toast('账单已清空')
  }

  const resetEverything = async () => {
    const ok = await confirm({
      title: '恢复默认数据？',
      message: '所有账单、账户、分类和预算都会被重置为初始状态，且无法恢复。',
      confirmText: '恢复默认',
      danger: true,
    })
    if (!ok) return
    resetAll()
    toast('已恢复默认数据')
  }

  const toggleAccountArchive = async (account: Account) => {
    if (!account.archived) {
      const used = data.transactions.filter((t) => t.accountId === account.id).length
      const ok = await confirm({
        title: `归档「${account.name}」？`,
        message:
          used > 0
            ? `该账户有 ${used} 笔历史账单，归档后不会出现在记账选择里，历史记录仍然保留。`
            : '归档后不会出现在记账选择里，可以随时恢复。',
        confirmText: '归档',
      })
      if (!ok) return
      updateAccount(account.id, { archived: true })
      toast('已归档')
    } else {
      updateAccount(account.id, { archived: false })
      toast('已恢复')
    }
  }

  const removeAccount = async (account: Account) => {
    const used = data.transactions.filter((t) => t.accountId === account.id).length
    if (used > 0) {
      toast('该账户已有账单，只能归档')
      return
    }
    const ok = await confirm({
      title: `删除账户「${account.name}」？`,
      message: '删除后无法恢复。',
      confirmText: '删除',
      danger: true,
    })
    if (!ok) return
    deleteAccount(account.id)
    setAccountSheet(null)
    toast('账户已删除')
  }

  const deleteCategoryItem = async (category: Category) => {
    const used = data.transactions.filter((t) => t.categoryId === category.id).length
    if (used > 0) {
      toast(`已有 ${used} 笔账单使用该分类，只能归档`)
      return
    }
    const ok = await confirm({
      title: `删除分类「${category.name}」？`,
      message: '删除后无法恢复。',
      confirmText: '删除',
      danger: true,
    })
    if (!ok) return
    deleteCategory(category.id)
    setCategoryEdit(null)
    toast('分类已删除')
  }

  const toggleCategoryArchive = async (category: Category) => {
    if (category.archived) {
      updateCategory(category.id, { archived: false })
      toast('已恢复分类')
      return
    }
    const remaining = data.categories.filter(
      (c) => c.type === category.type && !c.archived && c.id !== category.id,
    ).length
    if (remaining === 0) {
      toast('至少保留一个可用分类')
      return
    }
    updateCategory(category.id, { archived: true })
    toast('已归档分类')
  }

  const categoriesOfTab = useMemo(
    () =>
      data.categories
        .filter((c) => c.type === categoryTab)
        .sort((a, b) => Number(Boolean(a.archived)) - Number(Boolean(b.archived))),
    [data.categories, categoryTab],
  )

  return (
    <div className="page">
      <header className="topbar">
        <h1 className="page-title">我的</h1>
        <span className="badge">
          <Icon name="shield" size={13} /> 数据在本机
        </span>
      </header>

      <section className="card profile-card">
        <span className="profile-card__label">净资产</span>
        <b className={cn('profile-card__balance', worth.net < 0 && 'is-danger')}>
          {signedYuan(worth.net)}
        </b>
        <div className="profile-card__meta">
          <span>
            总资产 <b>{yuan(worth.assets, 0)}</b>
          </span>
          <span>
            总负债 <b className={cn(worth.liabilities > 0 && 'is-liability-text')}>
              {yuan(worth.liabilities, 0)}
            </b>
          </span>
        </div>
        <div className="profile-card__meta profile-card__meta--dim">
          <span>{accounts.filter((a) => !a.archived).length} 个账户</span>
          <span>{data.transactions.length} 笔账单</span>
          <span>{sizeKB} KB 本地数据</span>
        </div>
      </section>

      <Section
        title="账户"
        action={
          <button className="text-btn" onClick={() => setAccountSheet('new')}>
            添加
          </button>
        }
      >
        <div className="section-card">
          {accounts.length === 0 && <p className="muted-line">还没有账户</p>}
          {accounts.map((account) => {
            const count = data.transactions.filter((t) => t.accountId === account.id).length
            const balance = accountBalance(data.transactions, account)
            return (
              <button
                key={account.id}
                className={cn('row', account.archived && 'is-muted')}
                onClick={() => setAccountSheet(account)}
              >
                <span className="row__icon" aria-hidden="true">
                  <Icon name={accountIcon(account.kind)} size={18} />
                </span>
                <span className="row__body">
                  <span className="row__title">
                    {account.name}
                    {accountNature(account) === 'liability' && (
                      <em className="tag tag--liability">负债</em>
                    )}
                    {account.archived && <em className="tag">已归档</em>}
                  </span>
                  <span className="row__sub">
                    期初 {signedYuan(account.initialBalance)} · {count} 笔账单
                  </span>
                </span>
                <span className={cn('row__value', balance < 0 && 'is-danger')}>
                  {signedYuan(balance)}
                </span>
              </button>
            )
          })}
          {accounts.some((a) => !a.archived) && (
            <button
              className="row"
              onClick={() =>
                setReconcileAccountId(accounts.find((a) => !a.archived)?.id ?? null)
              }
            >
              <span className="row__icon" aria-hidden="true">
                <Icon name="zap" size={18} />
              </span>
              <span className="row__body">
                <span className="row__title">余额校准</span>
                <span className="row__sub">按真实余额修正账户，自动生成调整记录</span>
              </span>
              <Icon name="chevron-right" size={16} className="row__chevron" />
            </button>
          )}
        </div>
      </Section>

      <Section
        title="分类"
        action={
          <button className="text-btn" onClick={() => setCategoryOpen(true)}>
            管理
          </button>
        }
      >
        <div className="section-card">
          <button className="row" onClick={() => { setCategoryTab('expense'); setCategoryOpen(true) }}>
            <span className="row__icon" aria-hidden="true"><Icon name="tag" size={18} /></span>
            <span className="row__body">
              <span className="row__title">支出分类</span>
              <span className="row__sub">
                {data.categories.filter((c) => c.type === 'expense' && !c.archived).length} 个可用
              </span>
            </span>
            <Icon name="chevron-right" size={16} className="row__chevron" />
          </button>
          <button className="row" onClick={() => { setCategoryTab('income'); setCategoryOpen(true) }}>
            <span className="row__icon" aria-hidden="true"><Icon name="money" size={18} /></span>
            <span className="row__body">
              <span className="row__title">收入分类</span>
              <span className="row__sub">
                {data.categories.filter((c) => c.type === 'income' && !c.archived).length} 个可用
              </span>
            </span>
            <Icon name="chevron-right" size={16} className="row__chevron" />
          </button>
        </div>
      </Section>

      <Section
        title="成就"
        hint={`已解锁 ${unlockedCount}/${badges.length}`}
        action={
          <button className="text-btn" onClick={onOpenAchievements}>
            查看
          </button>
        }
      >
        <div className="section-card">
          <button className="row" onClick={onOpenAchievements}>
            <span className="row__icon row__icon--award" aria-hidden="true">
              <Icon name="award" size={18} />
            </span>
            <span className="row__body">
              <span className="row__title">我的成就</span>
              <span className="row__sub">
                {streak.current > 0
                  ? `连续记账 ${streak.current} 天 · 最长 ${streak.best} 天`
                  : '记下第一笔，开始收集徽章'}
              </span>
            </span>
            <span className="row__value">{unlockedCount}/{badges.length}</span>
          </button>
        </div>
      </Section>

      <Section
        title="快捷记账"
        action={
          <button className="text-btn" onClick={() => setTemplatesOpen(true)}>
            管理
          </button>
        }
      >
        <div className="section-card">
          <button className="row" onClick={() => setTemplatesOpen(true)}>
            <span className="row__icon" aria-hidden="true">
              <Icon name="zap" size={18} />
            </span>
            <span className="row__body">
              <span className="row__title">常用模板</span>
              <span className="row__sub">
                {data.templates.length ? `${data.templates.length} 个模板，首页一键记录` : '把常买的组合存成模板，首页一键记账'}
              </span>
            </span>
            <Icon name="chevron-right" size={16} className="row__chevron" />
          </button>
        </div>
      </Section>

      <Section title="提醒" hint="只在本机提示">
        <div className="section-card">
          <div className="row row--static">
            <span className="row__icon" aria-hidden="true">
              <Icon name="target" size={18} />
            </span>
            <span className="row__body">
              <span className="row__title">今天还能花多少</span>
              <span className="row__sub">按本月预算剩余额度和天数计算</span>
            </span>
            <Toggle
              label="今天还能花多少"
              checked={data.settings.budgetReminder}
              onChange={(budgetReminder) => updateSettings({ budgetReminder })}
            />
          </div>
          <div className="row row--static">
            <span className="row__icon" aria-hidden="true">
              <Icon name="flame" size={18} />
            </span>
            <span className="row__body">
              <span className="row__title">连续超支提醒</span>
              <span className="row__sub">连续 3 天超过日均时提示</span>
            </span>
            <Toggle
              label="连续超支提醒"
              checked={data.settings.overspendAlert}
              onChange={(overspendAlert) => updateSettings({ overspendAlert })}
            />
          </div>
        </div>
      </Section>

      <Section title="外观">
        <div className="section-card section-card--padded">
          <Segmented<ThemeMode>
            value={data.settings.theme}
            onChange={setTheme}
            options={[
              { value: 'auto', label: '跟随系统' },
              { value: 'light', label: '浅色' },
              { value: 'dark', label: '深色' },
            ]}
          />
        </div>
      </Section>

      <Section title="数据" hint="数据只存在这台设备上">
        <div className="section-card">
          <button className="row" onClick={() => exportCSV()}>
            <span className="row__icon" aria-hidden="true"><Icon name="download" size={18} /></span>
            <span className="row__body">
              <span className="row__title">导出 CSV（全部）</span>
              <span className="row__sub">可用 Excel、Numbers 打开</span>
            </span>
            <Icon name="chevron-right" size={16} className="row__chevron" />
          </button>
          <button className="row" onClick={() => exportCSV(currentMonth())}>
            <span className="row__icon" aria-hidden="true"><Icon name="calendar" size={18} /></span>
            <span className="row__body">
              <span className="row__title">导出本月 CSV</span>
              <span className="row__sub">{monthLabel(currentMonth())}</span>
            </span>
            <Icon name="chevron-right" size={16} className="row__chevron" />
          </button>
          <button className="row" onClick={backup}>
            <span className="row__icon" aria-hidden="true"><Icon name="save" size={18} /></span>
            <span className="row__body">
              <span className="row__title">备份为 JSON</span>
              <span className="row__sub">完整备份，可原样恢复</span>
            </span>
            <Icon name="chevron-right" size={16} className="row__chevron" />
          </button>
          <button className="row" onClick={() => fileRef.current?.click()}>
            <span className="row__icon" aria-hidden="true"><Icon name="upload" size={18} /></span>
            <span className="row__body">
              <span className="row__title">从备份恢复</span>
              <span className="row__sub">选择之前导出的 JSON 文件</span>
            </span>
            <Icon name="chevron-right" size={16} className="row__chevron" />
          </button>
          <button className="row row--danger" onClick={clearAllTransactions}>
            <span className="row__icon" aria-hidden="true"><Icon name="trash" size={18} /></span>
            <span className="row__body">
              <span className="row__title">清空所有账单</span>
              <span className="row__sub">保留账户和分类</span>
            </span>
            <Icon name="chevron-right" size={16} className="row__chevron" />
          </button>
          <button className="row row--danger" onClick={resetEverything}>
            <span className="row__icon" aria-hidden="true"><Icon name="restore" size={18} /></span>
            <span className="row__body">
              <span className="row__title">恢复默认数据</span>
              <span className="row__sub">清除全部设置与记录</span>
            </span>
            <Icon name="chevron-right" size={16} className="row__chevron" />
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden-input"
          onChange={onFile}
        />
      </Section>

      <Section title="关于">
        <div className="section-card">
          <div className="row row--static">
            <span className="row__icon" aria-hidden="true"><Icon name="receipt" size={18} /></span>
            <span className="row__body">
              <span className="row__title">记账本</span>
              <span className="row__sub">版本 1.3.0 · 无需登录，无广告</span>
            </span>
          </div>
          {canInstall ? (
            <button
              className="row"
              onClick={async () => {
                const ok = await install()
                if (ok) toast('已添加到桌面')
              }}
            >
              <span className="row__icon" aria-hidden="true"><Icon name="phone" size={18} /></span>
              <span className="row__body">
                <span className="row__title">安装到桌面</span>
                <span className="row__sub">像 App 一样全屏打开，离线可用</span>
              </span>
              <Icon name="chevron-right" size={16} className="row__chevron" />
            </button>
          ) : (
            <div className="row row--static">
              <span className="row__icon" aria-hidden="true"><Icon name="phone" size={18} /></span>
              <span className="row__body">
                <span className="row__title">添加到主屏幕</span>
                <span className="row__sub">浏览器菜单 → 添加到主屏幕，即可离线使用</span>
              </span>
            </div>
          )}
        </div>
      </Section>

      <p className="footnote">
        数据保存在浏览器本地存储中，换设备或清理浏览器数据前请先导出备份。
      </p>

      <AccountEditor
        open={accountSheet !== null}
        account={accountSheet === 'new' ? null : accountSheet}
        onClose={() => setAccountSheet(null)}
        onArchive={toggleAccountArchive}
        onDelete={removeAccount}
      />

      <ReconcileSheet
        accountId={reconcileAccountId}
        onClose={() => setReconcileAccountId(null)}
      />

      <TemplatesSheet
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        templates={data.templates}
      />

      <Sheet
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        title="分类管理"
        subtitle="修改图标名称、归档不常用的分类"
        className="sheet--tall"
      >
        <div className="sheet__body">
          <Segmented<MoneyType>
            value={categoryTab}
            onChange={setCategoryTab}
            options={[
              { value: 'expense', label: '支出' },
              { value: 'income', label: '收入' },
            ]}
          />
          <div className="manage-grid">
            {categoriesOfTab.map((c) => (
              <button
                key={c.id}
                className={cn('manage-item', c.archived && 'is-archived')}
                onClick={() => setCategoryEdit({ category: c })}
              >
                <span
                  className="manage-item__icon"
                  style={{ background: `${c.color}1a`, color: c.color }}
                >
                  <Icon name={c.icon} size={19} />
                </span>
                <span className="manage-item__name">{c.name}</span>
              </button>
            ))}
            <button
              className="manage-item manage-item--add"
              onClick={() => setCategoryEdit({ category: null })}
            >
              <span className="manage-item__icon">
                <Icon name="plus" size={20} />
              </span>
              <span className="manage-item__name">新建</span>
            </button>
          </div>
          <p className="sheet-hint">已被账单使用的分类不能删除，可以归档隐藏。</p>
        </div>
      </Sheet>

      <CategoryEditor
        open={categoryEdit !== null}
        category={categoryEdit?.category ?? null}
        type={categoryTab}
        onClose={() => setCategoryEdit(null)}
        onArchive={toggleCategoryArchive}
        onDelete={deleteCategoryItem}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string
  hint?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="settings-section">
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        {hint && <span className="section-hint">{hint}</span>}
        {action}
      </div>
      {children}
    </section>
  )
}

/* ------------------------------------------------------------------ */

function AccountEditor({
  open,
  account,
  onClose,
  onArchive,
  onDelete,
}: {
  open: boolean
  account: Account | null
  onClose: () => void
  onArchive: (account: Account) => void
  onDelete: (account: Account) => void
}) {
  const { addAccount, updateAccount } = useStore()
  const { toast } = useUi()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<AccountKind>('cash')
  const [nature, setNature] = useState<AccountNature>('asset')
  const [initial, setInitial] = useState('')

  useEffect(() => {
    if (!open) return
    setName(account?.name ?? '')
    setKind(account?.kind ?? 'cash')
    setNature(account ? accountNature(account) : 'asset')
    setInitial(account ? centsToInput(Math.abs(account.initialBalance)) : '')
  }, [open, account])

  const kindMeta = ACCOUNT_KINDS.find((k) => k.value === kind) ?? ACCOUNT_KINDS[0]
  const isLiability = nature === 'liability'

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast('请填写账户名称')
      return
    }
    const amount = parseAmountText(initial)
    const payload = {
      name: trimmed,
      kind,
      nature,
      initialBalance: isLiability ? -Math.abs(amount) : amount,
    }
    if (account) {
      updateAccount(account.id, payload)
      toast('账户已更新')
    } else {
      addAccount(payload)
      toast('账户已添加')
    }
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={account ? '编辑账户' : '添加账户'}
      subtitle="账户余额 = 期初余额 + 收入 − 支出"
    >
      <div className="sheet__body">
        <label className="field">
          <span className="field__label">账户名称</span>
          <input
            value={name}
            name="accountName"
            aria-label="账户名称"
            maxLength={12}
            placeholder={kindMeta.label}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="field">
          <span className="field__label">类型</span>
          <div className="chips chips--wrap">
            {ACCOUNT_KINDS.map((k) => (
              <button
                key={k.value}
                className={cn('chip', kind === k.value && 'is-active')}
                onClick={() => {
                  setKind(k.value)
                  setNature(k.value === 'credit' ? 'liability' : 'asset')
                }}
              >
                <span aria-hidden="true">
                  <Icon name={k.icon} size={15} />
                </span>
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field__label">账户性质</span>
          <div className="chips">
            <button
              className={cn('chip', nature === 'asset' && 'is-active')}
              onClick={() => setNature('asset')}
            >
              资产
            </button>
            <button
              className={cn('chip', nature === 'liability' && 'is-active')}
              onClick={() => setNature('liability')}
            >
              负债
            </button>
          </div>
          <p className="field__hint">信用卡、房贷、借款等计为负债，余额会从净资产中扣除</p>
        </div>

        <div className="field">
          <span className="field__label">{isLiability ? '期初欠款' : '期初余额'}</span>
          <div className="amount-inline">
            <span>¥</span>
            <input
              inputMode="decimal"
              name="initialBalance"
              aria-label={isLiability ? '期初欠款' : '期初余额'}
              value={initial}
              placeholder="0.00"
              onChange={(e) => {
                const next = e.target.value.replace(/[^\d.]/g, '')
                if (/^\d*\.?\d{0,2}$/.test(next)) setInitial(next)
              }}
            />
          </div>
          {isLiability && <p className="field__hint">填入当前欠款金额，例如信用卡未还 ¥1,200 就填 1200</p>}
        </div>

        <button className="btn btn--primary btn--block btn--tall" onClick={save}>
          保存
        </button>

        {account && (
          <div className="sheet-links">
            <button className="text-btn" onClick={() => { onArchive(account); onClose() }}>
              {account.archived ? '恢复账户' : '归档账户'}
            </button>
            <button className="text-btn text-btn--danger" onClick={() => onDelete(account)}>
              删除账户
            </button>
          </div>
        )}
      </div>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ */

function CategoryEditor({
  open,
  category,
  type,
  onClose,
  onArchive,
  onDelete,
}: {
  open: boolean
  category: Category | null
  type: MoneyType
  onClose: () => void
  onArchive: (category: Category) => void
  onDelete: (category: Category) => void
}) {
  const { data, addCategory, updateCategory } = useStore()
  const { toast } = useUi()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<IconName>('tag')

  useEffect(() => {
    if (!open) return
    setName(category?.name ?? '')
    setIcon(category?.icon ?? 'tag')
  }, [open, category])

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast('请填写分类名称')
      return
    }
    if (category) {
      updateCategory(category.id, { name: trimmed, icon })
      toast('分类已更新')
    } else {
      addCategory({
        name: trimmed,
        icon,
        color: categoryColor(data.categories.length),
        type,
      })
      toast('分类已添加')
    }
    onClose()
  }

  const footer = (
    <>
      <button className="btn btn--ghost" onClick={onClose}>
        取消
      </button>
      <button className="btn btn--primary" onClick={save}>
        保存
      </button>
    </>
  )

  return (
    <Dialog open={open} onClose={onClose} title={category ? '编辑分类' : '新建分类'} footer={footer} top>
      <div className="icon-grid">
        {ICON_CHOICES.map((name) => (
          <button
            key={name}
            className={cn('icon-option', icon === name && 'is-active')}
            onClick={() => setIcon(name)}
            aria-label={ICON_LABELS[name] ?? name}
          >
            <Icon name={name} size={20} />
          </button>
        ))}
      </div>
      <label className="field">
        <span className="field__label">分类名称</span>
        <input
          value={name}
          name="categoryName"
          aria-label="分类名称"
          maxLength={8}
          placeholder="例如：早餐"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {category && (
        <div className="sheet-links">
          <button className="text-btn" onClick={() => onArchive(category)}>
            {category.archived ? '恢复分类' : '归档分类'}
          </button>
          <button className="text-btn text-btn--danger" onClick={() => onDelete(category)}>
            删除分类
          </button>
        </div>
      )}
    </Dialog>
  )
}
