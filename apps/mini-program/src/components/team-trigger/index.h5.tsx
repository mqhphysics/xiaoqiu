import { getCurrentInstance } from '@tarojs/taro'
import type { PropsWithChildren } from 'react'
import {
  HOVER_TEAM_EVENT,
  LEAVE_TEAM_EVENT,
  openDesktopTeam,
} from '../../features/product/team-navigation.h5'
import type { TeamTriggerProps } from './index'

export function TeamTrigger({
  children,
  teamId,
  name,
  tournamentId,
}: PropsWithChildren<TeamTriggerProps>) {
  const permitted = (anchor: HTMLElement) =>
    window.matchMedia('(min-width: 721px)').matches &&
    !anchor.closest('[data-team-selector], [data-team-action], .public-team-nav, .mobile-team-tab')
  const context = (anchor: HTMLElement) =>
    tournamentId ||
    anchor.closest<HTMLElement>('[data-team-tournament]')?.dataset.teamTournament ||
    new URLSearchParams(anchor.closest('a')?.getAttribute('href')?.split('?')[1]).get(
      'tournamentId',
    ) ||
    getCurrentInstance().router?.params?.tournamentId ||
    ''
  return (
    <span
      className="team-trigger"
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-label={`查看${name}球队资料`}
      onClickCapture={(event) => {
        if (!permitted(event.currentTarget)) return
        event.preventDefault()
        event.stopPropagation()
        event.nativeEvent.stopImmediatePropagation()
        openDesktopTeam(teamId, context(event.currentTarget))
      }}
      onKeyDown={(event) => {
        if (!permitted(event.currentTarget) || !['Enter', ' '].includes(event.key)) return
        event.preventDefault()
        event.stopPropagation()
        openDesktopTeam(teamId, context(event.currentTarget))
      }}
      onMouseEnter={(event) => {
        if (permitted(event.currentTarget) && window.matchMedia('(hover: hover)').matches)
          window.dispatchEvent(
            new CustomEvent(HOVER_TEAM_EVENT, {
              detail: {
                teamId,
                tournamentId: context(event.currentTarget),
                anchor: event.currentTarget,
              },
            }),
          )
      }}
      onMouseLeave={() => window.dispatchEvent(new Event(LEAVE_TEAM_EVENT))}
    >
      {children}
    </span>
  )
}
