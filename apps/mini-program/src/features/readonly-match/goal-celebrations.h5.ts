import fifa from '../../assets/match-media/fifa-celebration.gif'
import lfc from '../../assets/match-media/lfc-celebration.gif'
import mufc from '../../assets/match-media/mufc-goal.gif'
import muller from '../../assets/match-media/muller-goal.gif'
import { celebrationIndex, isGoalEventType } from './match-bulletin.logic.ts'

/** Freely-licensed celebration GIFs attached to published goal events. */
export const GOAL_CELEBRATION_GIFS = [muller, fifa, mufc, lfc] as const

export { isGoalEventType }

export function goalCelebrationSrc(eventId: string): string {
  return GOAL_CELEBRATION_GIFS[celebrationIndex(eventId, GOAL_CELEBRATION_GIFS.length)]!
}
