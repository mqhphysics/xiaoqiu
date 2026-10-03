import type { PropsWithChildren } from 'react'
import { openMatch } from '../../features/product/match-navigation'

export function MatchTrigger({
  matchId,
  tournamentId = '',
  name = '比赛',
  className,
  children,
}: PropsWithChildren<{
  matchId: string
  tournamentId?: string
  name?: string
  className?: string
}>) {
  return (
    <span
      role="button"
      tabIndex={0}
      className={className}
      data-match-id={matchId}
      aria-label={`查看${name}详情`}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void openMatch(matchId, tournamentId)
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        void openMatch(matchId, tournamentId)
      }}
    >
      {children}
    </span>
  )
}
