import type { ReactNode } from 'react'

interface GlassCardProps {
  children: ReactNode
  className?: string
  strong?: boolean
  style?: React.CSSProperties
}

export function GlassCard({ children, className = '', strong = false, style }: GlassCardProps) {
  return (
    <div
      className={`${strong ? 'glass-strong' : 'glass'} ${className}`}
      style={style}
    >
      {children}
    </div>
  )
}
