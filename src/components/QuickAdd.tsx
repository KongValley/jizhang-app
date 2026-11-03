import { useEffect, useMemo, useRef, useState } from 'react'
import type { QuickTemplate, Transaction, TxType } from '../types'
import { useActiveAccounts, useStore } from '../store'
import { Sheet, useUi } from '../ui'
import { Icon } from '../icons'
import { accountIcon } from '../storage'
import { findBudget, parseQuickAdd, spentFor, suggestTemplates } from '../stats'
import {
  cn,
  formatAmountInput,
  haptic,
  parseAmountText,
  todayKey,
  centsToInput,
  yuan,
} from '../utils'

/** 弹层可选的三种界面模式 */
export type QuickAddMode = 'expense' | 'income' | 'transfer'

function dateShift(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return todayKey(d)
}

/** 推荐模板 id 前缀（见 stats.suggestTemplates） */
const SUGGEST_PREFIX = 'suggest-'

const isSuggest = (t: QuickTemplate) => t.id.startsWith(SUGGEST_PREFIX)

/** 推荐项已经在模板列表里落地过（按 分类 + 金额 + 备注 判重） */
function sameTemplate(a: QuickTemplate, b: QuickTemplate): boolean {
  return (
    a.type === b.type &&
    a.amount === b.amount &&
    a.categoryId === b.categoryId &&
    a.note.trim() === b.note.trim()
  )
}

export function QuickAdd({
  open,
  draft,
  mode,
  onClose,
}: {
  open: boolean
  draft: Transaction | null
  mode: QuickAddMode
  onClose: () => void
}) {
  const { data, addTransaction, updateTransaction, deleteTransaction, addTemplate } = useStore()
  const accounts = useActiveAccounts()
  const { toast, confirm } = useUi()

  // 'transfer' 模式下按转账界面编辑；expense / income 正常
  const [type, setType] = useState<TxType>('expense')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [date, setDate] = useState(todayKey())
  const [note, setNote] = useState('')

  const isTransfer = type === 'transfer'
  const noteRef = useRef<HTMLInputElement | null>(null)

  const categories = useMemo(
    () => (isTransfer ? [] : data.categories.filter((c) => c.type === type && !c.archived)),
    [data.categories, type, isTransfer],
  )

  /**
   * 编辑旧账时，这笔账用到的分类/账户可能已经被归档。
   * 它们必须继续出现在选项里并保持选中，否则只改备注保存就会静默改掉分类和所属账户
   * （账户一变，两个账户的余额都会跟着错）。
   */
  const archivedCategory = useMemo(() => {
    if (!draft) return null
    const found = data.categories.find((c) => c.id === draft.categoryId)
    return found?.archived ? found : null
  }, [draft, data.categories])

  const accountChoices = useMemo(() => {
    if (!draft) return accounts
    const usedIds = [draft.accountId, draft.toAccountId].filter(Boolean)
    const extra = data.accounts.filter(
      (a) => a.archived && usedIds.includes(a.id) && !accounts.some((x) => x.id === a.id),
    )
    return extra.length ? [...accounts, ...extra] : accounts
  }, [accounts, data.accounts, draft])

  // 打开时初始化（一次算好，避免多个副作用互相覆盖）
  useEffect(() => {
    if (!open) return
    if (draft) {
      const txType: TxType =
        draft.type === 'transfer' || draft.type === 'adjust' ? 'transfer' : draft.type
      // 允许保留已归档的分类，只要求类型匹配
      const catOk = data.categories.some((c) => c.id === draft.categoryId && c.type === txType)
      const firstCat = data.categories.find((c) => c.type === txType && !c.archived)
      // 账户也允许是已归档的，避免顺带改动历史记录的归属账户
      const accOk = data.accounts.some((a) => a.id === draft.accountId)
      const from = accOk ? draft.accountId : (accounts[0]?.id ?? '')
      const toOk = data.accounts.some((a) => a.id === draft.toAccountId && a.id !== from)
      setType(txType)
      setAmount(centsToInput(draft.amount))
      setCategoryId(catOk ? draft.categoryId : (firstCat?.id ?? ''))
      setAccountId(from)
      setFromId(from)
      setToId(toOk ? (draft.toAccountId ?? '') : (accounts.find((a) => a.id !== from)?.id ?? ''))
      setDate(draft.date)
      setNote(draft.note)
      return
    }
    const today = todayKey()
    const recent = data.transactions.slice().sort((a, b) => b.createdAt - a.createdAt)[0]
    const fallbackAccount =
      accounts.find((a) => a.id === recent?.accountId)?.id ?? accounts[0]?.id ?? ''
    const firstCat = data.categories.find((c) => c.type === mode && !c.archived)
    setType(mode)
    setAmount('')
    setCategoryId(firstCat?.id ?? '')
    setAccountId(fallbackAccount)
    setFromId(fallbackAccount)
    setToId(accounts.find((a) => a.id !== fallbackAccount)?.id ?? '')
    setDate(today)
    setNote('')
    // 仅在打开/切换记录时重置，避免输入过程中被覆盖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft, mode])

  const cents = parseAmountText(amount)
  const canSave =
    cents > 0 &&
    Boolean(accountId) &&
    (isTransfer ? Boolean(fromId) && Boolean(toId) && fromId !== toId : Boolean(categoryId))

  const switchType = (next: TxType) => {
    if (next === type) return
    setType(next)
    setNote('')
    setAmount('')
    if (next === 'transfer') {
      // 转账：账户缺省值补齐，并保证 from ≠ to
      const from = accounts.some((a) => a.id === fromId) ? fromId : (accountId || accounts[0]?.id || '')
      const to =
        accounts.some((a) => a.id === toId && a.id !== from)
          ? toId
          : (accounts.find((a) => a.id !== from)?.id ?? '')
      setFromId(from)
      setToId(to)
      return
    }
    const first = data.categories.find((c) => c.type === next && !c.archived)
    setCategoryId(first?.id ?? '')
  }

  const pressKey = (key: string) => {
    setAmount((prev) => {
      if (key === 'back') return prev.slice(0, -1)
      if (key === '.') {
        if (prev.includes('.')) return prev
        return prev ? prev + '.' : '0.'
      }
      const [int = '', dec] = prev.split('.')
      if (dec !== undefined && dec.length >= 2) return prev
      if (int.replace(/^0+/, '').length >= 8) return prev
      if (prev === '0') return key
      return prev + key
    })
  }

  /* ---------------- 快捷模板 ---------------- */

  const templates = useMemo(() => {
    const list = data.templates.filter((t) => t.type === type)
    const suggest = isTransfer
      ? []
      : suggestTemplates(data.transactions).filter(
          (s) => !data.templates.some((t) => sameTemplate(t, s)),
        )
    return [...list, ...suggest]
  }, [data.templates, data.transactions, type, isTransfer])

  const applyTemplate = (t: QuickTemplate) => {
    switchType(t.type)
    setAmount(centsToInput(t.amount))
    setCategoryId(t.categoryId)
    if (accounts.some((a) => a.id === t.accountId)) {
      setAccountId(t.accountId)
      setFromId(t.accountId)
    }
    setNote(t.note)
    toast(isSuggest(t) ? '已套用推荐，点“设为模板”可收藏' : '已套用模板')
  }

  const saveTemplate = (t: QuickTemplate) => {
    addTemplate({
      label: t.label,
      type: t.type,
      amount: t.amount,
      categoryId: t.categoryId,
      accountId: t.accountId,
      note: t.note,
    })
    toast('已设为模板')
  }

  /* ---------------- 快捷解析 ---------------- */

  const runParse = () => {
    if (isTransfer) return
    const parsed = parseQuickAdd(note, data.categories)
    if (!parsed) {
      toast('没找到金额，试试“早餐 12”')
      return
    }
    setAmount(centsToInput(parsed.amount))
    const cat = data.categories.find((c) => c.id === parsed.categoryId && c.type === type)
    if (cat) setCategoryId(cat.id)
    setNote(parsed.note)
    toast(parsed.categoryName ? `已识别：${parsed.categoryName}` : '已识别金额，请选择分类')
  }

  const onNoteKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    runParse()
  }

  /* ---------------- 保存 / 删除 ---------------- */

  const submit = () => {
    if (isTransfer) {
      if (cents <= 0) {
        toast('请先填写转账金额')
        return
      }
      if (!fromId || !toId) {
        toast('请选择转出和转入账户')
        return
      }
      if (fromId === toId) {
        toast('转出和转入不能是同一个账户')
        return
      }
      const payload = {
        type: 'transfer' as const,
        amount: cents,
        categoryId: '',
        accountId: fromId,
        toAccountId: toId,
        note: note.trim(),
        date,
      }
      if (draft) {
        updateTransaction(draft.id, payload)
        toast('已保存修改')
      } else {
        addTransaction(payload)
        toast('已转账')
      }
      onClose()
      return
    }

    if (!canSave) {
      toast('请先填写金额和分类')
      return
    }
    const payload = {
      type,
      amount: cents,
      categoryId,
      accountId,
      date,
      note: note.trim(),
    }

    // 判断这笔账是不是刚好越过预算，给一个即时提醒
    let warning: string | null = null
    if (type === 'expense') {
      const targetMonth = date.slice(0, 7)
      const others = data.transactions.filter((t) => t.id !== draft?.id)
      const totalBudget = findBudget(data.budgets, targetMonth, 'all')
      const catBudget = findBudget(data.budgets, targetMonth, categoryId)
      if (totalBudget) {
        const before = spentFor(others, targetMonth, 'all')
        const after = before + cents
        if (before <= totalBudget.amount && after > totalBudget.amount) {
          warning = `这笔之后，${targetMonth === todayKey().slice(0, 7) ? '本月' : '当月'}总预算已超支 ${yuan(
            after - totalBudget.amount,
          )}`
        }
      }
      if (!warning && catBudget) {
        const before = spentFor(others, targetMonth, categoryId)
        const after = before + cents
        if (before <= catBudget.amount && after > catBudget.amount) {
          const name = data.categories.find((c) => c.id === categoryId)?.name ?? '分类'
          warning = `${name}预算已超支 ${yuan(after - catBudget.amount)}`
        }
      }
    }

    if (draft) {
      updateTransaction(draft.id, payload)
      haptic(8)
      toast(warning ?? '已保存修改', warning ? 'warn' : 'ok')
    } else {
      addTransaction(payload)
      haptic(8)
      toast(warning ?? '已记一笔', warning ? 'warn' : 'ok')
    }
    onClose()
  }

  const remove = async () => {
    if (!draft) return
    const ok = await confirm({
      title: '删除这笔记录？',
      message: '删除后无法恢复。',
      confirmText: '删除',
      danger: true,
    })
    if (!ok) return
    deleteTransaction(draft.id)
    toast('已删除')
    onClose()
  }

  const yesterday = dateShift(1)
  const before = dateShift(2)

  const accountName = (id: string) => accountChoices.find((a) => a.id === id)?.name ?? '选择账户'

  const saveLabel = isTransfer
    ? '确认转账'
    : draft
      ? '保存修改'
      : type === 'expense'
        ? '记一笔支出'
        : '记一笔收入'

  return (
    <Sheet
      open={open}
      onClose={onClose}
      hideClose
      className="sheet--quick"
      label={draft ? '编辑记录' : '记一笔'}
    >
      <div className="quick-head">
        <div className="type-toggle">
          <button
            className={cn(type === 'expense' && 'is-active', 'type-toggle__btn', 'type-toggle__btn--expense')}
            onClick={() => switchType('expense')}
          >
            支出
          </button>
          <button
            className={cn(type === 'income' && 'is-active', 'type-toggle__btn', 'type-toggle__btn--income')}
            onClick={() => switchType('income')}
          >
            收入
          </button>
          <button
            className={cn(type === 'transfer' && 'is-active', 'type-toggle__btn', 'type-toggle__btn--transfer')}
            onClick={() => switchType('transfer')}
          >
            <Icon name="transfer" size={14} />
            转账
          </button>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="关闭">
          <Icon name="close" size={20} />
        </button>
      </div>

      <div className="quick-body">
        <div className="amount-display">
          <span className="amount-display__currency">¥</span>
          <span className={cn('amount-display__value', !amount && 'is-empty')}>
            {amount ? formatAmountInput(amount) : '0.00'}
          </span>
        </div>

        <div className="amount-note">
          <Icon name="edit" size={14} />
          <input
            ref={noteRef}
            name="note"
            aria-label="备注"
            placeholder={isTransfer ? '添加备注（可选）' : '备注，也可输入“早餐 12”后回车'}
            value={note}
            maxLength={60}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={onNoteKeyDown}
          />
          {!isTransfer && (
            <button className="quick-parse" onClick={runParse} aria-label="快速解析" title="快速解析">
              <Icon name="zap" size={15} />
            </button>
          )}
        </div>

        <div className="quick-scroll">
          {isTransfer ? (
            <div className="transfer-pick">
              {draft && draft.type === 'adjust' && (
                <p className="quick-hint">这是余额调整记录，保存后会变为转账。</p>
              )}
              <div className="transfer-pick__flow">
                <span className="transfer-pick__acc">
                  <Icon name={accountIcon(accountChoices.find((a) => a.id === fromId)?.kind ?? 'other')} size={15} />
                  {accountName(fromId)}
                </span>
                <Icon name="transfer" size={16} />
                <span className="transfer-pick__acc">
                  <Icon name={accountIcon(accountChoices.find((a) => a.id === toId)?.kind ?? 'other')} size={15} />
                  {accountName(toId)}
                </span>
              </div>

              {accounts.length < 2 ? (
                <p className="quick-hint">至少需要两个账户才能转账，请到「我的」添加账户。</p>
              ) : (
                <>
                  <div className="quick-row">
                    <span className="quick-label">从</span>
                    <div className="chips chips--nowrap">
                      {accountChoices.map((a) => (
                        <button
                          key={a.id}
                          className={cn(
                            'chip',
                            fromId === a.id && 'is-active',
                            toId === a.id && 'is-muted',
                          )}
                          onClick={() => {
                            setFromId(a.id)
                            if (toId === a.id) setToId(accounts.find((x) => x.id !== a.id)?.id ?? '')
                          }}
                        >
                          <Icon name={accountIcon(a.kind)} size={15} />
                          {a.name}
                          {a.archived && '（已归档）'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="quick-row">
                    <span className="quick-label">到</span>
                    <div className="chips chips--nowrap">
                      {accountChoices.map((a) => (
                        <button
                          key={a.id}
                          className={cn(
                            'chip',
                            toId === a.id && 'is-active',
                            fromId === a.id && 'is-muted',
                          )}
                          onClick={() => {
                            setToId(a.id)
                            if (fromId === a.id) setFromId(accounts.find((x) => x.id !== a.id)?.id ?? '')
                          }}
                        >
                          <Icon name={accountIcon(a.kind)} size={15} />
                          {a.name}
                          {a.archived && '（已归档）'}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              {type === 'expense' && templates.length > 0 && (
                <div className="quick-templates">
                  {templates.map((t) => (
                    <div key={t.id} className="quick-templates__item">
                      <button
                        className={cn('chip', 'chip--sm', 'quick-templates__chip')}
                        onClick={() => applyTemplate(t)}
                      >
                        {isSuggest(t) && <Icon name="zap" size={13} />}
                        {t.label || '常用记账'}
                        <span className="chip__value">{yuan(t.amount)}</span>
                      </button>
                      {isSuggest(t) && (
                        <button
                          className="quick-templates__save"
                          onClick={() => saveTemplate(t)}
                          aria-label="设为模板"
                          title="设为模板"
                        >
                          <Icon name="plus-circle" size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {categories.length === 0 && !archivedCategory ? (
                <p className="quick-hint">还没有可用的分类，请到「我的 → 分类管理」中添加。</p>
              ) : (
                <div className="cat-grid">
                  {archivedCategory && (
                    <button
                      className={cn('cat-pick', categoryId === archivedCategory.id && 'is-active')}
                      onClick={() => setCategoryId(archivedCategory.id)}
                      title="该分类已归档，仅这笔历史记录仍在使用"
                    >
                      <span
                        className="cat-pick__icon"
                        style={{ background: `${archivedCategory.color}1a`, color: archivedCategory.color }}
                      >
                        <Icon name={archivedCategory.icon} size={20} />
                      </span>
                      <span className="cat-pick__name">{archivedCategory.name}（已归档）</span>
                    </button>
                  )}
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      className={cn('cat-pick', categoryId === c.id && 'is-active')}
                      onClick={() => setCategoryId(c.id)}
                    >
                      <span
                        className="cat-pick__icon"
                        style={{ background: `${c.color}1a`, color: c.color }}
                      >
                        <Icon name={c.icon} size={20} />
                      </span>
                      <span className="cat-pick__name">{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="quick-meta">
            {!isTransfer && (
              <div className="quick-row">
                <span className="quick-label">账户</span>
                <div className="chips chips--nowrap">
                  {accountChoices.map((a) => (
                    <button
                      key={a.id}
                      className={cn('chip', accountId === a.id && 'is-active')}
                      onClick={() => setAccountId(a.id)}
                    >
                      <Icon name={accountIcon(a.kind)} size={15} />
                      {a.name}
                      {a.archived && '（已归档）'}
                    </button>
                  ))}
                  {accounts.length === 0 && (
                    <span className="quick-empty">还没有账户，请到「我的」添加</span>
                  )}
                </div>
              </div>
            )}

            <div className="quick-row">
              <span className="quick-label">日期</span>
              <div className="date-row">
                {[
                  { key: todayKey(), label: '今天' },
                  { key: yesterday, label: '昨天' },
                  { key: before, label: '前天' },
                ].map((d) => (
                  <button
                    key={d.key}
                    className={cn('chip chip--sm', date === d.key && 'is-active')}
                    onClick={() => setDate(d.key)}
                  >
                    {d.label}
                  </button>
                ))}
                <label className="date-field">
                  <Icon name="calendar" size={15} />
                  <input
                    type="date"
                    name="date"
                    aria-label="日期"
                    value={date}
                    onChange={(e) => e.target.value && setDate(e.target.value)}
                  />
                </label>
              </div>
            </div>
          </div>

          {draft && (
            <button className="link-danger" onClick={remove}>
              <Icon name="trash" size={16} /> 删除这笔记录
            </button>
          )}
        </div>

        <div className="keypad">
          <div className="keypad__grid">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'].map((k) => (
              <button key={k} className="key" onClick={() => pressKey(k)}>
                {k}
              </button>
            ))}
            <button className="key key--back" onClick={() => pressKey('back')} aria-label="退格">
              <Icon name="backspace" size={22} />
            </button>
          </div>
          <button className="btn btn--primary btn--block btn--tall" disabled={!canSave} onClick={submit}>
            {saveLabel}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
