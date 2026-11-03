import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  Account,
  AppData,
  Category,
  DebtPlan,
  MoneyType,
  QuickTemplate,
  RecurringRule,
  Settings,
  ThemeMode,
  Transaction,
} from './types'
import { STORAGE_KEY, loadData, saveData, seedData } from './storage'
import { createDebouncedSaver, SAVE_DEBOUNCE_MS, type DebouncedSaver } from './persistence'
import { adjustTransaction as adjustRecord, dueInstances } from './stats'
import { todayKey, uid } from './utils'

export type TxInput = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>
export type RecurringInput = Omit<RecurringRule, 'id' | 'createdAt'>

declare global {
  interface Window {
    /** react-native-webview 注入的通信桥 */
    ReactNativeWebView?: { postMessage: (message: string) => void }
  }
}

interface StoreValue {
  data: AppData
  /** 本地数据损坏，已进入只读保护模式（不会覆盖原始数据） */
  corrupted: boolean
  /** 最近一次写入本地存储失败（通常是空间已满） */
  saveFailed: boolean
  addTransaction: (input: TxInput) => void
  updateTransaction: (id: string, patch: Partial<TxInput>) => void
  deleteTransaction: (id: string) => void
  /** 余额校准：把账户余额对齐到目标值，返回是否产生了调整记录 */
  reconcileAccount: (accountId: string, targetBalance: number) => boolean
  addCategory: (input: Omit<Category, 'id'>) => void
  updateCategory: (id: string, patch: Partial<Category>) => void
  deleteCategory: (id: string) => void
  addAccount: (input: Omit<Account, 'id'>) => void
  updateAccount: (id: string, patch: Partial<Account>) => void
  deleteAccount: (id: string) => void
  setBudget: (month: string, categoryId: string, amount: number) => void
  removeBudget: (id: string) => void
  addRecurring: (input: RecurringInput) => void
  updateRecurring: (id: string, patch: Partial<RecurringInput>) => void
  deleteRecurring: (id: string) => void
  /** 处理一条待确认的周期账单：记账或跳过 */
  resolveRecurringDue: (dueId: string, action: 'post' | 'skip') => void
  addTemplate: (input: Omit<QuickTemplate, 'id' | 'createdAt'>) => void
  deleteTemplate: (id: string) => void
  saveDebtPlan: (
    accountId: string,
    input: Pick<DebtPlan, 'principal' | 'monthlyPayment' | 'apr' | 'targetDate'>,
  ) => void
  deleteDebtPlan: (accountId: string) => void
  updateSettings: (patch: Partial<Settings>) => void
  markBadgesSeen: (ids: string[]) => void
  setTheme: (theme: ThemeMode) => void
  replaceData: (data: AppData) => void
  clearTransactions: () => void
  resetAll: () => void
}

const StoreContext = createContext<StoreValue | null>(null)

function applyTheme(mode: ThemeMode) {
  const dark =
    mode === 'dark' ||
    (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  const meta = document.querySelector('meta[name="theme-color"]')
  // 与 styles.css 中的 --bg 保持一致，否则状态栏和页面背景会有色差
  if (meta) meta.setAttribute('content', dark ? '#0e1015' : '#f3f4f8')
  // 通知原生壳（Expo WebView）同步状态栏 / 底部安全区的背景色，避免深色模式露出白边
  try {
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'theme', dark }))
  } catch {
    // 非原生壳环境或通信桥不可用时忽略
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const initial = useRef<{ data: AppData; corrupted: boolean } | null>(null)
  if (!initial.current) {
    try {
      initial.current = { data: loadData(), corrupted: false }
    } catch (error) {
      console.error('本地数据无法读取，进入只读保护模式', error)
      initial.current = { data: seedData(), corrupted: true }
    }
  }
  const [data, setData] = useState<AppData>(initial.current.data)
  /** 本地数据损坏时为 true，此时禁止写入，避免覆盖掉可恢复的原始数据 */
  const [corrupted, setCorrupted] = useState(initial.current.corrupted)
  const [saveFailed, setSaveFailed] = useState(false)
  const skipNextSave = useRef(false)

  /* ---------------- 持久化（防抖 + 退出前强制落盘） ---------------- */

  /** 防抖写入器：连续改动合并成一次 localStorage 写 */
  const saver = useRef<DebouncedSaver | null>(null)
  if (!saver.current) {
    // 两种落盘路径（定时器 / flush）都通过回调上报结果，界面提示才准确
    saver.current = createDebouncedSaver(saveData, SAVE_DEBOUNCE_MS, (ok) => setSaveFailed(!ok))
  }

  const corruptedRef = useRef(initial.current.corrupted)
  corruptedRef.current = corrupted

  /** 立即把待写入的数据落盘（页面隐藏 / 卸载时调用） */
  const flushSave = useCallback(() => {
    if (corruptedRef.current) return
    saver.current?.flush()
  }, [])

  useEffect(() => {
    const s = saver.current!
    if (skipNextSave.current) {
      skipNextSave.current = false
      // 数据来自其它标签页，以它为准：丢弃本页待写入的内容，避免互相覆盖
      s.cancel()
      return
    }
    // 数据损坏时不要回写，否则会用空账本覆盖用户还没导出的原始数据
    if (corrupted) return
    s.schedule(data)
  }, [data, corrupted])

  // 页面被隐藏或卸载时，把还没落盘的改动立刻写掉
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushSave()
    }
    window.addEventListener('pagehide', flushSave)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flushSave)
      document.removeEventListener('visibilitychange', onHide)
      flushSave()
    }
  }, [flushSave])

  useEffect(() => {
    applyTheme(data.settings.theme)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (data.settings.theme === 'auto') applyTheme('auto')
    }
    mq.addEventListener('change', onChange)

    // 原生壳（Android WebView）在系统深浅色切换时不一定会派发 prefers-color-scheme 的
    // change 事件，导致「跟随系统」要重启才生效。这里在页面重新可见时补一次判定，
    // 代价极小（仅比较一次媒体查询），可以覆盖切后台改主题再回来的常见路径。
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (data.settings.theme !== 'auto') return
      applyTheme('auto')
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      mq.removeEventListener('change', onChange)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [data.settings.theme])

  // 多标签页之间同步（跳过回写，避免两个标签页来回触发 storage 事件）
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return
      try {
        const next = loadData()
        skipNextSave.current = true
        setData(next)
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const patchData = useCallback((fn: (d: AppData) => AppData) => {
    setData((d) => ({ ...fn(d), updatedAt: Date.now() }))
  }, [])

  /**
   * 周期账单：启动时把到期实例写入待确认列表（手动确认的规则），
   * 自动记账的规则直接生成账单并推进 nextDate。
   * 用“已存在同名同日期账单/待办”做幂等判断，StrictMode 重复执行也不会重复入账。
   */
  useEffect(() => {
    setData((current) => {
      const today = todayKey()
      const dueKeys = new Set(current.recurringDues.map((d) => `${d.ruleId}|${d.date}`))
      // 按「规则 id + 日期」判断是否已入账，避免两条参数相同但不同的规则互相吞掉对方
      const postedKeys = new Set(
        current.transactions
          .filter((t) => t.sourceRuleId)
          .map((t) => `${t.sourceRuleId}|${t.date}`),
      )
      const now = Date.now()
      const newTx: Transaction[] = []
      const newDues = [...current.recurringDues]
      let changed = false

      const recurring = current.recurring.map((rule) => {
        if (!rule.enabled) return rule
        const { dates, nextDate } = dueInstances(rule, today)
        const fresh = dates.filter((date) => !dueKeys.has(`${rule.id}|${date}`))
        const ended = rule.endDate ? nextDate > rule.endDate : false
        const progressed = rule.nextDate !== nextDate || ended
        if (!fresh.length) {
          return progressed
            ? { ...rule, nextDate, enabled: ended ? false : rule.enabled }
            : rule
        }
        changed = true
        for (const date of fresh) {
          const signKey = `${rule.id}|${date}`
          if (rule.auto) {
            if (postedKeys.has(signKey)) continue
            postedKeys.add(signKey)
            newTx.push({
              id: uid('t-'),
              type: rule.type,
              amount: rule.amount,
              categoryId: rule.categoryId,
              accountId: rule.accountId,
              note: rule.note || rule.name,
              date,
              sourceRuleId: rule.id,
              createdAt: now,
              updatedAt: now,
            })
          } else {
            newDues.push({ id: uid('d-'), ruleId: rule.id, date, createdAt: now })
          }
        }
        return { ...rule, nextDate, enabled: ended ? false : rule.enabled }
      })

      if (!changed && !recurring.some((r, i) => r !== current.recurring[i])) return current
      return {
        ...current,
        transactions: newTx.length ? [...newTx, ...current.transactions] : current.transactions,
        recurring,
        recurringDues: newDues,
        updatedAt: now,
      }
    })
    // 只在启动时检查一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo<StoreValue>(() => {
    const addTransaction = (input: TxInput) => {
      const now = Date.now()
      const tx: Transaction = { ...input, id: uid('t-'), createdAt: now, updatedAt: now }
      patchData((d) => ({ ...d, transactions: [tx, ...d.transactions] }))
    }

    const updateTransaction = (id: string, patch: Partial<TxInput>) => {
      patchData((d) => ({
        ...d,
        transactions: d.transactions.map((t) =>
          t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t,
        ),
      }))
    }

    const deleteTransaction = (id: string) => {
      patchData((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== id) }))
    }

    const reconcileAccount = (accountId: string, targetBalance: number): boolean => {
      let changed = false
      patchData((d) => {
        const account = d.accounts.find((a) => a.id === accountId)
        if (!account) return d
        const tx = adjustRecord(account, d.transactions, targetBalance)
        if (!tx) return d
        changed = true
        const now = Date.now()
        return {
          ...d,
          transactions: [{ ...tx, id: uid('t-'), createdAt: now, updatedAt: now }, ...d.transactions],
        }
      })
      return changed
    }

    const addCategory = (input: Omit<Category, 'id'>) => {
      patchData((d) => ({ ...d, categories: [...d.categories, { ...input, id: uid('c-') }] }))
    }

    const updateCategory = (id: string, patch: Partial<Category>) => {
      patchData((d) => ({
        ...d,
        categories: d.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }))
    }

    const deleteCategory = (id: string) => {
      patchData((d) => ({ ...d, categories: d.categories.filter((c) => c.id !== id) }))
    }

    const addAccount = (input: Omit<Account, 'id'>) => {
      patchData((d) => ({ ...d, accounts: [...d.accounts, { ...input, id: uid('a-') }] }))
    }

    const updateAccount = (id: string, patch: Partial<Account>) => {
      patchData((d) => ({
        ...d,
        accounts: d.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      }))
    }

    const deleteAccount = (id: string) => {
      patchData((d) => ({
        ...d,
        accounts: d.accounts.filter((a) => a.id !== id),
        // 连带清理引用该账户的计划 / 周期规则 / 模板，避免留下指向不存在账户的悬空数据
        debts: d.debts.filter((p) => p.accountId !== id),
        recurring: d.recurring.filter((r) => r.accountId !== id),
        templates: d.templates.filter((t) => t.accountId !== id),
      }))
    }

    const setBudget = (month: string, categoryId: string, amount: number) => {
      patchData((d) => {
        const rest = d.budgets.filter((b) => !(b.month === month && b.categoryId === categoryId))
        if (amount <= 0) return { ...d, budgets: rest }
        const existing = d.budgets.find((b) => b.month === month && b.categoryId === categoryId)
        return {
          ...d,
          budgets: [
            ...rest,
            { id: existing?.id ?? uid('b-'), month, categoryId, amount },
          ],
        }
      })
    }

    const removeBudget = (id: string) => {
      patchData((d) => ({ ...d, budgets: d.budgets.filter((b) => b.id !== id) }))
    }

    const addRecurring = (input: RecurringInput) => {
      patchData((d) => ({
        ...d,
        recurring: [...d.recurring, { ...input, id: uid('r-'), createdAt: Date.now() }],
      }))
    }

    const updateRecurring = (id: string, patch: Partial<RecurringInput>) => {
      patchData((d) => ({
        ...d,
        recurring: d.recurring.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      }))
    }

    const deleteRecurring = (id: string) => {
      patchData((d) => {
        const remaining = d.recurring.filter((r) => r.id !== id)
        const ruleIds = new Set(remaining.map((r) => r.id))
        return {
          ...d,
          recurring: remaining,
          recurringDues: d.recurringDues.filter((x) => ruleIds.has(x.ruleId)),
        }
      })
    }

    const resolveRecurringDue = (dueId: string, action: 'post' | 'skip') => {
      patchData((d) => {
        const due = d.recurringDues.find((x) => x.id === dueId)
        if (!due) return d
        const rule = d.recurring.find((r) => r.id === due.ruleId)
        let transactions = d.transactions
        if (action === 'post' && rule) {
          const now = Date.now()
          transactions = [
            {
              id: uid('t-'),
              type: rule.type,
              amount: rule.amount,
              categoryId: rule.categoryId,
              accountId: rule.accountId,
              note: rule.note || rule.name,
              date: due.date,
              sourceRuleId: rule.id,
              createdAt: now,
              updatedAt: now,
            },
            ...transactions,
          ]
        }
        return {
          ...d,
          transactions,
          recurringDues: d.recurringDues.filter((x) => x.id !== dueId),
        }
      })
    }

    const addTemplate = (input: Omit<QuickTemplate, 'id' | 'createdAt'>) => {
      patchData((d) => ({
        ...d,
        templates: [...d.templates, { ...input, id: uid('q-'), createdAt: Date.now() }],
      }))
    }

    const deleteTemplate = (id: string) => {
      patchData((d) => ({ ...d, templates: d.templates.filter((t) => t.id !== id) }))
    }

    const updateSettings = (patch: Partial<Settings>) => {
      patchData((d) => ({ ...d, settings: { ...d.settings, ...patch } }))
    }

    const saveDebtPlan = (
      accountId: string,
      input: Pick<DebtPlan, 'principal' | 'monthlyPayment' | 'apr' | 'targetDate'>,
    ) => {
      patchData((d) => {
        const existing = d.debts.find((p) => p.accountId === accountId)
        const next: DebtPlan = {
          id: existing?.id ?? uid('dp-'),
          accountId,
          principal: Math.max(0, Math.round(input.principal)),
          monthlyPayment: Math.max(0, Math.round(input.monthlyPayment)),
          apr: Math.min(100, Math.max(0, input.apr)),
          targetDate: input.targetDate,
          createdAt: existing?.createdAt ?? Date.now(),
        }
        return {
          ...d,
          debts: [...d.debts.filter((p) => p.accountId !== accountId), next],
        }
      })
    }

    const deleteDebtPlan = (accountId: string) => {
      patchData((d) => ({ ...d, debts: d.debts.filter((p) => p.accountId !== accountId) }))
    }

    const markBadgesSeen = (ids: string[]) => {
      if (!ids.length) return
      patchData((d) => ({
        ...d,
        settings: {
          ...d.settings,
          seenBadges: [...new Set([...(d.settings?.seenBadges ?? []), ...ids])],
        },
      }))
    }

    const setTheme = (theme: ThemeMode) => {
      patchData((d) => ({ ...d, settings: { ...d.settings, theme } }))
    }

    const replaceData = (next: AppData) => {
      setData({ ...next, updatedAt: Date.now() })
      // 用户主动恢复了备份：解除只读保护，恢复正常写入
      setCorrupted(false)
    }

    const clearTransactions = () => {
      patchData((d) => ({ ...d, transactions: [], budgets: [], recurringDues: [] }))
    }

    const resetAll = () => {
      setData(seedData())
      // 主动清空同样视为用户处置完毕，解除只读保护
      setCorrupted(false)
    }

    return {
      data,
      corrupted,
      saveFailed,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      reconcileAccount,
      addCategory,
      updateCategory,
      deleteCategory,
      addAccount,
      updateAccount,
      deleteAccount,
      setBudget,
      removeBudget,
      addRecurring,
      updateRecurring,
      deleteRecurring,
      resolveRecurringDue,
      addTemplate,
      deleteTemplate,
      saveDebtPlan,
      deleteDebtPlan,
      markBadgesSeen,
      updateSettings,
      setTheme,
      replaceData,
      clearTransactions,
      resetAll,
    }
  }, [data, patchData, corrupted, saveFailed])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore 必须在 StoreProvider 内使用')
  return ctx
}

/* ---------- 常用选择器 ---------- */

export function useActiveCategories(type: MoneyType): Category[] {
  const { data } = useStore()
  return useMemo(
    () => data.categories.filter((c) => c.type === type && !c.archived),
    [data.categories, type],
  )
}

export function useActiveAccounts(): Account[] {
  const { data } = useStore()
  return useMemo(() => data.accounts.filter((a) => !a.archived), [data.accounts])
}
