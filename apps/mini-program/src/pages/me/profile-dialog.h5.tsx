import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { useOverlayFocus } from '../../components/overlay-focus'
import { ProfileIcon } from './profile-icons.h5'
import './desktop-profile.h5.scss'
export function ProfileDialog({
  title,
  note,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string
  note?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useOverlayFocus(true, '.profile-dialog', onClose)
  return createPortal(
    <div
      className="profile-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className={`profile-dialog ${wide ? 'profile-dialog--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-dialog-title"
        tabIndex={-1}
      >
        <header>
          <div>
            <h2 id="profile-dialog-title">{title}</h2>
            {note && <p>{note}</p>}
          </div>
          <button data-profile-button="" aria-label="关闭弹窗" onClick={onClose}>
            <ProfileIcon name="close" />
          </button>
        </header>
        <div className="profile-dialog__body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>,
    document.body,
  )
}
