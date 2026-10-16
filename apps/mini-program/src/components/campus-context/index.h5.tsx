import { useEffect, useState, type PropsWithChildren } from 'react'
import { campusRepository, type Catalog } from '../../features/campus/campus.repository.h5'
import {
  publishCompetitionSelection,
  competitionOrganizationKey,
  storedCompetitionSelection,
  type CompetitionSelection,
} from '../../features/campus/competition-selection.h5'
export { CampusWelcome } from './welcome.h5'
import './index.h5.scss'

let catalogCache: Catalog | null = null
let catalogOrganization = ''

/** Prefer 绿茵杯男足 and a formal (non-demo) season when nothing is stored. */
function pickDefault(data: Catalog, stored: { competitionId?: string; seasonId?: string }) {
  const competition =
    data.competitions.find((c) => c.id === stored.competitionId) ??
    data.competitions.find((c) => c.code === 'GREEN_MEN') ??
    data.competitions.find((c) => /绿茵杯/.test(c.name) && /男/.test(c.name)) ??
    data.competitions.find((c) => /绿茵杯/.test(c.name)) ??
    data.competitions[0]
  const season =
    data.seasons.find((s) => s.id === stored.seasonId) ??
    data.seasons.find((s) => !s.isDemo) ??
    data.seasons.find((s) => s.isDemo) ??
    data.seasons[0]
  return { competition, season }
}

export function CampusContext({ active, children }: PropsWithChildren<{ active: string }>) {
  const organization = competitionOrganizationKey()
  const [catalog, setCatalog] = useState<Catalog | null>(
    catalogOrganization === organization ? catalogCache : null,
  )
  const [selection, setSelection] = useState<CompetitionSelection | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let current = true
    setError('')
    setSelection(null)
    setCatalog(catalogOrganization === organization ? catalogCache : null)
    campusRepository
      .catalog()
      .then((data) => {
        if (!current) return
        catalogCache = data
        catalogOrganization = organization
        setCatalog(data)
        const { competition, season } = pickDefault(data, storedCompetitionSelection())
        if (competition && season) {
          const instance = data.tournaments.find(
            (t) => t.competitionDefinitionId === competition.id && t.seasonId === season.id,
          )
          const value = {
            competitionId: competition.id,
            seasonId: season.id,
            tournamentId: instance?.id,
            competitionName: competition.name,
            seasonName: season.name,
            isDemo: season.isDemo,
          }
          publishCompetitionSelection(value)
          setSelection(value)
        }
      })
      .catch((issue) => {
        if (current) setError(issue instanceof Error ? issue.message : '赛事目录读取失败')
      })
    return () => {
      current = false
    }
  }, [revision, organization])

  const scoped = ['home', 'schedule', 'data', 'team', 'tournaments', 'teams'].includes(active)
  const empty = selection && !selection.tournamentId

  return (
    <>
      {scoped && (error || !catalog || !selection || empty) ? (
        <section className="campus-context-empty" role="status">
          <span className="campus-context-empty__eyebrow">
            {selection ? `${selection.competitionName} · ${selection.seasonName}` : '校园赛事'}
          </span>
          <h2>
            {error ? '暂时无法读取赛事目录' : !selection ? '正在准备赛事…' : '这个赛季，等待开场'}
          </h2>
          <p>
            {error ||
              (!selection
                ? '正在连接赛事目录。'
                : '当前还没有公布参赛名单和赛程。赛季切换由赛事方在管理端配置。')}
          </p>
          {error && (
            <button
              data-campus-button
              type="button"
              onClick={() => {
                setError('')
                setRevision((n) => n + 1)
              }}
            >
              重新读取
            </button>
          )}
        </section>
      ) : (
        children
      )}
    </>
  )
}
