/** 分组标题图标（替代 📁 / 📄，随主题着色） */
export type GroupIconVariant = 'folder' | 'loose'

type Props = {
  variant: GroupIconVariant
  className?: string
}

export function GroupIcon({ variant, className = '' }: Props) {
  const cls = `group-icon group-icon--${variant}${className ? ` ${className}` : ''}`
  if (variant === 'loose') {
    return (
      <span className={cls} aria-hidden>
        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M3 3.5h10M3 7h10M3 10.5H9.5"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
          <circle cx="12.5" cy="10.5" r="1.25" fill="currentColor" opacity="0.55" />
        </svg>
      </span>
    )
  }
  return (
    <span className={cls} aria-hidden>
      <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M2.25 6.25c0-.69.56-1.25 1.25-1.25h2.1l1.05 1.35h6.35c.69 0 1.25.56 1.25 1.25v4.75c0 .69-.56 1.25-1.25 1.25H3.5c-.69 0-1.25-.56-1.25-1.25V6.25Z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M3.5 5h2.35L7 6.35H12.5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}
