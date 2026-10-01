import type { ButtonHTMLAttributes } from 'react'

export function ReportButton({
  loading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button type="button" {...props} aria-busy={loading ?? false}>
      {children}
    </button>
  )
}
