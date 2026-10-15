import { readSession } from '../product/session'
export function competitionOrganizationKey() {
  return readSession()?.user.organizationId ?? process.env.TARO_APP_ORGANIZATION_ID ?? ''
}
export interface CompetitionSelection {
  competitionId: string
  seasonId: string
  tournamentId?: string | undefined
  competitionName: string
  seasonName: string
  isDemo: boolean
}
let selection: CompetitionSelection | null = null
let organization = ''
export function readCompetitionSelection() {
  return organization === competitionOrganizationKey() ? selection : null
}
export function publishCompetitionSelection(value: CompetitionSelection) {
  selection = value
  organization = competitionOrganizationKey()
  try {
    localStorage.setItem(
      `xiaoqiu.competition-selection.v2:${organization}`,
      JSON.stringify({ competitionId: value.competitionId, seasonId: value.seasonId }),
    )
  } catch {
    /* Current selection remains usable without persistent storage. */
  }
}
export function storedCompetitionSelection(): { competitionId?: string; seasonId?: string } {
  try {
    return JSON.parse(
      localStorage.getItem(`xiaoqiu.competition-selection.v2:${competitionOrganizationKey()}`) ??
        '{}',
    )
  } catch {
    return {}
  }
}
