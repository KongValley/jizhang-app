// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StoreProvider } from './store'
import { UiProvider } from './ui'
import { StatsPage } from './components/Stats'
import { STORAGE_KEY } from './storage'
import type { AppData, Transaction } from './types'

const MONTH = '2026-03'

function makeTx(over: Partial<Transaction> & { id: string }): Transaction {
  return {
    type: 'expense',
    amount: 10_000,
    categoryId: 'c-food',
    accountId: 'a1',
    note: '',
    date: `${MONTH}-10`,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  }
}

function seed(): AppData {
  return {
    version: 4,
    transactions: [
      makeTx({ id: 't1', amount: 30_000, note: '午餐', date: '2026-03-05' }),
      makeTx({ id: 't2', amount: 12_000, categoryId: 'c-fun', note: '电影', date: '2026-03-06' }),
      makeTx({ id: 't3', type: 'income', amount: 900_000, categoryId: 'i-salary', date: '2026-03-01' }),
    ],
    categories: [
      { id: 'c-food', name: '餐饮', icon: 'food', color: '#f97316', type: 'expense' },
      { id: 'c-fun', name: '娱乐', icon: 'game', color: '#06b6d4', type: 'expense' },
      { id: 'i-salary', name: '工资', icon: 'money', color: '#10b981', type: 'income' },
    ],
    accounts: [
      { id: 'a1', name: '现金', kind: 'cash', nature: 'asset', initialBalance: 0 },
      { id: 'a2', name: '信用卡', kind: 'credit', nature: 'liability', initialBalance: -50_000 },
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

function renderStats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seed()))
  return render(
    <StoreProvider>
      <UiProvider>
        <StatsPage month={MONTH} onMonthChange={() => {}} />
      </UiProvider>
    </StoreProvider>,
  )
}

describe('统计页拆分后的渲染（回归测试）', () => {
  beforeEach(() => localStorage.clear())

  it('默认显示收支视图且各卡片齐全', async () => {
    renderStats()
    expect(await screen.findByText('分类占比')).toBeTruthy()
    expect(screen.getByText('时段对比')).toBeTruthy()
    expect(screen.getByText('每日支出热力')).toBeTruthy()
    expect(screen.getByText('固定支出')).toBeTruthy()
    expect(screen.getByText(/年度总结/)).toBeTruthy()
  })

  it('渲染出真实支出金额', async () => {
    renderStats()
    // 分类占比里应出现娱乐分类的 120 元
    expect(await screen.findByText('娱乐')).toBeTruthy()
    expect(screen.getAllByText(/120\.00/).length).toBeGreaterThan(0)
  })

  it('能切到收入视图', async () => {
    renderStats()
    await userEvent.click(await screen.findByRole('tab', { name: '收入' }))
    // 切到收入后，分类占比卡片里应出现工资分类（用 legend 区域限定，避免与趋势图重名）
    const card = (await screen.findByText('分类占比')).closest('section')!
    expect(within(card).getByText('工资')).toBeTruthy()
    // 收入按钮变为选中态
    expect(screen.getByRole('tab', { name: '收入' })).toHaveProperty('ariaSelected', 'true')
  })

  it('能切到资产负债视图', async () => {
    renderStats()
    await userEvent.click(await screen.findByRole('tab', { name: '资产负债' }))
    // 资产负债视图独有「净资产」标签
    expect(await screen.findByText('净资产')).toBeTruthy()
    expect(screen.getByText('总资产')).toBeTruthy()
    // 收支视图的卡片应当已经卸载
    expect(screen.queryByText('分类占比')).toBeNull()
  })

  it('能切到还款视图', async () => {
    renderStats()
    await userEvent.click(await screen.findByRole('tab', { name: '还款' }))
    expect(await screen.findByText('总欠款')).toBeTruthy()
    expect(screen.queryByText('分类占比')).toBeNull()
  })

  it('切换视图后能切回收支视图（状态不丢）', async () => {
    renderStats()
    await userEvent.click(await screen.findByRole('tab', { name: '资产负债' }))
    await userEvent.click(await screen.findByRole('tab', { name: '收支' }))
    expect(await screen.findByText('分类占比')).toBeTruthy()
  })

  it('点击月度小结横幅会打开小结', async () => {
    renderStats()
    const banner = await screen.findByRole('button', { name: /小结/ })
    await userEvent.click(banner)
    // 小结弹层以 dialog 形式打开，且包含该月标题
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeTruthy()
    expect(within(dialog).getByText(/2026年3月/)).toBeTruthy()
  })

  it('空账本时不崩溃并给出空状态', async () => {
    const empty = seed()
    empty.transactions = []
    localStorage.setItem(STORAGE_KEY, JSON.stringify(empty))
    render(
      <StoreProvider>
        <UiProvider>
          <StatsPage month={MONTH} onMonthChange={() => {}} />
        </UiProvider>
      </StoreProvider>,
    )
    expect(await screen.findByText(/还没有支出记录/)).toBeTruthy()
  })
})
