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
              />
              <CaptainMembersPanel
                teamId={teamId}
                data={captain}
                onChange={setCaptain}
              />
              <InviteSearchGap />
            </div>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  )
}

function InviteSearchGap() {
  return (
    <section className="cm-invite-gap" aria-label="邀请球员说明">
      <h3>按姓名邀请</h3>
      <p>
        产品侧区分三类名单：全体学生、已注册用户、线下/往届上传球员。当前接口尚未提供统一的按姓名邀请与「未注册自动通过」能力；入队申请仍走下方审批，大名单编辑请用上方「赛事报名名单」。后续接上搜索邀请 API 后会补齐这一块。
      </p>
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
