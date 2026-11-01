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
  if (meta) meta.setAttribute('content', dark ? '#0f1115' : '#f2f3f7')
  // 通知原生壳（Expo WebView）同步状态栏 / 底部安全区的背景色，避免深色模式露出白边
  try {
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'theme', dark }))
  } catch {
    // 非原生壳环境或通信桥不可用时忽略
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(loadData)
  const skipNextSave = useRef(false)

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false
      return
    }
    saveData(data)
  }, [data])

  useEffect(() => {
    applyTheme(data.settings.theme)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (data.settings.theme === 'auto') applyTheme('auto')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
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
      const postedKeys = new Set(
        current.transactions
          .filter((t) => t.note)
          .map((t) => `${t.categoryId}|${t.accountId}|${t.amount}|${t.date}`),
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
          const signKey = `${rule.categoryId}|${rule.accountId}|${rule.amount}|${date}`
          if (rule.auto) {
            if (postedKeys.has(signKey)) continue
            newTx.push({
              id: uid('t-'),
              type: rule.type,
              amount: rule.amount,
              categoryId: rule.categoryId,
              accountId: rule.accountId,
              note: rule.note || rule.name,
              date,
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
      patchData((d) => ({ ...d, accounts: d.accounts.filter((a) => a.id !== id) }))
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
    }

    const clearTransactions = () => {
      patchData((d) => ({ ...d, transactions: [], budgets: [], recurringDues: [] }))
    }

    const resetAll = () => {
      setData(seedData())
    }

    return {
      data,
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
  }, [data, patchData])

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
