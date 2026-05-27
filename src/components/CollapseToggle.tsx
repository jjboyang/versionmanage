type Props = {
  collapsed: boolean
  onToggle: () => void
  /** compact：仅箭头，适合侧栏窄行 */
  variant?: 'default' | 'compact'
  className?: string
}

export function CollapseToggle({
  collapsed,
  onToggle,
  variant = 'default',
  className = '',
}: Props) {
  const label = collapsed ? '展开' : '收起'
  return (
    <button
      type="button"
      className={`section-collapse-toggle section-collapse-toggle--${variant}${className ? ` ${className}` : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      aria-expanded={!collapsed}
      aria-label={label}
      title={label}
    >
      <span className="section-collapse-toggle__chevron" aria-hidden>
        {collapsed ? '▶' : '▼'}
      </span>
      {variant === 'default' && (
        <span className="section-collapse-toggle__label">{label}</span>
      )}
    </button>
  )
}
