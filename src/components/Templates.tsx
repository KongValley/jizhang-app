import { useEffect, useMemo, useState } from 'react'
import type { QuickTemplate } from '../types'
import { useStore } from '../store'
import { AmountField, EmptyState, Sheet, useUi } from '../ui'
import { Icon } from '../icons'
import { accountBalance, accountNature } from '../stats'
import { accountIcon } from '../storage'
import { cn, centsToInput, parseAmountText, signedYuan, smartYuan, yuan } from '../utils'

/* 余额校准：把某个账户的余额对齐到真实金额，生成一笔余额调整记录 */
export function ReconcileSheet({
  accountId,
  onClose,
}: {
  accountId: string | null
  onClose: () => void
}) {
  const { data, reconcileAccount } = useStore()
  const { toast } = useUi()
  const [selectedId, setSelectedId] = useState('')
  const [amount, setAmount] = useState('')

  const accounts = data.accounts.filter((a) => !a.archived)
  const account = accounts.find((a) => a.id === selectedId) ?? null
  const current = account ? accountBalance(data.transactions, account) : 0

  useEffect(() => {
    if (!accountId) return
    const target = data.accounts.find((a) => a.id === accountId)
    setSelectedId(accountId)
    setAmount(target ? centsToInput(Math.abs(accountBalance(data.transactions, target))) : '')
    // 只在打开时初始化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  const target = parseAmountText(amount)
  const signedTarget = account && accountNature(account) === 'liability' ? -target : target
  const diff = account ? signedTarget - current : 0

  const submit = () => {
    if (!account) {
      toast('请选择要校准的账户')
      return
    }
    const changed = reconcileAccount(account.id, signedTarget)
    toast(changed ? '已按真实余额校准' : '余额一致，无需调整')
    onClose()
  }

  return (
    <Sheet
      open={accountId !== null}
      onClose={onClose}
      title="余额校准"
      subtitle="账单和真实余额对不上时，用这里自动补一笔调整记录"
    >
      <div className="sheet__body">
        <div className="field">
          <span className="field__label">账户</span>
          <div className="chips chips--wrap">
            {accounts.map((a) => (
              <button
                key={a.id}
                className={cn('chip', a.id === selectedId && 'is-active')}
                onClick={() => {
                  setSelectedId(a.id)
                  setAmount(centsToInput(Math.abs(accountBalance(data.transactions, a))))
                }}
              >
                <Icon name={accountIcon(a.kind)} size={15} />
                {a.name}
              </button>
            ))}
          </div>
        </div>

        {account && (
          <div className="reconcile-summary">
            <div>
              <span>账面余额</span>
              <b className={current < 0 ? 'is-danger' : ''}>{signedYuan(current)}</b>
            </div>
            <Icon name="transfer" size={18} />
            <div>
              <span>实际余额</span>
              <b>{signedYuan(signedTarget)}</b>
            </div>
          </div>
        )}

        <div className="field">
          <span className="field__label">
            {account && accountNature(account) === 'liability' ? '实际欠款' : '实际余额'}
          </span>
          <AmountField value={amount} onChange={setAmount} placeholder="0.00" />
          {account && (
            <p className={cn('field__hint', diff !== 0 && 'is-strong')}>
              {diff === 0
                ? '余额一致，保存后不会产生记录'
                : `将生成一笔 ${diff > 0 ? '调增' : '调减'} ${smartYuan(Math.abs(diff))} 的调整记录（不计入收支）`}
            </p>
          )}
        </div>

        <button className="btn btn--primary btn--block btn--tall" onClick={submit}>
          保存校准
        </button>
      </div>
    </Sheet>
  )
}

/* 模板管理：删除模板，并展示模板内容 */
export function TemplatesSheet({
  open,
  onClose,
  templates,
}: {
  open: boolean
  onClose: () => void
  templates: QuickTemplate[]
}) {
  const { data, deleteTemplate } = useStore()
  const { toast, confirm } = useUi()
  const catMap = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories])
  const accMap = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts])

  const remove = async (template: QuickTemplate) => {
    const ok = await confirm({
      title: `删除模板「${template.label}」？`,
      message: '删除后首页不会再显示这个快捷入口。',
      confirmText: '删除',
      danger: true,
    })
    if (!ok) return
    deleteTemplate(template.id)
    toast('模板已删除')
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="快捷记账模板"
      subtitle="在首页点一下就能记一笔，也可以在「记一笔」里套用"
      className="sheet--tall"
    >
      <div className="sheet__body">
        {templates.length === 0 ? (
          <EmptyState
            icon="zap"
            title="还没有模板"
            hint="记账时点「为推荐项设为模板」，或在首页点击推荐项即可自动生成"
          />
        ) : (
          <div className="template-list">
            {templates.map((t) => {
              const cat = catMap.get(t.categoryId)
              const acc = accMap.get(t.accountId)
              return (
                <div className="template-row" key={t.id}>
                  <span
                    className="template-row__icon"
                    style={{ background: `${cat?.color ?? '#94a3b8'}1a`, color: cat?.color ?? '#94a3b8' }}
                  >
                    <Icon name={cat?.icon ?? 'box'} size={18} />
                  </span>
                  <span className="template-row__main">
                    <span className="template-row__head">
                      <b>{t.label}</b>
                      <span>
                        {t.type === 'income' ? '+' : '−'}
                        {yuan(t.amount)}
                      </span>
                    </span>
                    <span className="template-row__sub">
                      {cat?.name ?? '未分类'} · {acc?.name ?? '未知账户'}
                      {t.note ? ` · ${t.note}` : ''}
                    </span>
                  </span>
                  <button className="icon-btn icon-btn--sm" onClick={() => remove(t)} aria-label="删除模板">
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Sheet>
  )
}
