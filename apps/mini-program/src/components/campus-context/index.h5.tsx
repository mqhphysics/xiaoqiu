import Taro from '@tarojs/taro'
import { useEffect, useState, type PropsWithChildren } from 'react'
import { campusRepository, type Catalog } from '../../features/campus/campus.repository.h5'
import {
  publishCompetitionSelection,
  competitionOrganizationKey,
  storedCompetitionSelection,
  type CompetitionSelection,
} from '../../features/campus/competition-selection.h5'
import { resetProductGetCache } from '../../features/product/get-cache'
export { CampusWelcome } from './welcome.h5'
import './index.h5.scss'

let catalogCache: Catalog | null = null
let catalogOrganization = ''
export function CampusContext({ active, children }: PropsWithChildren<{ active: string }>) {
  const organization = competitionOrganizationKey()
  const [catalog, setCatalog] = useState<Catalog | null>(
      catalogOrganization === organization ? catalogCache : null,
    ),
    [selection, setSelection] = useState<CompetitionSelection | null>(null),
    [error, setError] = useState('')
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
        const stored = storedCompetitionSelection()
        const competition =
          data.competitions.find((c) => c.id === stored.competitionId) ??
          data.competitions.find((c) => c.code === 'GREEN_MEN') ??
          data.competitions[0]
        const season =
          data.seasons.find((s) => s.id === stored.seasonId) ??
          data.seasons.find((s) => s.isDemo) ??
          data.seasons[0]
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
  function change(competitionId: string, seasonId: string) {
    const competition = catalog?.competitions.find((c) => c.id === competitionId),
      season = catalog?.seasons.find((s) => s.id === seasonId)
    if (!competition || !season) return
    const instance = catalog?.tournaments.find(
      (t) => t.competitionDefinitionId === competition.id && t.seasonId === season.id,
    )
    const value = {
      competitionId,
      seasonId,
      tournamentId: instance?.id,
      competitionName: competition.name,
      seasonName: season.name,
      isDemo: season.isDemo,
    }
    publishCompetitionSelection(value)
    setSelection(value)
    resetProductGetCache()
    const pages: Record<string, string> = {
      schedule: '/pages/readonly-schedule/index',
      data: '/pages/data-center/index',
      team: '/pages/readonly-teams/index',
      teams: '/pages/readonly-teams/index',
      tournaments: '/pages/readonly-tournaments/index',
    }
    void Taro.reLaunch({ url: pages[active] ?? '/pages/index/index' })
  }
  const scoped = ['home', 'schedule', 'data', 'team', 'tournaments', 'teams'].includes(active)
  const empty = selection && !selection.tournamentId
  return (
    <>
      {active !== 'me' && (
        <div className="campus-context" aria-label="赛事与赛季选择">
          <div className="campus-context__selectors">
            <label data-campus-label>
              <span>赛事</span>
              <select
                aria-label="选择赛事"
                value={selection?.competitionId ?? ''}
                onChange={(e) => selection && change(e.target.value, selection.seasonId)}
                disabled={!selection}
              >
                {catalog?.competitions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="campus-context__divider" aria-hidden="true" />
            <label data-campus-label>
              <span>赛季</span>
              <select
                aria-label="选择赛季"
                value={selection?.seasonId ?? ''}
                onChange={(e) => selection && change(selection.competitionId, e.target.value)}
                disabled={!selection}
              >
                {catalog?.seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {selection && (
            <span className={`campus-context__source ${selection.isDemo ? 'is-demo' : ''}`}>
              {selection.isDemo ? '演示资料' : '正式赛季'}
            </span>
          )}
        </div>
      )}
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
                : '当前还没有公布参赛名单和赛程。你可以切换赛事或赛季，查看其他比赛。')}
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
