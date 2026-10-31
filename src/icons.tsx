import type { ReactNode, SVGProps } from 'react'
import type { IconName } from './icon-set'

export type { IconName }

const PATHS: Record<IconName, ReactNode> = {
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </>
  ),
  chart: <path d="M4 20V11M10 20V5M16 20v-6M22 20H2" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  left: <path d="M14.5 5.5L8 12l6.5 6.5" />,
  right: <path d="M9.5 5.5L16 12l-6.5 6.5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  trash: (
    <>
      <path d="M4 7h16M9 7V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8V7" />
      <path d="M6.5 7l.8 12.2A2 2 0 0 0 9.3 21h5.4a2 2 0 0 0 2-1.8L17.5 7" />
      <path d="M10.5 11v6M13.5 11v6" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5 10-11" />,
  download: (
    <>
      <path d="M12 3v12m0 0l4.2-4.2M12 15l-4.2-4.2" />
      <path d="M4 17v1.5A2.5 2.5 0 0 0 6.5 21h11A2.5 2.5 0 0 0 20 18.5V17" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V3m0 0L7.8 7.2M12 3l4.2 4.2" />
      <path d="M4 17v1.5A2.5 2.5 0 0 0 6.5 21h11A2.5 2.5 0 0 0 20 18.5V17" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4l10.5-10.5a2.6 2.6 0 0 0-3.7-3.7L4.3 16.3 4 20z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  archive: (
    <>
      <rect x="3.5" y="4" width="17" height="4.5" rx="1.5" />
      <path d="M5 8.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5" />
      <path d="M10 12.5h4" />
    </>
  ),
  restore: (
    <>
      <path d="M3.5 5v5.5H9" />
      <path d="M4.2 10.5a8.5 8.5 0 1 1 .4 4" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5L21 20H3L12 3.5z" />
      <path d="M12 10v4.5M12 17.5h.01" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7.5 3v5.5c0 4.6-3.1 7.8-7.5 9.5-4.4-1.7-7.5-4.9-7.5-9.5V6L12 3z" />
      <path d="M9 11.5l2 2 4-4" />
    </>
  ),
  'chevron-right': <path d="M9.5 5.5L16 12l-6.5 6.5" />,
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="14" rx="3.2" />
      <path d="M3 10.5h18" />
      <circle cx="17" cy="15.5" r="1.1" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M18.5 16.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  backspace: (
    <>
      <path d="M9 5h9.5A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5H9l-6-6 6-8z" />
      <path d="M12 9.5l5 5M17 9.5l-5 5" />
    </>
  ),
  save: (
    <>
      <path d="M5 3.5h10.8L20.5 8v12.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" />
      <path d="M8 3.5V10h7.5V3.5M7.5 21v-6h9v6" />
    </>
  ),
  ellipsis: <path d="M5.5 12h.01M12 12h.01M18.5 12h.01" />,
  transfer: (
    <>
      <path d="M4 8.5h14M14.5 4.5 18.5 8.5l-4 4" />
      <path d="M20 15.5H6M9.5 11.5l-4 4 4 4" />
    </>
  ),
  repeat: (
    <>
      <path d="M4 11.5V10a3.5 3.5 0 0 1 3.5-3.5H19" />
      <path d="M15.5 3 19 6.5 15.5 10" />
      <path d="M20 12.5V14a3.5 3.5 0 0 1-3.5 3.5H5" />
      <path d="M8.5 14 5 17.5 8.5 21" />
    </>
  ),
  'plus-circle': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  'minus-circle': (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12h7" />
    </>
  ),
  flame: (
    <path d="M12 21c3.6 0 6.5-2.6 6.5-6 0-2.4-1.3-4.2-2.6-5.6C14.6 8 14 6.4 14 4.5c0-.6-.5-1-1-.8C9.4 5 8 8 8 10c-.8-.4-1.4-1.1-1.8-2-.2-.5-.9-.5-1.1 0A7.7 7.7 0 0 0 5.5 15c0 3.4 2.9 6 6.5 6Z" />
  ),
  'trending-up': (
    <>
      <path d="M3.5 16.5 9.5 10.5l4 4 7-7" />
      <path d="M15.5 7.5h5.5v5.5" />
    </>
  ),
  'trending-down': (
    <>
      <path d="M3.5 7.5 9.5 13.5l4-4 7 7" />
      <path d="M15.5 16.5h5.5V11" />
    </>
  ),
  zap: <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12l1-8Z" />,
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.6" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 1 0-12 0c0 4.2-1.5 5.5-2 6.5h16c-.5-1-2-2.3-2-6.5Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>
  ),
  food: (
    <>
      <path d="M4 11.5h16c0 4.5-3.6 7.5-8 7.5s-8-3-8-7.5Z" />
      <path d="M9 8c0-1 .9-1.2.9-2.2M13.6 8c0-1 .9-1.2.9-2.2" />
      <path d="M8 21h8" />
    </>
  ),
  coffee: (
    <>
      <path d="M5 9h11v6.5A4.5 4.5 0 0 1 11.5 20h-2A4.5 4.5 0 0 1 5 15.5Z" />
      <path d="M16 10h1.4a2.3 2.3 0 0 1 0 4.6H16" />
      <path d="M4 22h13" />
    </>
  ),
  shopping: (
    <>
      <path d="M5.5 8.5h13l-1 11.5h-11z" />
      <path d="M9 8.5V6.8a3 3 0 0 1 6 0v1.7" />
    </>
  ),
  home: (
    <path d="M4 10.3 12 4l8 6.3V20a1.5 1.5 0 0 1-1.5 1.5H14v-5.8h-4v5.8H5.5A1.5 1.5 0 0 1 4 20Z" />
  ),
  bus: (
    <>
      <rect x="4" y="4.5" width="16" height="12.5" rx="3" />
      <path d="M4 11h16M8.5 7.5h7" />
      <circle cx="8" cy="19" r="1.5" />
      <circle cx="16" cy="19" r="1.5" />
    </>
  ),
  plane: (
    <>
      <path d="M21 3 3 10.5l7 2.5 2.5 7L21 3Z" />
      <path d="M10 13l4-4" />
    </>
  ),
  game: (
    <>
      <rect x="2.8" y="7.5" width="18.4" height="9" rx="4.5" />
      <path d="M7.5 10.8v2.4M6.3 12h2.4" />
      <circle cx="15.8" cy="11" r=".9" />
      <circle cx="17.6" cy="13.2" r=".9" />
    </>
  ),
  movie: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10.3 9.2 15 12l-4.7 2.8z" />
    </>
  ),
  music: (
    <>
      <path d="M9 17.5V6.2l9.5-2v11.3" />
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="16" cy="15.5" r="2.5" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z" />
      <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" />
    </>
  ),
  health: (
    <path d="M12 20.5S4.5 16 4.5 10.5a4 4 0 0 1 7.5-2 4 4 0 0 1 7.5 2C19.5 16 12 20.5 12 20.5Z" />
  ),
  fitness: <path d="M6.5 8.5v7M3.5 10v4M17.5 8.5v7M20.5 10v4M6.5 12h11" />,
  pet: (
    <>
      <circle cx="7" cy="8" r="1.8" />
      <circle cx="12" cy="6.5" r="1.8" />
      <circle cx="17" cy="8" r="1.8" />
      <path d="M12 11c-3.2 0-5.5 2.6-5.5 5 0 1.9 1.5 2.9 3 2.4 1-.3 1.6-.9 2.5-.9s1.5.6 2.5.9c1.5.5 3-.5 3-2.4 0-2.4-2.3-5-5.5-5Z" />
    </>
  ),
  gift: (
    <>
      <rect x="3.5" y="8" width="17" height="4" rx="1" />
      <path d="M5.5 12v8.5h13V12" />
      <path d="M12 8v12.5" />
      <path d="M12 8S10.6 3.5 8 4.4 9.4 8 12 8ZM12 8s1.4-4.5 4-3.6S14.6 8 12 8Z" />
    </>
  ),
  redpacket: (
    <>
      <rect x="6" y="3.5" width="12" height="17" rx="2.2" />
      <path d="M6 9h12" />
      <circle cx="12" cy="13.5" r="2.2" />
      <path d="M12 15.7v2" />
    </>
  ),
  money: (
    <>
      <rect x="2.8" y="6" width="18.4" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6.2 9.5h.01M17.8 14.5h.01" />
    </>
  ),
  award: (
    <>
      <circle cx="12" cy="9" r="5" />
      <path d="M8.4 13.3 6.8 21l5.2-2.6L17.2 21l-1.6-7.7" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M8.5 7V5.6A1.6 1.6 0 0 1 10.1 4h3.8a1.6 1.6 0 0 1 1.6 1.6V7M3 12.2h18" />
      <path d="M10.5 12.2v2h3v-2" />
    </>
  ),
  invest: (
    <>
      <path d="M3.5 17 9.5 11l3.5 3.5 7.5-7.5" />
      <path d="M15 7h5.5v5.5" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </>
  ),
  computer: (
    <>
      <rect x="4" y="5" width="16" height="10.5" rx="2" />
      <path d="M2.5 19h19" />
    </>
  ),
  bulb: (
    <>
      <path d="M8.5 15.5A6 6 0 1 1 15.5 15.5c-.7.6-1 1.5-1 2.5h-5c0-1-.3-1.9-1-2.5Z" />
      <path d="M9.8 21h4.4" />
    </>
  ),
  building: (
    <>
      <rect x="5" y="3.5" width="14" height="17.5" rx="2" />
      <path d="M9 7.5h.01M12 7.5h.01M15 7.5h.01M9 11h.01M12 11h.01M15 11h.01M10.5 21v-4.5h3V21" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3.5h12v17.2l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4Z" />
      <path d="M9 8h6M9 11.8h6M9 15.6h4" />
    </>
  ),
  tool: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  ),
  plant: (
    <>
      <path d="M4.5 19.5C4.5 11 9.5 5 19 4c.6 8-4.4 14.5-11.5 14.5H4.5Z" />
      <path d="M5 19c1.5-4.5 4-7.5 8-9.5" />
    </>
  ),
  box: (
    <>
      <path d="M3.5 8 12 3.5 20.5 8 12 12.5Z" />
      <path d="M3.5 8v8.2L12 20.5l8.5-4.3V8M12 12.5v8" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 12.2V5.8a2.3 2.3 0 0 1 2.3-2.3h6.4l8.1 8.1a2.3 2.3 0 0 1 0 3.3l-5.6 5.6a2.3 2.3 0 0 1-3.3 0Z" />
      <circle cx="7.8" cy="7.8" r="1.3" />
    </>
  ),
  chat: (
    <>
      <path d="M20.5 11.5a7.5 7.5 0 0 1-7.5 7.5H8.2L3.5 21.3l1.1-4.4A7.5 7.5 0 1 1 20.5 11.5Z" />
      <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" />
    </>
  ),
  bank: (
    <>
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M5.5 9.5V19M9.8 9.5V19M14.2 9.5V19M18.5 9.5V19" />
      <path d="M3 21h18" />
    </>
  ),
  'credit-card': (
    <>
      <rect x="2.8" y="5.5" width="18.4" height="13" rx="2.5" />
      <path d="M2.8 9.8h18.4" />
      <path d="M6.5 15h3" />
    </>
  ),
  folder: (
    <path d="M3.5 7.2A2.2 2.2 0 0 1 5.7 5h4.1l2.1 2.4h6.4a2.2 2.2 0 0 1 2.2 2.2v8.2a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2Z" />
  ),
}

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
  strokeWidth?: number
}

export function Icon({ name, size = 22, strokeWidth = 1.8, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}
