// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sheet, Dialog, UiProvider } from './ui'

// 清理与 matchMedia 桩统一在 src/test-setup.ts 中注册

function SheetHarness({ withTitle }: { withTitle: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(true)}>打开弹层</button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={withTitle ? '测试弹层' : undefined}
        hideClose={!withTitle}
        label={withTitle ? undefined : '记一笔'}
      >
        <button>内部按钮一</button>
        <input aria-label="内部输入" />
        <button>内部按钮二</button>
      </Sheet>
    </div>
  )
}

describe('Sheet 可访问性与焦点管理', () => {
  it('有标题时用 aria-labelledby 关联标题', async () => {
    render(<SheetHarness withTitle />)
    await userEvent.click(screen.getByText('打开弹层'))
    const dialog = screen.getByRole('dialog')
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(document.getElementById(labelledBy!)?.textContent).toBe('测试弹层')
  })

  it('没有可见标题时用 aria-label 提供名称（读屏不会只念「对话框」）', async () => {
    render(<SheetHarness withTitle={false} />)
    await userEvent.click(screen.getByText('打开弹层'))
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toBe('记一笔')
  })

  it('打开后焦点被移入弹层内部', async () => {
    render(<SheetHarness withTitle />)
    await userEvent.click(screen.getByText('打开弹层'))
    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('Tab 在弹层内循环，不会跑到背后的页面', async () => {
    render(<SheetHarness withTitle />)
    await userEvent.click(screen.getByText('打开弹层'))
    const dialog = screen.getByRole('dialog')

    // 连续 Tab 超过内部可聚焦元素数量，焦点应始终留在弹层内
    const focusableCount = dialog.querySelectorAll('button, input').length
    for (let i = 0; i < focusableCount + 3; i++) {
      await userEvent.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })

  it('Shift+Tab 同样不会跑出弹层', async () => {
    render(<SheetHarness withTitle />)
    await userEvent.click(screen.getByText('打开弹层'))
    const dialog = screen.getByRole('dialog')
    for (let i = 0; i < 5; i++) {
      await userEvent.tab({ shift: true })
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })

  it('关闭后焦点回到打开它的按钮', async () => {
    render(<SheetHarness withTitle />)
    const opener = screen.getByText('打开弹层')
    await userEvent.click(opener)
    const closeBtn = screen.getByRole('button', { name: '关闭' })
    await userEvent.click(closeBtn)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('Escape 可以关闭弹层', async () => {
    render(<SheetHarness withTitle />)
    await userEvent.click(screen.getByText('打开弹层'))
    expect(screen.queryByRole('dialog')).not.toBeNull()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Dialog 可访问性', () => {
  function DialogHarness() {
    const [open, setOpen] = useState(false)
    return (
      <div>
        <button onClick={() => setOpen(true)}>打开对话框</button>
        <Dialog open={open} onClose={() => setOpen(false)} title="编辑分类">
          <input aria-label="分类名称" />
          <button>保存</button>
        </Dialog>
      </div>
    )
  }

  it('用 aria-labelledby 关联标题', async () => {
    render(<DialogHarness />)
    await userEvent.click(screen.getByText('打开对话框'))
    const dialog = screen.getByRole('dialog')
    const id = dialog.getAttribute('aria-labelledby')
    expect(document.getElementById(id!)?.textContent).toBe('编辑分类')
  })

  it('焦点被限制在对话框内', async () => {
    render(<DialogHarness />)
    await userEvent.click(screen.getByText('打开对话框'))
    const dialog = screen.getByRole('dialog')
    for (let i = 0; i < 6; i++) {
      await userEvent.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })
})

describe('UiProvider 冒烟', () => {
  it('能渲染子节点', () => {
    render(
      <UiProvider>
        <span>内容</span>
      </UiProvider>,
    )
    expect(screen.getByText('内容')).toBeTruthy()
  })
})
