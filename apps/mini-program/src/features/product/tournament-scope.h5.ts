import {
  readCompetitionSelection,
  publishCompetitionSelection,
  storedCompetitionSelection,
  competitionOrganizationKey,
} from '../campus/competition-selection.h5'
import { campusRepository } from '../campus/campus.repository.h5'
const preparations = new Map<string, Promise<void>>()
export async function prepareCompetitionSelection(path: string) {
  if (!/^\/public\/(?:home|search|tournaments)(?:\?|$)/.test(path) || readCompetitionSelection())
    return
  const organization = competitionOrganizationKey()
  let preparation = preparations.get(organization)
  if (!preparation) {
    preparation = campusRepository
      .catalog()
      .then((catalog) => {
        if (competitionOrganizationKey() !== organization) return
        const stored = storedCompetitionSelection()
        const competition =
          catalog.competitions.find((c) => c.id === stored.competitionId) ??
          catalog.competitions.find((c) => c.code === 'GREEN_MEN') ??
          catalog.competitions[0]
        const season =
          catalog.seasons.find((s) => s.id === stored.seasonId) ??
          catalog.seasons.find((s) => !s.isDemo) ??
          catalog.seasons.find((s) => s.isDemo) ??
          catalog.seasons[0]
        if (!competition || !season) throw new Error('赛事目录尚未配置，请联系管理员')
        const tournament = catalog.tournaments.find(
          (t) => t.competitionDefinitionId === competition.id && t.seasonId === season.id,
        )
        publishCompetitionSelection({
          competitionId: competition.id,
          seasonId: season.id,
          tournamentId: tournament?.id,
          competitionName: competition.name,
          seasonName: season.name,
          isDemo: season.isDemo,
        })
      })
      .finally(() => {
        preparations.delete(organization)
      })
    preparations.set(organization, preparation)
  }
  await preparation
}
export function scopeProductPath(path: string): string {
  const selection = readCompetitionSelection()
  if (!selection) return path
  const [pathname, query = ''] = path.split('?')
  if (!['/public/home', '/public/search', '/public/tournaments'].includes(pathname ?? ''))
    return path
  const params = new URLSearchParams(query)
  if (params.has('tournamentId')) return path
  if (selection.tournamentId && pathname !== '/public/tournaments')
    params.set('tournamentId', selection.tournamentId)
  if (pathname === '/public/tournaments' || !selection.tournamentId) {
    params.set('competitionId', selection.competitionId)
    params.set('seasonId', selection.seasonId)
  }
  return `${pathname}?${params}`
}
