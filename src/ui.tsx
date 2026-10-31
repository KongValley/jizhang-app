import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { addMonths, clamp, cn, currentMonth, monthLabel } from './utils'
import { Icon, type IconName } from './icons'

/* ------------------------------------------------------------------ */
/* Toast + Confirm                                                     */
/* ------------------------------------------------------------------ */

export interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

interface UiValue {
  toast: (message: string, tone?: 'ok' | 'warn') => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const UiContext = createContext<UiValue | null>(null)

export function UiProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{ id: number; text: string; tone: 'ok' | 'warn' } | null>(
    null,
  )
  const [ask, setAsk] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const toast = useCallback((text: string, tone: 'ok' | 'warn' = 'ok') => {
    setMessage({ id: Date.now(), text, tone })
  }, [])

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
      setAsk(options)
    })
  }, [])

  const settle = (value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setAsk(null)
  }

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 2200)
    return () => clearTimeout(timer)
  }, [message])

  return (
    <UiContext.Provider value={{ toast, confirm }}>
      {children}
      {message &&
        createPortal(
          <div
            className={cn('toast', message.tone === 'warn' && 'toast--warn')}
            key={message.id}
            role="status"
          >
            <Icon
              name={message.tone === 'warn' ? 'alert' : 'check'}
              size={17}
              strokeWidth={2.2}
            />
            <span>{message.text}</span>
          </div>,
          document.body,
        )}
      {ask &&
        createPortal(
          <div className="overlay overlay--center" onClick={() => settle(false)}>
            <div
              className="dialog"
              role="alertdialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="dialog__title">{ask.title}</h3>
              {ask.message && <p className="dialog__message">{ask.message}</p>}
              <div className="dialog__actions">
                <button className="btn btn--ghost" onClick={() => settle(false)}>
                  {ask.cancelText ?? '取消'}
                </button>
                <button
                  className={cn('btn', ask.danger ? 'btn--danger' : 'btn--primary')}
                  onClick={() => settle(true)}
                  autoFocus
                >
                  {ask.confirmText ?? '确定'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </UiContext.Provider>
  )
}

export function useUi(): UiValue {
  const ctx = useContext(UiContext)
  if (!ctx) throw new Error('useUi 必须在 UiProvider 内使用')
  return ctx
}

/* ------------------------------------------------------------------ */
/* 弹层基座                                                             */
/* ------------------------------------------------------------------ */

let scrollLocks = 0
function lockScroll() {
  scrollLocks += 1
  document.body.style.overflow = 'hidden'
}
function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1)
  if (scrollLocks === 0) document.body.style.overflow = ''
}

function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    lockScroll()
    return unlockScroll
  }, [active])
}

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  className?: string
  top?: boolean
  hideClose?: boolean
}

export function Sheet({ open, onClose, title, subtitle, children, className, top, hideClose }: SheetProps) {
  useScrollLock(open)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className={cn('overlay', top && 'overlay--top')} onClick={onClose}>
      <div
        className={cn('sheet', className)}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet__grabber" />
        {(title || !hideClose) && (
          <div className="sheet__head">
            <div>
              {title && <h2 className="sheet__title">{title}</h2>}
              {subtitle && <p className="sheet__subtitle">{subtitle}</p>}
            </div>
            {!hideClose && (
              <button className="icon-btn" onClick={onClose} aria-label="关闭">
                <Icon name="close" size={20} />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}

interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  top?: boolean
}

export function Dialog({ open, onClose, title, children, footer, top }: DialogProps) {
  useScrollLock(open)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className={cn('overlay', 'overlay--center', top && 'overlay--top')} onClick={onClose}>
      <div className="dialog dialog--form" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__head">
          <h3 className="dialog__title">{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="dialog__body">{children}</div>
        {footer && <div className="dialog__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ */
/* 小部件                                                               */
/* ------------------------------------------------------------------ */

export function MonthSwitcher({
  month,
  onChange,
  className,
}: {
  month: string
  onChange: (month: string) => void
  className?: string
}) {
  const now = currentMonth()
  const canNext = month < now
  return (
    <div className={cn('month-nav', className)}>
      <button
        className="month-nav__btn"
        onClick={() => onChange(addMonths(month, -1))}
        aria-label="上个月"
      >
        <Icon name="left" size={17} />
      </button>
      <span className="month-nav__label">{monthLabel(month)}</span>
      <button
        className="month-nav__btn"
        onClick={() => onChange(addMonths(month, 1))}
        disabled={!canNext}
        aria-label="下个月"
      >
        <Icon name="right" size={17} />
      </button>
      {month !== now && (
        <button className="month-nav__reset" onClick={() => onChange(now)}>
          本月
        </button>
      )}
    </div>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: string
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: SegmentOption<T>[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cn('segmented', className)} role="tablist">
      {options.map((opt) => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={value === opt.value}
          className={cn('segmented__item', value === opt.value && 'is-active')}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function ProgressBar({
  value,
  danger,
  color,
  className,
}: {
  /** 0 - 100 */
  value: number
  danger?: boolean
  color?: string
  className?: string
}) {
  const width = clamp(value, 0, 100)
  return (
    <div className={cn('progress', danger && 'progress--danger', className)}>
      <i style={{ width: `${width}%`, background: danger ? undefined : color }} />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
  onAction,
}: {
  icon: IconName
  title: string
  hint?: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden="true">
        <Icon name={icon} size={30} />
      </div>
      <p className="empty__title">{title}</p>
      {hint && <p className="empty__hint">{hint}</p>}
      {action && onAction && (
        <button className="btn btn--soft" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  )
}

/** 金额输入（带 ¥ 前缀） */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cn('switch', checked && 'is-on')}
      onClick={() => onChange(!checked)}
    >
      <i />
    </button>
  )
}

export function AmountField({
  value,
  onChange,
  placeholder = '0.00',
  autoFocus,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <label className="amount-field">
      <span>¥</span>
      <input
        inputMode="decimal"
        name="amount"
        aria-label="金额"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => {
          const next = e.target.value.replace(/[^\d.]/g, '')
          if (/^\d*\.?\d{0,2}$/.test(next)) onChange(next)
        }}
      />
    </label>
  )
}
