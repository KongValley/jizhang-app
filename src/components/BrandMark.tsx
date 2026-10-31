/** 应用 Logo：内联 SVG，避免依赖 /favicon.svg（打包进原生壳时同样可用） */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="brandMarkGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4c6fff" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="23" fill="url(#brandMarkGradient)" />
      <g
        stroke="#fff"
        strokeWidth="8.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M30 26 L50 47 L70 26" />
        <path d="M50 47 L50 77" />
        <path d="M34 55 H66" />
        <path d="M36 65 H64" />
      </g>
    </svg>
  )
}
