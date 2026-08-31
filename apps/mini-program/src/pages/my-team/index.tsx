import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { MatchCard, ProductSection, TeamCrest, UserAvatar } from '../../components/product-ui'
import { positionLabel } from '../../features/product/product.format'
import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import type {
  HomeResponse,
  TeamDashboardResponse,
  TeamPreferencesResponse,
  TeamSummary,
} from '../../features/product/product.types'

import './index.scss'

type PageState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | {
      phase: 'ready'
      home: HomeResponse
      preferences: TeamPreferencesResponse | null
      dashboard: TeamDashboardResponse | null
    }

export default function MyTeamPage() {
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const [editing, setEditing] = useState(false)
  const [primaryId, setPrimaryId] = useState('')
  const [followedIds, setFollowedIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setState({ phase: 'loading' })
    try {
      const home = await productRepository.getHome()
      if (!readSession()) {
        setState({ phase: 'ready', home, preferences: null, dashboard: null })
        return
      }
      const preferences = await productRepository.getTeamPreferences()
      const dashboard = preferences.primaryTeam
        ? await productRepository.getTeamDashboard(preferences.primaryTeam.id, home.tournament.id)
        : null
      setPrimaryId(preferences.primaryTeam?.id ?? '')
      setFollowedIds(preferences.followedTeams.map((team) => team.id))
      setState({ phase: 'ready', home, preferences, dashboard })
      if (!preferences.primaryTeam) setEditing(true)
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '主队数据加载失败。',
      })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const savePreferences = async () => {
    if (!primaryId || saving || state.phase !== 'ready') return
    setSaving(true)
    try {
      const preferences = await productRepository.updateTeamPreferences(
        primaryId,
        followedIds.filter((id) => id !== primaryId),
      )
      const dashboard = await productRepository.getTeamDashboard(primaryId, state.home.tournament.id)
      setState({ ...state, preferences, dashboard })
      setEditing(false)
      await Taro.showToast({ title: '主队已保存', icon: 'success' })
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '保存失败',
        icon: 'none',
      })
    } finally {
      setSaving(false)
    }
  }

  const tournamentId = state.phase === 'ready' ? state.home.tournament.id : undefined
  return (
    <PublicShell active="team" tournamentId={tournamentId}>
      {state.phase === 'loading' && <DataState kind="loading" title="正在加载主队空间" />}
      {state.phase === 'failed' && (
        <DataState kind="error" title="主队空间不可用" description={state.message} onRetry={() => void load()} />
      )}
      {state.phase === 'ready' && (
        <View>
          {!state.preferences ? (
            <VisitorTeamView home={state.home} />
          ) : editing || !state.dashboard ? (
            <TeamSelector
              followedIds={followedIds}
              primaryId={primaryId}
              saving={saving}
              teams={state.preferences.availableTeams}
              onCancel={() => state.dashboard && setEditing(false)}
              onFollowedChange={setFollowedIds}
              onPrimaryChange={(id) => {
                setPrimaryId(id)
                setFollowedIds((current) => current.filter((item) => item !== id))
              }}
              onSave={() => void savePreferences()}
            />
          ) : (
            <TeamDashboard
              data={state.dashboard}
              followedTeams={state.preferences.followedTeams}
              tournamentId={state.home.tournament.id}
              onEdit={() => setEditing(true)}
            />
          )}
        </View>
      )}
    </PublicShell>
  )
}

function VisitorTeamView({ home }: { home: HomeResponse }) {
  return (
    <View>
      <View className="team-guest-header">
        <Text className="team-guest-header__eyebrow">MY CLUB</Text>
        <Text className="team-guest-header__title">选择你的主队</Text>
        <Text className="team-guest-header__copy">登录后保存主队与关注队伍。</Text>
        <Button className="button button--light team-guest-header__login" onClick={() => void Taro.navigateTo({ url: '/pages/me/index' })}>
          登录账户
        </Button>
      </View>
      <View className="team-guest-grid">
        {home.teams.map((team) => (
          <View
            className="team-guest-card"
            key={team.id}
            onClick={() => void goToTeam(team.id, home.tournament.id)}
          >
            <TeamCrest team={team} size="large" />
            <Text className="team-guest-card__name">{team.name}</Text>
            <Text className="team-guest-card__college">{team.collegeName}</Text>
            <Text className="team-guest-card__group">{team.groupName}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function TeamSelector({
  followedIds,
  primaryId,
  saving,
  teams,
  onCancel,
  onFollowedChange,
  onPrimaryChange,
  onSave,
}: {
  followedIds: string[]
  primaryId: string
  saving: boolean
  teams: TeamSummary[]
  onCancel: () => void
  onFollowedChange: (ids: string[]) => void
  onPrimaryChange: (id: string) => void
  onSave: () => void
}) {
  const toggleFollow = (teamId: string) => {
    if (teamId === primaryId) return
    onFollowedChange(
      followedIds.includes(teamId)
        ? followedIds.filter((id) => id !== teamId)
        : [...followedIds, teamId],
    )
  }
  return (
    <View className="team-selector">
      <View className="page-intro">
        <View>
          <Text className="page-intro__eyebrow">TEAM PREFERENCES</Text>
          <Text className="page-intro__title">主队与关注</Text>
        </View>
        <Text className="page-intro__copy">主队固定在首位，关注队伍用于快速查看。</Text>
      </View>
      <View className="team-selector__grid">
        {teams.map((team) => {
          const isPrimary = team.id === primaryId
          const isFollowed = followedIds.includes(team.id)
          return (
            <View className={'team-choice ' + (isPrimary ? 'team-choice--primary' : '')} key={team.id}>
              <View className="team-choice__identity">
                <TeamCrest team={team} />
                <View><Text>{team.name}</Text><Text>{team.collegeName}</Text></View>
              </View>
              <View className="team-choice__actions">
                <Button
                  className={isPrimary ? 'team-choice__primary-active' : ''}
                  onClick={() => onPrimaryChange(team.id)}
                >
                  {isPrimary ? '当前主队' : '设为主队'}
                </Button>
                <Button
                  className={isFollowed ? 'team-choice__follow-active' : ''}
                  disabled={isPrimary}
                  onClick={() => toggleFollow(team.id)}
                >
                  {isPrimary ? '主队已关注' : isFollowed ? '已关注' : '关注'}
                </Button>
              </View>
            </View>
          )
        })}
      </View>
      <View className="team-selector__footer">
        <Button className="button button--outline" onClick={onCancel}>取消</Button>
        <Button className="button button--primary" disabled={!primaryId || saving} loading={saving} onClick={onSave}>保存选择</Button>
      </View>
    </View>
  )
}

function TeamDashboard({
  data,
  followedTeams,
  tournamentId,
  onEdit,
}: {
  data: TeamDashboardResponse
  followedTeams: TeamSummary[]
  tournamentId: string
  onEdit: () => void
}) {
  return (
    <View>
      <View className="my-team-hero" style={{ borderColor: data.team.primaryColor ?? '#1f6b45' }}>
        <View className="my-team-hero__identity">
          <TeamCrest team={data.team} size="large" />
          <View className="my-team-hero__copy">
            <Text className="my-team-hero__label">我的主队 · {data.team.groupName ?? '参赛球队'}</Text>
            <Text className="my-team-hero__title">{data.team.name}</Text>
            <Text className="my-team-hero__college">{data.team.collegeName}</Text>
            <Text className="my-team-hero__motto">{data.team.motto}</Text>
          </View>
        </View>
        <Button className="my-team-hero__edit" onClick={onEdit}>管理关注</Button>
      </View>

      <View className="team-record">
        <Record value={data.stats.played} label="比赛" />
        <Record value={data.stats.won} label="胜" />
        <Record value={data.stats.drawn} label="平" />
        <Record value={data.stats.lost} label="负" />
        <Record value={data.stats.goalsFor + ':' + data.stats.goalsAgainst} label="进失球" />
        <Record value={data.stats.points} label="积分" accent />
      </View>

      <View className="my-team-grid">
        <View className="my-team-main">
          <ProductSection kicker="FIXTURES" title="球队比赛" note="近期与下一场" />
          <View className="my-team-match-grid">
            {[...data.upcomingMatches, ...data.recentMatches].slice(0, 4).map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                onClick={() => void Taro.navigateTo({ url: '/pages/readonly-match-detail/index?matchId=' + encodeURIComponent(match.id) })}
              />
            ))}
          </View>
        </View>
        <View className="my-team-aside">
          <ProductSection kicker="PROFILE" title="球队信息" />
          <View className="team-profile surface">
            <ProfileRow label="队长" value={data.team.captainName ?? '未设置'} />
            <ProfileRow label="教练" value={data.team.coachName ?? '未设置'} />
            <ProfileRow label="成立" value={data.team.foundedYear ? data.team.foundedYear + ' 年' : '未填写'} />
            <ProfileRow label="简介" value={data.team.description ?? '暂无简介'} multiline />
          </View>
        </View>
      </View>

      <View className="team-roster-section">
        <ProductSection kicker="SQUAD" title="球队阵容" note={data.roster.length + ' 名球员'} />
        <View className="team-roster-grid">
          {data.roster.map((player) => (
            <View
              className="squad-player"
              key={player.id}
              onClick={() => void Taro.navigateTo({ url: '/pages/player-detail/index?playerId=' + encodeURIComponent(player.id) + '&tournamentId=' + encodeURIComponent(tournamentId) })}
            >
              <Text className="squad-player__number">{player.shirtNumber ?? '-'}</Text>
              <UserAvatar name={player.displayName} color={player.profileColor} />
              <View className="squad-player__copy">
                <Text>{player.displayName}</Text>
                <Text>{positionLabel(player.position)} · {player.academicYear}</Text>
              </View>
              <View className="squad-player__stats">
                <Text>{player.appearances} 场</Text>
                <Text>{player.goals} 球 · {player.assists} 助</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {followedTeams.length > 0 && (
        <View className="followed-team-section">
          <ProductSection kicker="FOLLOWING" title="其他关注" note={followedTeams.length + ' 支'} />
          <View className="followed-team-list">
            {followedTeams.map((team) => (
              <View className="followed-team" key={team.id} onClick={() => void goToTeam(team.id, tournamentId)}>
                <TeamCrest team={team} /><Text>{team.name}</Text><Text>查看</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  )
}

function Record({ value, label, accent = false }: { value: number | string; label: string; accent?: boolean }) {
  return (
    <View className={'team-record__item ' + (accent ? 'team-record__item--accent' : '')}>
      <Text>{value}</Text><Text>{label}</Text>
    </View>
  )
}

function ProfileRow({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <View className={'team-profile__row ' + (multiline ? 'team-profile__row--multiline' : '')}>
      <Text>{label}</Text><Text>{value}</Text>
    </View>
  )
}

async function goToTeam(teamId: string, tournamentId: string) {
  await Taro.navigateTo({
    url: '/pages/readonly-team-detail/index?teamId=' + encodeURIComponent(teamId) + '&tournamentId=' + encodeURIComponent(tournamentId),
  })
}
