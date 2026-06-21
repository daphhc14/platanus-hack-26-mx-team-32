interface AgentDotProps {
  size?: number
  pulse?: boolean
  breath?: boolean
  className?: string
  style?: React.CSSProperties
}

export function AgentDot({ size = 24, pulse = false, breath = false, className = '', style }: AgentDotProps) {
  const animClass = pulse ? 'anim-pulse' : breath ? 'anim-breath' : ''
  return (
    <div
      className={`rounded-full flex-shrink-0 ${animClass} ${className}`}
      style={{
        width: size,
        height: size,
        background: 'radial-gradient(circle, #F5E850 0%, #F2921D 100%)',
        borderRadius: '50%',
        ...style,
      }}
      aria-hidden="true"
    />
  )
}
