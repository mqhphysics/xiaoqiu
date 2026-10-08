import { createPortal } from 'react-dom'
import { useId, type ReactNode } from 'react'
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
  const dialogId = `profile-dialog-${useId().replaceAll(':', '')}`
  const titleId = `${dialogId}-title`
  useOverlayFocus(true, `#${dialogId}`, onClose)
  return createPortal(
    <div
      className="profile-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        id={dialogId}
        className={`profile-dialog ${wide ? 'profile-dialog--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header>
          <div>
            <h2 id={titleId}>{title}</h2>
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
