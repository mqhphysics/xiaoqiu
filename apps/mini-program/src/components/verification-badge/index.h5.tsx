import { useId } from 'react'
import { VerificationBadge as ExistingBadge, type VerificationBadgeProps } from './index.tsx'
import playerIcon from '../../assets/profile-icons/shield-check.svg'
import staffIcon from '../../assets/profile-icons/calendar.svg'
import studentIcon from '../../assets/profile-icons/user-circle.svg'
import checkIcon from '../../assets/profile-icons/check.svg'
import './index.h5.scss'

const identities: Record<string, { kind: string; label: string; icon: string; checked: boolean }> =
  {
    PLAYER_CONFIRMED: { kind: 'player', label: '认证球员', icon: playerIcon, checked: false },
    STAFF_VERIFIED: { kind: 'staff', label: '认证赛事工作人员', icon: staffIcon, checked: true },
    STUDENT_VERIFIED: { kind: 'student', label: '认证学生', icon: studentIcon, checked: true },
    UNVERIFIED: { kind: 'profile', label: '普通用户', icon: studentIcon, checked: false },
    // A public player profile alone is not evidence of account verification.
    PLAYER_PROFILE: { kind: 'profile', label: '球员档案', icon: studentIcon, checked: false },
  }

export function VerificationBadge({ level, className, focusable = true }: VerificationBadgeProps) {
  const tooltipId = useId()
  const identity = identities[level ?? '']
  return (
    <>
      <ExistingBadge level={level} className={`verification-badge__native ${className ?? ''}`} />
      {identity && (
        <span
          className={`verification-badge verification-badge--${identity.kind}`}
          role="img"
          aria-label={identity.label}
          aria-describedby={tooltipId}
          tabIndex={focusable ? 0 : undefined}
          onClick={(event) => event.stopPropagation()}
        >
          <span className="verification-badge__symbol" aria-hidden="true">
            <img className="verification-badge__icon" src={identity.icon} alt="" />
            {identity.checked && (
              <img className="verification-badge__check" src={checkIcon} alt="" />
            )}
          </span>
          <span className="verification-badge__tooltip" id={tooltipId} role="tooltip">
            {identity.label}
          </span>
        </span>
      )}
    </>
  )
}
