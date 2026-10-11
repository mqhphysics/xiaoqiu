import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Taro from '@tarojs/taro'
import { useOverlayFocus } from '../../components/overlay-focus'
import { UserAvatar } from '../../components/product-ui'
import { PersonTrigger } from '../../components/person-trigger'
import { DataState } from '../../components/public-ui'
import { positionLabel } from '../product/product.format'
import {
  productRepository,
  createClientActionId,
} from '../product/product.repository'
import type {
  CaptainWorkspaceResponse,
  MatchSummary,
  TeamDashboardResponse,
} from '../product/product.types'
import {
  OPEN_CAPTAIN_MANAGE_EVENT,
  openCaptainManage,
  type CaptainManagePickerRequest,
  type CaptainManageRequest,
} from './captain-manage-navigation.h5'
import CaptainProfileEditor from './profile-editor'
import { CaptainRosterWorkflow } from './index'
import { teamManagementRepository } from './team-management.repository'
import { RosterApiError } from './roster.repository'
import './manage-modal.h5.scss'
import './roster.scss'

type HostDetail =
  | CaptainManageRequest
  | { picker: CaptainManagePickerRequest }

export function CaptainManageHost() {
  const [request, setRequest] = useState<CaptainManageRequest | null>(null)
  const [picker, setPicker] = useState<CaptainManagePickerRequest | null>(null)

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<HostDetail>).detail
      if (!detail) return
      if ('picker' in detail) {
        setPicker(detail.picker)
        setRequest(null)
        return
      }
      setPicker(null)
      setRequest(detail)
    }
    window.addEventListener(OPEN_CAPTAIN_MANAGE_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_CAPTAIN_MANAGE_EVENT, onOpen)
  }, [])

  if (picker) {
    return createPortal(
      <div
        className="cm-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setPicker(null)
        }}
      >
        <section className="cm-picker" role="dialog" aria-modal="true" aria-label="选择要管理的球队">
          <header className="cm-header">
            <div>
              <h2>选择球队</h2>
              <p>你可管理多支球队，请选择要打开的管理面板。</p>
            </div>
            <button type="button" className="cm-close" aria-label="关闭" onClick={() => setPicker(null)}>
              ×
            </button>
          </header>
          <div className="cm-picker__list">
            {picker.teams.map((team) => (
              <button
                type="button"
                key={team.id}
                className="cm-picker__item"
                onClick={() => {
                  setPicker(null)
                  openCaptainManage({
                    teamId: team.id,
                    ...(picker.tournamentId ? { tournamentId: picker.tournamentId } : {}),
                    teamName: team.name,
                  })
                }}
              >
                <strong>{team.name}</strong>
                <span>管理 →</span>
              </button>
            ))}
          </div>
        </section>
      </div>,
      document.body,
    )
  }

  if (!request) return null
  return (
    <CaptainManageModal
      teamId={request.teamId}
      tournamentId={request.tournamentId ?? ''}
      {...(request.teamName ? { teamName: request.teamName } : {})}
      onClose={() => setRequest(null)}
    />
  )
}

function CaptainManageModal({
  teamId,
  tournamentId,
  teamName,
  onClose,
}: {
  teamId: string
  tournamentId: string
  teamName?: string
  onClose: () => void
}) {
  useOverlayFocus(true, '.cm-dialog', onClose)
  const [captain, setCaptain] = useState<CaptainWorkspaceResponse | null>(null)
  const [dashboard, setDashboard] = useState<TeamDashboardResponse | null>(null)
  const [matches, setMatches] = useState<MatchSummary[]>([])
  const [resolvedTournamentId, setResolvedTournamentId] = useState(tournamentId)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const sequence = useRef(0)

  const load = useCallback(async () => {
    const id = ++sequence.current
    setLoading(true)
    setError('')
    try {
      const [workspace, dash, home] = await Promise.all([
        productRepository.getCaptainWorkspace(teamId),
        productRepository.getTeamDashboard(teamId, tournamentId || undefined),
        tournamentId
          ? Promise.resolve(null)
          : productRepository.getHome().catch(() => null),
      ])
      const nextTournament = tournamentId || home?.tournament.id || ''
      const teamMatches = [...(dash.upcomingMatches ?? []), ...(dash.recentMatches ?? [])]
      if (id !== sequence.current) return
      setCaptain(workspace)
      setDashboard(dash)
      setMatches(teamMatches)
      setResolvedTournamentId(nextTournament)
    } catch (issue) {
      if (id === sequence.current)
        setError(issue instanceof Error ? issue.message : '球队管理加载失败')
    } finally {
      if (id === sequence.current) setLoading(false)
    }
  }, [teamId, tournamentId])

  useEffect(() => {
    void load()
    return () => {
      sequence.current += 1
    }
  }, [load])

  const title = captain?.team.name ?? teamName ?? dashboard?.team.name ?? '球队管理'

  return createPortal(
    <div
      className="cm-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="cm-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header className="cm-header">
          <div>
            <h2>{title}</h2>
            <p>资料、阵容与大名单。弹窗尺寸固定，内容在下方区域滚动。</p>
          </div>
          <button type="button" className="cm-close" aria-label="关闭球队管理" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="cm-body">
          {loading ? (
            <DataState kind="loading" title="正在打开球队管理" />
          ) : error ? (
            <DataState kind="error" title="球队管理暂不可用" description={error} onRetry={() => void load()} />
          ) : captain && dashboard ? (
            <div className="cm-stack lineup-workbench--modal">
              <CaptainProfileEditor
                teamId={teamId}
                defaultExpanded
                onChange={(next) => {
                  setCaptain(next)
                  setDashboard((current) =>
                    current
                      ? { ...current, team: { ...current.team, ...next.team } }
                      : current,
                  )
                }}
              />
              <CaptainRosterWorkflow
                teamId={teamId}
                tournamentId={resolvedTournamentId}
                captain={captain}
                roster={dashboard.roster}
                matches={matches}
                landscape
                compact
              />
              <CaptainInviteSearch
                teamId={teamId}
                teamName={captain.team.name}
                memberUserIds={new Set(
                  captain.members.map((m) => m.userId).filter((id): id is string => Boolean(id)),
                )}
                memberPlayerIds={new Set(
                  captain.members.map((m) => m.playerId).filter((id): id is string => Boolean(id)),
                )}
              />
              <CaptainMembersPanel
                teamId={teamId}
                data={captain}
                onChange={setCaptain}
              />
            </div>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  )
}

type InviteHit =
  | {
      key: string
      kind: 'user'
      id: string
      displayName: string
      avatarUrl: string | null
      note: string
    }
  | {
      key: string
      kind: 'player'
      id: string
      displayName: string
      avatarUrl: string | null
      note: string
      teamName: string | null
    }

function CaptainInviteSearch({
  teamId,
  teamName,
  memberUserIds,
  memberPlayerIds,
}: {
  teamId: string
  teamName: string
  memberUserIds: Set<string>
  memberPlayerIds: Set<string>
}) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<InviteHit[]>([])
  const [busy, setBusy] = useState(false)
  const [inviting, setInviting] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const seq = useRef(0)

  const search = async () => {
    const q = query.trim()
    if (q.length < 1) {
      setHits([])
      return
    }
    const id = ++seq.current
    setBusy(true)
    setError('')
    setNotice('')
    try {
      // Pragmatic search: registered users (message directory) + public/demo players.
      // Gap: no campus-wide student directory or captain "add membership" invite API yet;
      // unregistered auto-pass is not available client-side — use DM invite for users.
      const [directory, players] = await Promise.all([
        productRepository.getMessageDirectory(q).catch(() => ({ items: [] as Array<{ id: string; displayName: string; avatarUrl: string | null }> })),
        productRepository.search(q, 'PLAYER').catch(() => ({ players: [] as Array<{ id: string; displayName: string; avatarUrl: string | null; team: { name: string } | null; position: string | null }> })),
      ])
      if (id !== seq.current) return
      const userHits: InviteHit[] = directory.items.map((user) => ({
        key: `user:${user.id}`,
        kind: 'user' as const,
        id: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        note: memberUserIds.has(user.id) ? '已是本队成员' : '已注册用户',
      }))
      const playerHits: InviteHit[] = players.players
        .filter((player) => !memberPlayerIds.has(player.id))
        .map((player) => ({
          key: `player:${player.id}`,
          kind: 'player' as const,
          id: player.id,
          displayName: player.displayName,
          avatarUrl: player.avatarUrl,
          teamName: player.team?.name ?? null,
          note: player.team?.name
            ? `球员档案 · ${player.team.name}`
            : '球员档案 · 暂无球队',
        }))
      // Prefer user rows; keep players that are not already covered by a same-name member user hit.
      const merged = [...userHits, ...playerHits].slice(0, 20)
      setHits(merged)
      if (!merged.length) setNotice('没有匹配的已注册用户或球员档案。')
    } catch (issue) {
      if (id === seq.current) setError(issue instanceof Error ? issue.message : '搜索失败')
    } finally {
      if (id === seq.current) setBusy(false)
    }
  }

  const invite = async (hit: InviteHit) => {
    if (hit.kind === 'user' && memberUserIds.has(hit.id)) {
      setNotice(`${hit.displayName} 已在队中。`)
      return
    }
    if (hit.kind !== 'user') {
      // No captain-side membership create for offline/player-only records yet.
      setNotice(
        hit.teamName
          ? `${hit.displayName} 已在「${hit.teamName}」。可请对方注册后自行申请入队，或通过赛事报名名单维护大名单。`
          : `${hit.displayName} 尚无注册账号。对方注册并申请入队后，你可在下方审批；大名单也可在赛事报名中勾选已有球员档案。`,
      )
      return
    }
    setInviting(hit.key)
    setError('')
    try {
      // Prefer DM when messaging is enabled; otherwise leave a feedback record the admin/captain can track.
      // Gap: no dedicated captain→player membership invite / auto-approve endpoint yet.
      try {
        await productRepository.sendMessage(
          hit.id,
          `【入队邀请】你好，我是「${teamName}」队长。诚邀你加入本队，请打开晓球 → 我的 → 加入球队提交申请，通过后即可一起训练比赛。`,
          createClientActionId('team-invite'),
        )
        setNotice(`已向 ${hit.displayName} 发送入队邀请私信。`)
      } catch (dmError) {
        await productRepository.createReport(
          'FEEDBACK',
          `入队邀请 · ${hit.displayName}`,
          `队长邀请注册用户 ${hit.displayName}（userId=${hit.id}）加入「${teamName}」（teamId=${teamId}）。对方需自行提交入队申请；本记录用于追踪邀请。`,
          createClientActionId('team-invite-report'),
        )
        setNotice(
          `私信暂不可用（${dmError instanceof Error ? dmError.message : '功能未开放'}）。已为 ${hit.displayName} 留下入队邀请记录，请对方自行申请入队。`,
        )
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '邀请发送失败')
    } finally {
      setInviting(null)
    }
  }

  return (
    <section className="cm-invite" aria-label="按姓名邀请">
      <div className="cm-invite__head">
        <h3>按姓名邀请</h3>
        <form
          className="cm-invite__search"
          onSubmit={(event) => {
            event.preventDefault()
            void search()
          }}
        >
          <input
            value={query}
            maxLength={40}
            placeholder="搜索已注册用户或球员姓名"
            aria-label="搜索姓名"
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="submit" disabled={busy || !query.trim()}>
            {busy ? '搜索中…' : '搜索'}
          </button>
        </form>
      </div>
      {error ? (
        <p className="cm-members__error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="cm-invite__notice" role="status">
          {notice}
        </p>
      ) : null}
      <div className="cm-invite__list">
        {hits.map((hit) => (
          <div className="cm-invite__row" key={hit.key}>
            <UserAvatar avatarUrl={hit.avatarUrl} name={hit.displayName} size="small" />
            <div>
              <strong>{hit.displayName}</strong>
              <small>{hit.note}</small>
            </div>
            <button
              type="button"
              disabled={Boolean(inviting) || (hit.kind === 'user' && memberUserIds.has(hit.id))}
              onClick={() => void invite(hit)}
            >
              {hit.kind === 'user' && memberUserIds.has(hit.id)
                ? '已在队中'
                : inviting === hit.key
                  ? '发送中…'
                  : hit.kind === 'user'
                    ? '发邀请'
                    : '查看说明'}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

function CaptainMembersPanel({
  teamId,
  data,
  onChange,
}: {
  teamId: string
  data: CaptainWorkspaceResponse
  onChange: (data: CaptainWorkspaceResponse) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [memberReason, setMemberReason] = useState('队长维护本队成员资料')
  const [memberError, setMemberError] = useState('')
  const lock = useRef(false)

  const run = async (key: string, action: () => Promise<CaptainWorkspaceResponse>) => {
    if (lock.current) return
    lock.current = true
    setBusy(key)
    setMemberError('')
    try {
      onChange(await action())
      void Taro.showToast({ title: '已更新', icon: 'success' })
    } catch (issue) {
      setMemberError(
        issue instanceof RosterApiError && issue.status === 409
          ? '成员资料已被其他人修改，请重新读取后再操作。'
          : issue instanceof Error
            ? issue.message
            : '操作失败',
      )
    } finally {
      lock.current = false
      setBusy(null)
    }
  }

  const review = async (applicationId: string, decision: 'APPROVED' | 'REJECTED') => {
    const confirmation = await Taro.showModal({
      title: decision === 'APPROVED' ? '批准入队' : '拒绝申请',
      content: '处理结果会通过消息通知申请人。',
      confirmText: decision === 'APPROVED' ? '批准' : '拒绝',
    })
    if (confirmation.confirm)
      await run(`application:${applicationId}`, () =>
        productRepository.reviewTeamApplication(teamId, applicationId, decision),
      )
  }

  const updatePosition = (member: CaptainWorkspaceResponse['members'][number], position: string) => {
    if (!member.updatedAt || memberReason.trim().length < 2) {
      setMemberError('请填写至少 2 个字的修改原因。')
      return
    }
    void run(`position:${member.id}`, () =>
      teamManagementRepository.updateMember(
        teamId,
        member.id,
        position,
        member.updatedAt,
        memberReason.trim(),
        createClientActionId('team-member'),
      ),
    )
  }

  const remove = async (member: CaptainWorkspaceResponse['members'][number]) => {
    if (!member.updatedAt || memberReason.trim().length < 2) {
      setMemberError('请填写至少 2 个字的修改原因。')
      return
    }
    const confirmation = await Taro.showModal({
      title: '移出球队',
      content: `确认将 ${member.displayName} 移出球队？移出不会自动改动上方已确认的大名单球员池。`,
      confirmText: '移出',
    })
    if (!confirmation.confirm) return
    await run(`member:${member.id}`, () =>
      teamManagementRepository.removeMember(
        teamId,
        member.id,
        member.updatedAt,
        memberReason.trim(),
        createClientActionId('team-member'),
      ),
    )
  }

  const pending = data.applications.filter((item) => item.status === 'PENDING')

  return (
    <section className="cm-members" aria-label="入队申请与成员">
      <div className="cm-members__head">
        <h3>入队申请与成员</h3>
        <label>
          修改原因
          <input
            value={memberReason}
            maxLength={500}
            disabled={Boolean(busy)}
            onChange={(event) => setMemberReason(event.target.value)}
          />
        </label>
      </div>
      {memberError ? (
        <p className="cm-members__error" role="alert">
          {memberError}
        </p>
      ) : null}
      <div className="cm-members__grid">
        <div className="cm-card">
          <h4>待处理申请</h4>
          {pending.map((application) => (
            <div className="cm-application" key={application.id}>
              <UserAvatar
                avatarUrl={application.player?.avatarUrl ?? application.applicant.avatarUrl}
                name={application.player?.displayName ?? application.applicant.displayName}
                userId={application.applicant.id}
                size="small"
              />
              <div>
                <PersonTrigger userId={application.applicant.id} name={application.player?.displayName ?? application.applicant.displayName}>
                  <strong>{application.player?.displayName ?? application.applicant.displayName}</strong>
                </PersonTrigger>
                <small>
                  {positionLabel(application.requestedPosition)} · {application.message ?? '未填写留言'}
                </small>
              </div>
              <div className="cm-application__actions">
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void review(application.id, 'APPROVED')}
                >
                  批准
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void review(application.id, 'REJECTED')}
                >
                  拒绝
                </button>
              </div>
            </div>
          ))}
          {!pending.length && <p className="cm-empty">暂无待处理申请</p>}
        </div>
        <div className="cm-card">
          <h4>球队成员（现役）</h4>
          <p className="cm-hint">
            这里调整成员不会立刻改动上方阵容板的可用球员池；确认大名单并审核通过后，阵容池才会更新。
          </p>
          {data.members.map((member) => (
            <div className="cm-member" key={member.id}>
              <UserAvatar
                avatarUrl={member.avatarUrl}
                name={member.displayName}
                userId={member.userId ?? undefined}
                playerId={member.playerId ?? undefined}
                size="small"
              />
              <div>
                <strong>
                  {member.displayName}
                  {member.isCaptain ? ' · 队长' : ''}
                </strong>
                <small>{positionLabel(member.position)}</small>
              </div>
              <select
                aria-label={`${member.displayName}的场上位置`}
                value={member.position ?? ''}
                disabled={Boolean(busy)}
                onChange={(event) => updatePosition(member, event.target.value)}
              >
                <option value="" disabled>
                  未填写
                </option>
                <option value="FORWARD">前锋</option>
                <option value="MIDFIELDER">中场</option>
                <option value="DEFENDER">后卫</option>
                <option value="GOALKEEPER">门将</option>
              </select>
              <button
                type="button"
                disabled={member.isCaptain || Boolean(busy)}
                onClick={() => void remove(member)}
              >
                移出
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
