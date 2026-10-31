export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function uid(prefix = ''): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
  return prefix + rand
}

/* ---------- 日期 ---------- */

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function currentMonth(): string {
  return todayKey().slice(0, 7)
}

export function parseMonth(month: string): { y: number; m: number } {
  const [y, m] = month.split('-').map(Number)
  return { y, m }
}

export function addMonths(month: string, delta: number): string {
  const { y, m } = parseMonth(month)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

export function monthLabel(month: string): string {
  const { y, m } = parseMonth(month)
  return `${y}年${m}月`
}

export function shortMonthLabel(month: string): string {
  return `${parseMonth(month).m}月`
}

export function daysInMonth(month: string): number {
  const { y, m } = parseMonth(month)
  return new Date(y, m, 0).getDate()
}

/** YYYY-MM-DD，该月最后一天 */
export function monthEndKey(month: string): string {
  return `${month}-${pad2(daysInMonth(month))}`
}

/** 10月31日 周六 */
export function formatCalendarDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return `${m}月${d}日 周${WEEKDAYS[dt.getDay()]}`
}

/** 已过去的天数 / 剩余天数，用于“日均可用” */
export function monthProgress(month: string): { elapsed: number; total: number; left: number } {
  const total = daysInMonth(month)
  const now = currentMonth()
  if (month < now) return { elapsed: total, total, left: 0 }
  if (month > now) return { elapsed: 0, total, left: total }
  const d = new Date().getDate()
  return { elapsed: d, total, left: total - d }
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function formatDayLabel(dateKey: string): string {
  const today = todayKey()
  if (dateKey === today) return '今天'
  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (dateKey === todayKey(y)) return '昨天'
  const [yy, mm, dd] = dateKey.split('-').map(Number)
  const d = new Date(yy, mm - 1, dd)
  const wd = WEEKDAYS[d.getDay()]
  const now = new Date()
  return yy === now.getFullYear()
    ? `${mm}月${dd}日 周${wd}`
    : `${yy}年${mm}月${dd}日 周${wd}`
}

/* ---------- 金额 ---------- */

export function formatMoney(cents: number, decimals: 0 | 2 = 2): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  const yuanPart = Math.floor(abs / 100)
  const rest = abs % 100
  const int = String(yuanPart).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return decimals === 0 ? sign + int : `${sign}${int}.${String(rest).padStart(2, '0')}`
}

/** ¥1,234.50 */
export function yuan(cents: number, decimals: 0 | 2 = 2): string {
  return '¥' + formatMoney(cents, decimals)
}

/** 金额较大时省略小数，小金额保留两位 */
export function smartYuan(cents: number): string {
  return yuan(cents, Math.abs(cents) >= 100000 ? 0 : 2)
}

/** -¥1,234.00（符号在货币符号前） */
export function signedYuan(cents: number): string {
  return `${cents < 0 ? '-' : ''}¥${formatMoney(Math.abs(cents))}`
}

/** 图表用紧凑金额：¥1.2万 */
export function compactYuan(cents: number): string {
  const v = cents / 100
  if (v >= 10000) return `¥${(v / 10000).toFixed(v >= 100000 ? 0 : 1)}万`
  return '¥' + formatMoney(cents, 0)
}

/** 输入框里的金额格式化：1234.5 -> 1,234.5 */
export function formatAmountInput(text: string): string {
  if (!text) return ''
  const [intRaw, dec] = text.split('.')
  const int = (intRaw || '0').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return text.includes('.') ? `${int}.${dec ?? ''}` : int
}

export function parseAmountText(text: string): number {
  const n = Number(text.replace(/,/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export function centsToInput(cents: number): string {
  return (cents / 100)
    .toFixed(2)
    .replace(/\.?0+$/, '')
}

export function percent(value: number, total: number): number {
  if (total <= 0) return 0
  return (value / total) * 100
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/** 轻震动反馈（支持的设备上生效，iOS Safari 会静默忽略） */
export function haptic(pattern: number | number[] = 10): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* ignore */
  }
}
