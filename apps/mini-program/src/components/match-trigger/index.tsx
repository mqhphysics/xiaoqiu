import { View } from '@tarojs/components'
import type { PropsWithChildren } from 'react'
import { openMatch } from '../../features/product/match-navigation'

export function MatchTrigger({
  matchId,
  tournamentId = '',
  className = '',
  children,
}: PropsWithChildren<{
  matchId: string
  tournamentId?: string
  name?: string
  className?: string
}>) {
  return (
    <View
      className={className}
      onClick={(event) => {
        event.stopPropagation()
        void openMatch(matchId, tournamentId)
      }}
    >
      {children}
    </View>
  )
}
