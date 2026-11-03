// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StoreProvider } from './store'
import { UiProvider } from './ui'
import { QuickAdd } from './components/QuickAdd'
import { STORAGE_KEY } from './storage'
import type { AppData, Transaction } from './types'

afterEach(cleanup)

/** 构造一份含「已归档分类 / 已归档账户」历史账单的数据 */
function seedArchivedData(current: Transaction): AppData {
  return {
    version: 4,
    transactions: [current],
    categories: [
      { id: 'c-active', name: '餐饮', icon: 'food', color: '#f97316', type: 'expense' },
      // 这笔历史账单用的分类后来被归档了
      { id: 'c-old', name: '旧分类', icon: 'box', color: '#999999', type: 'expense', archived: true },
      { id: 'i-salary', name: '工资', icon: 'money', color: '#10b981', type: 'income' },
    ],
    accounts: [
      { id: 'a-active', name: '现金', kind: 'cash', nature: 'asset', initialBalance: 0 },
      // 这笔历史账单用的账户后来被归档了
      { id: 'a-old', name: '旧账户', kind: 'bank', nature: 'asset', initialBalance: 0, archived: true },
    ],
    budgets: [],
    recurring: [],
    recurringDues: [],
    templates: [],
    debts: [],
    settings: { theme: 'light', budgetReminder: true, overspendAlert: true, seenBadges: [] },
    updatedAt: 1,
  }
}

function renderQuickAdd(draft: Transaction) {
  const data = seedArchivedData(draft)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  return render(
    <StoreProvider>
      <UiProvider>
        <QuickAdd open draft={draft} mode="expense" onClose={() => {}} />
      </UiProvider>
    </StoreProvider>,
  )
}

const historicalTx: Transaction = {
  id: 't-old',
  type: 'expense',
  amount: 12_345,
  categoryId: 'c-old',
  accountId: 'a-old',
  note: '历史账单',
  date: '2026-01-15',
  createdAt: 1,
  updatedAt: 1,
}

describe('编辑历史账单时保留已归档的分类与账户（回归测试）', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('不把已归档分类替换成第一个可用分类', async () => {
    renderQuickAdd(historicalTx)
    // 已归档分类应当仍然显示，并处于选中状态
    const archivedCat = await screen.findByText('旧分类（已归档）')
    expect(archivedCat).toBeTruthy()
    const catBtn = archivedCat.closest('button')
    expect(catBtn?.className).toContain('is-active')
  })

  it('不把已归档账户替换成第一个可用账户', async () => {
    renderQuickAdd(historicalTx)
    const archivedAcc = await screen.findByText('旧账户（已归档）')
    expect(archivedAcc).toBeTruthy()
    const accBtn = archivedAcc.closest('button')
    expect(accBtn?.className).toContain('is-active')
  })

  it('金额仍然正确回填（没被重置）', async () => {
    renderQuickAdd(historicalTx)
    expect(await screen.findByText('123.45')).toBeTruthy()
  })

  it('备注仍然正确回填', async () => {
    renderQuickAdd(historicalTx)
    const note = (await screen.findByLabelText('备注')) as HTMLInputElement
    expect(note.value).toBe('历史账单')
  })

  it('正常分类的历史账单也保持选中（没有回归）', async () => {
    const normalTx: Transaction = {
      ...historicalTx,
      categoryId: 'c-active',
      accountId: 'a-active',
    }
    renderQuickAdd(normalTx)
    const activeCat = await screen.findByText('餐饮')
    expect(activeCat.closest('button')?.className).toContain('is-active')
  })

  it('保存时提交的仍是原来的分类与账户（不会静默改写数据）', async () => {
    const onClose = vi.fn()
    const data = seedArchivedData(historicalTx)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))

    render(
      <StoreProvider>
        <UiProvider>
          <QuickAdd open draft={historicalTx} mode="expense" onClose={onClose} />
        </UiProvider>
      </StoreProvider>,
    )

    // 找到保存按钮并点击（只改备注，不改分类/账户）
    const note = (await screen.findByLabelText('备注')) as HTMLInputElement
    await userEvent.clear(note)
    await userEvent.type(note, '改个备注')
    const saveBtn = screen.getByRole('button', { name: /保存/ })
    await userEvent.click(saveBtn)

    // 等防抖落盘
    await new Promise((r) => setTimeout(r, 600))

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppData
    const updated = saved.transactions.find((t) => t.id === historicalTx.id)!
    expect(updated.note).toBe('改个备注')
    // 关键断言：分类与账户没有被改成「第一个可用项」
    expect(updated.categoryId).toBe('c-old')
    expect(updated.accountId).toBe('a-old')
  })
})
