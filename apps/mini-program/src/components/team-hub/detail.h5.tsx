import Taro from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DataState } from '../public-ui'
import { TeamContent, TeamHero } from './content.h5'
import { useTeamData } from './data.h5'
import { TeamIcon } from './icons.h5'
import { publishPreferences } from './picker.h5'
import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import type {
  TeamPreferencesResponse,
  TeamRelationshipResponse,
} from '../../features/product/product.types'
import { TEAM_PREFERENCES_EVENT } from '../../features/product/team-navigation.h5'

export function TeamDetailView({
  teamId,
  tournamentId: requestedTournamentId,
}: {
  teamId: string
  tournamentId?: string | undefined
}) {
  const [initialTournament, setInitialTournament] = useState(requestedTournamentId ?? '')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    if (requestedTournamentId) {
      setInitialTournament(requestedTournamentId)
      return
    }
    setError('')
    void productRepository
      .getHome()
      .then((home) => {
        if (active) setInitialTournament(home.tournament.id)
      })
      .catch((issue) => {
        if (active) setError(issue instanceof Error ? issue.message : '赛事信息加载失败')
      })
    return () => {
      active = false
    }
  }, [requestedTournamentId, attempt])
  if (!teamId) return <DataState kind="error" title="缺少球队参数" />
  if (error)
    return (
      <DataState
        kind="error"
        title="球队详情暂不可用"
        description={error}
        onRetry={() => setAttempt((current) => current + 1)}
      />
    )
  return initialTournament ? (
    <LoadedDetail
      key={`${teamId}:${initialTournament}`}
      teamId={teamId}
      initialTournament={initialTournament}
    />
  ) : (
    <DataState kind="loading" title="正在读取球队档案" />
  )
}

function LoadedDetail({
  teamId,
  initialTournament,
}: {
  teamId: string
  initialTournament: string
}) {
  const [tournamentId, setTournamentId] = useState(initialTournament)
  const state = useTeamData(teamId, tournamentId)
  if (state.loading && !state.data) return <DataState kind="loading" title="正在读取球队档案" />
  if (state.error || !state.data)
    return (
      <>
        <DataState
          kind="error"
          title="球队详情暂不可用"
          description={state.error}
          onRetry={() => void state.reload()}
        />
        {tournamentId !== initialTournament ? (
          <button
            data-team-control
            type="button"
            className="th-soft-button"
            onClick={() => setTournamentId(initialTournament)}
          >
            返回原赛事
          </button>
        ) : null}
      </>
    )
  return (
    <>
      {state.loading ? <DataState kind="loading" title="正在读取赛事数据" /> : null}
      <div style={{ display: state.loading ? 'none' : undefined }} aria-busy={state.loading}>
        <TeamHero data={state.data}>
          <TeamActions teamId={teamId} tournamentId={tournamentId} />
        </TeamHero>
        <TeamContent
          data={state.data}
          competition={state.competition}
          competitionError={state.competitionError}
          tournamentId={tournamentId}
          onTournamentChange={setTournamentId}
          onReload={() => void state.reload()}
          onPostPublished={(post) =>
            state.setData((current) =>
              current ? { ...current, posts: [post, ...current.posts] } : current,
            )
          }
        />
      </div>
    </>
  )
}

function TeamActions({ teamId, tournamentId }: { teamId: string; tournamentId: string }) {
  const [preferences, setPreferences] = useState<TeamPreferencesResponse | null>(null)
  const [relationship, setRelationship] = useState<TeamRelationshipResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [join, setJoin] = useState(false)
  const [position, setPosition] = useState('MIDFIELDER')
  const [message, setMessage] = useState('')
  const locked = useRef(false)
  const signedIn = Boolean(readSession())
  const load = useCallback(async () => {
    if (!readSession()) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const [prefs, relation] = await Promise.all([
        productRepository.getTeamPreferences(),
        productRepository.getTeamRelationship(teamId),
      ])
      setPreferences(prefs)
      setRelationship(relation)
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '球队关系加载失败')
    } finally {
      setLoading(false)
    }
  }, [teamId])
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    const changed = (event: Event) =>
      setPreferences((event as CustomEvent<TeamPreferencesResponse>).detail)
    window.addEventListener(TEAM_PREFERENCES_EVENT, changed)
    return () => window.removeEventListener(TEAM_PREFERENCES_EVENT, changed)
  }, [])
  const primary = preferences?.primaryTeam?.id === teamId
  const followed = primary || Boolean(preferences?.followedTeams.some((team) => team.id === teamId))
  const save = async (mode: 'primary' | 'follow') => {
    if (!signedIn) {
      await Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError('')
    try {
      const current = await productRepository.getTeamPreferences()
      const primaryId = mode === 'primary' ? teamId : current.primaryTeam?.id
      if (!primaryId) {
        setError('请先设置一支主队，再关注其他球队。')
        return
      }
      const ids = current.followedTeams.map((team) => team.id)
      const nextFollowed =
        mode === 'follow'
          ? ids.includes(teamId)
            ? ids.filter((id) => id !== teamId)
            : [...ids, teamId]
          : ids
      const next = await productRepository.updateTeamPreferences(
        primaryId,
        nextFollowed.filter((id) => id !== primaryId),
      )
      setPreferences(next)
      publishPreferences(next)
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '保存失败，请重试')
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  const apply = async () => {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError('')
    try {
      setRelationship(await productRepository.applyToTeam(teamId, position, message))
      setJoin(false)
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '申请失败，请重试')
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  return (
    <div className="th-actions">
      <button
        data-team-control
        type="button"
        className="th-soft-button"
        disabled={busy || loading || primary}
        onClick={() => void save('primary')}
      >
        {primary ? '已设为主队' : '设为我的主队'}
      </button>
      <button
        data-team-control
        type="button"
        className="th-outline-button"
        disabled={busy || loading || primary}
        onClick={() => void save('follow')}
      >
        <TeamIcon name="heart" />
        {followed ? '已关注' : '关注球队'}
      </button>
      {relationship?.isCaptain ? (
        <button
          data-team-control
          type="button"
          className="th-text-button"
          onClick={() =>
            void Taro.navigateTo({
              url: `/pages/my-team/index?teamId=${encodeURIComponent(teamId)}&tournamentId=${encodeURIComponent(tournamentId)}`,
            })
          }
        >
          进入球队管理
          <TeamIcon name="arrow" />
        </button>
      ) : relationship?.membershipStatus === 'ACTIVE' ? (
        <span className="th-muted">已是球队成员</span>
      ) : relationship?.application?.status === 'PENDING' ? (
        <span className="th-muted">入队申请待审批</span>
      ) : signedIn && relationship ? (
        <button
          data-team-control
          type="button"
          className="th-text-button"
          onClick={() => setJoin((current) => !current)}
        >
          申请加入球队
        </button>
      ) : null}
      {join ? (
        <div className="th-join">
          <select
            data-team-control
            aria-label="申请加入的位置"
            value={position}
            onChange={(event) => setPosition(event.target.value)}
          >
            {[
              ['FORWARD', '前锋'],
              ['MIDFIELDER', '中场'],
              ['DEFENDER', '后卫'],
              ['GOALKEEPER', '门将'],
            ].map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
          <input
            data-team-control
            aria-label="入队申请说明"
            placeholder="入队申请说明（可选）"
            maxLength={500}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <button
            data-team-control
            type="button"
            disabled={busy}
            className="th-primary-button"
            onClick={() => void apply()}
          >
            提交申请
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="th-inline-error" role="alert">
          {error}
          <button
            data-team-control
            type="button"
            disabled={busy || loading}
            onClick={() => void load()}
          >
            重试读取
          </button>
        </p>
      ) : null}
    </div>
  )
}
