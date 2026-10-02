import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { OPEN_TEAM_EVENT } from '../../features/product/team-navigation.h5'
import { TeamDetailView } from './detail.h5'
import { TeamIcon } from './icons.h5'
import { useOverlayFocus } from '../overlay-focus'
import './index.h5.scss'

interface TeamTarget {
  teamId: string
  tournamentId?: string
}
export function TeamOverlayHost() {
  const [target, setTarget] = useState<TeamTarget | null>(null)
  useEffect(() => {
    const open = (event: Event) => {
      const value = (event as CustomEvent<unknown>).detail
      if (
        !value ||
        typeof value !== 'object' ||
        !('teamId' in value) ||
        typeof value.teamId !== 'string' ||
        !value.teamId ||
        value.teamId.length > 150
      )
        return
      const tournamentId =
        'tournamentId' in value && typeof value.tournamentId === 'string'
          ? value.tournamentId
          : undefined
      setTarget({ teamId: value.teamId, ...(tournamentId ? { tournamentId } : {}) })
    }
    const close = () => setTarget(null)
    const resize = () => {
      if (!window.matchMedia('(min-width: 721px)').matches) close()
    }
    window.addEventListener(OPEN_TEAM_EVENT, open)
    window.addEventListener('hashchange', close)
    window.addEventListener('popstate', close)
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener(OPEN_TEAM_EVENT, open)
      window.removeEventListener('hashchange', close)
      window.removeEventListener('popstate', close)
      window.removeEventListener('resize', resize)
    }
  }, [])
  return target ? (
    <TeamOverlay
      key={`${target.teamId}:${target.tournamentId ?? ''}`}
      target={target}
      onClose={() => setTarget(null)}
    />
  ) : null
}

function TeamOverlay({ target, onClose }: { target: TeamTarget; onClose: () => void }) {
  useOverlayFocus(true, '.th-detail-modal', onClose)
  return createPortal(
    <div
      className="th-scrim th-scrim--detail"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="th-root th-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label="球队详情"
        tabIndex={-1}
      >
        <div className="th-modal-top">
          <span>球队档案</span>
          <button
            data-team-control
            type="button"
            className="th-icon-button"
            aria-label="关闭球队详情"
            onClick={onClose}
          >
            <TeamIcon name="close" />
          </button>
        </div>
        <div className="th-detail-modal__content">
          <TeamDetailView teamId={target.teamId} tournamentId={target.tournamentId} />
        </div>
      </section>
    </div>,
    document.body,
  )
}
