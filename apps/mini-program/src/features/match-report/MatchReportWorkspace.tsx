import { ReportButton as Button } from './ReportButton'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'

import { DataState } from '../../components/public-ui'
import { readSession } from '../product/session'
import { createClientActionId } from '../product/product.repository'
import { draftKey, readDraft, removeDraft, writeDraft } from './draft.repository'
import {
  cloneFields,
  createSaveCommand,
  describeChanges,
  draftDecision,
  emptyFields,
  EVENT_LABELS,
  fieldsEqual,
  goalCounts,
  OUTCOME_LABELS,
  scoreText,
  STATUS_LABELS,
  validateReport,
} from './logic'
import type { ValidationIssue } from './logic'
import { MatchReportError, matchReportGateway } from './repository'
import type {
  EventKind,
  ReportEvent,
  ReportFields,
  ReportGateway,
  ReportRevision,
  ReportWorkspace,
  SaveReportCommand,
  Side,
} from './types'
import './index.scss'

const STEPS = ['比分与结果', '比赛事件', '核对保存']
const EVENT_KINDS = Object.keys(EVENT_LABELS) as EventKind[]

export function MatchReportWorkspace({
  matchId,
  gateway = matchReportGateway,
  onExit,
}: {
  matchId: string
  gateway?: ReportGateway
  onExit: () => void
}) {
  const session = readSession()
  const userId = session?.user.id
  const organizationId = session?.user.organizationId
  const actorToken = session?.accessToken
  const key = organizationId && userId ? draftKey(organizationId, userId, matchId) : ''
  const [workspace, setWorkspace] = useState<ReportWorkspace | null>(null)
  const [fields, setFields] = useState<ReportFields>(emptyFields)
  const [baseVersion, setBaseVersion] = useState(0)
  const [reason, setReason] = useState('')
  const [correction, setCorrection] = useState(false)
  const [reviewReason, setReviewReason] = useState('')
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<SaveReportCommand | null>(null)
  const [conflict, setConflict] = useState(false)
  const [issues, setIssues] = useState<ValidationIssue[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<ReportRevision[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [nextHistoryVersion, setNextHistoryVersion] = useState<number | null>(null)
  const inFlight = useRef(false)
  const generation = useRef(0)
  const alive = useRef(true)
  const loadedOnce = useRef(false)
  const visible = useRef(true)
  const refreshOnResume = useRef(false)
  const latest = workspace?.latest
  const baseline = latest?.fields ?? emptyFields()
  const dirty = !fieldsEqual(fields, baseline) || reason.trim().length > 0
  const missingContext =
    !workspace?.homeTeam.rosterSnapshotId ||
    !workspace?.awayTeam.rosterSnapshotId ||
    !workspace?.ruleVersionId
  const locked =
    busy ||
    !!pending ||
    conflict ||
    missingContext ||
    (!workspace?.permissions.canEdit && !correction)
  const counts = goalCounts(fields)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      generation.current += 1
    }
  }, [])

  async function load() {
    const requestGeneration = ++generation.current
    setLoading(true)
    setLoadError('')
    try {
      if (!key || !actorToken) throw new Error('请先登录信息员或管理员账号')
      if (!matchId) throw new Error('请从比赛详情的「录入比赛信息」按钮进入')
      const data = await gateway.load(matchId)
      if (!alive.current || requestGeneration !== generation.current) return
      if (data.matchId !== matchId || data.organizationId !== organizationId)
        throw new Error('报告与当前比赛或组织不一致，已停止载入')
      const draft = readDraft(key)
      const decision = draftDecision(draft, data.latest?.version ?? 0)
      setWorkspace(data)
      loadedOnce.current = true
      setBusy(inFlight.current)
      setCorrection(Boolean(data.permissions.canCorrect && draft && decision !== 'NONE'))
      setBaseVersion(draft && decision !== 'NONE' ? draft.baseVersion : (data.latest?.version ?? 0))
      setFields(
        cloneFields(
          draft && decision !== 'NONE' ? draft.fields : (data.latest?.fields ?? emptyFields()),
        ),
      )
      setReason(draft && decision !== 'NONE' ? draft.reason : '')
      setPending(decision === 'RETRY' ? (draft?.pending ?? null) : null)
      setConflict(decision === 'CONFLICT')
      setNotice(
        decision === 'RETRY'
          ? '上次保存的结果尚未确认。请点击「重试确认保存」，核对后才能继续编辑。'
          : decision === 'CONFLICT'
            ? '已恢复本地草稿，但其他人保存了新版本。请先比较，草稿没有被覆盖。'
            : decision === 'RESTORE'
              ? '已恢复此账号的本地草稿。草稿尚未保存为报告版本。'
              : '',
      )
    } catch (cause) {
      if (alive.current && requestGeneration === generation.current)
        setLoadError(cause instanceof Error ? cause.message : '报告加载失败')
    } finally {
      if (alive.current && requestGeneration === generation.current) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [matchId, key, actorToken]) // Owned data follows the actor and match.

  useDidHide(() => {
    visible.current = false
    refreshOnResume.current = true
    generation.current += 1
  })
  useDidShow(() => {
    visible.current = true
    if (loadedOnce.current && !inFlight.current) {
      refreshOnResume.current = false
      void load()
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined' || (!dirty && !pending)) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty, pending])

  function persist(
    nextFields = fields,
    nextReason = reason,
    nextPending = pending,
    version = baseVersion,
  ) {
    const success = writeDraft(key, {
      schemaVersion: 1,
      baseVersion: version,
      fields: cloneFields(nextFields),
      reason: nextReason,
      savedAt: new Date().toISOString(),
      pending: nextPending,
    })
    if (!success) setNotice('本地草稿保存失败，请留在此页，避免未保存内容丢失。')
    return success
  }
  function edit(next: ReportFields) {
    if (locked) return
    setFields(next)
    setIssues([])
    setError('')
    setNotice('改动已暂存于本机，尚未保存为报告版本。')
    persist(next)
  }
  function editReason(value: string) {
    setReason(value)
    setIssues([])
    persist(fields, value)
  }
  function addEvent(kind: EventKind) {
    edit({
      ...fields,
      events: [
        ...fields.events,
        {
          id: createClientActionId('event'),
          kind,
          side: 'HOME',
          minute: '',
          addedMinute: '',
          playerId: '',
          relatedPlayerId: '',
        },
      ],
    })
  }
  function patchEvent(id: string, patch: Partial<ReportEvent>) {
    edit({
      ...fields,
      events: fields.events.map((event) => (event.id === id ? { ...event, ...patch } : event)),
    })
  }
  async function removeEvent(event: ReportEvent) {
    const result = await Taro.showModal({
      title: `删除这条${EVENT_LABELS[event.kind]}？`,
      content: '只移除本次录入中的事件。之前已保存的版本仍可查看。',
      confirmText: '删除事件',
    })
    if (result.confirm)
      edit({ ...fields, events: fields.events.filter((item) => item.id !== event.id) })
  }

  async function cancel() {
    if (busy) return
    if (pending) {
      setError('这次保存可能已经成功，请先重试确认。确认结果前无法把它当作未保存改动取消。')
      return
    }
    if (dirty) {
      const result = await Taro.showModal({
        title: '取消本次录入？',
        content: '本次未保存的修改和本地草稿将被丢弃，已保存的报告版本会保留。',
        confirmText: '放弃改动',
        cancelText: '继续录入',
      })
      if (!result.confirm) return
    }
    if (!removeDraft(key)) {
      setError('本地草稿未能清除，请重试取消，避免下次重新恢复。')
      return
    }
    setFields(cloneFields(baseline))
    setReason('')
    onExit()
  }

  async function save(action: SaveReportCommand['action']) {
    if (!workspace || locked || inFlight.current) return
    const nextIssues = validateReport(fields, workspace, action === 'SUBMIT', reason)
    if (action === 'CORRECT' && reason.trim().length < 2)
      nextIssues.push({ field: 'reason', message: '启动修正必须填写原因' })
    setIssues(nextIssues)
    if (nextIssues.length) {
      setStep(2)
      return
    }
    if (
      !dirty &&
      (action === 'SAVE' || latest?.status === 'SUBMITTED' || latest?.status === 'CONFIRMED')
    )
      return
    const command = createSaveCommand(
      fields,
      baseVersion,
      action,
      reason,
      createClientActionId('report'),
      {
        homeRosterSnapshotId: workspace.homeTeam.rosterSnapshotId!,
        awayRosterSnapshotId: workspace.awayTeam.rosterSnapshotId!,
        ruleVersionId: workspace.ruleVersionId!,
      },
    )
    await send(command)
  }

  async function review(action: 'RETURN' | 'CONFIRM') {
    if (!workspace || busy || pending || conflict) return
    if (action === 'RETURN' && reviewReason.trim().length < 2) {
      setError('请填写退回原因，让信息员知道需要修正什么')
      return
    }
    const approval = await Taro.showModal({
      title: action === 'CONFIRM' ? '确认这份比赛报告？' : '退回给信息员？',
      content:
        action === 'CONFIRM'
          ? `将确认 v${latest?.version}，普通比分 ${scoreText(baseline)}。正式比分和比赛事件将在确认后更新。`
          : '已提交内容保留为历史版本，信息员可以按退回原因继续修改。',
      confirmText: action === 'CONFIRM' ? '确认报告' : '退回报告',
    })
    if (!approval.confirm) return
    await send(
      createSaveCommand(
        baseline,
        baseVersion,
        action,
        reviewReason,
        createClientActionId('report-review'),
        {
          homeRosterSnapshotId: workspace.homeTeam.rosterSnapshotId!,
          awayRosterSnapshotId: workspace.awayTeam.rosterSnapshotId!,
          ruleVersionId: workspace.ruleVersionId!,
        },
      ),
    )
  }

  async function send(command: SaveReportCommand) {
    if (inFlight.current) return
    if (readSession()?.accessToken !== actorToken) {
      setError('账号已切换，请重新进入比赛报告。原账号的草稿已保留。')
      return
    }
    // Persist the exact idempotent command before sending, including after a page reload.
    if (!persist(command.fields, command.reason, command, command.expectedVersion)) {
      setError('无法保存重试凭据，本次还没有发送。请检查本机存储后重试。')
      return
    }
    const requestGeneration = generation.current
    inFlight.current = true
    setBusy(true)
    setPending(command)
    setError('')
    try {
      let data = await gateway.save(matchId, command)
      const savedVersion = data.savedVersion ?? data.latest?.version
      // Idempotency can replay an earlier response after another editor saved a newer version.
      // Read the current head before making it the next editing baseline.
      try {
        const current = await gateway.load(matchId)
        if (current.latest && (!data.latest || current.latest.version >= data.latest.version))
          data = current
      } catch {
        /* The acknowledged save remains valid; the next CAS still protects it. */
      }
      if (
        !alive.current ||
        requestGeneration !== generation.current ||
        readSession()?.accessToken !== actorToken
      )
        return
      if (
        data.matchId !== matchId ||
        data.organizationId !== organizationId ||
        !data.latest ||
        data.latest.version <= command.expectedVersion
      )
        throw new Error('保存结果无法确认，请重试核对')
      setWorkspace(data)
      setFields(cloneFields(data.latest.fields))
      setBaseVersion(data.latest.version)
      setReason('')
      setCorrection(false)
      setReviewReason('')
      setPending(null)
      setConflict(false)
      setIssues([])
      const cleaned = removeDraft(key)
      setNotice(
        `已${command.action === 'SUBMIT' ? '提交审核' : command.action === 'CONFIRM' ? '确认报告' : command.action === 'RETURN' ? '退回报告' : command.action === 'CORRECT' ? '保存修正草稿' : '保存'} v${savedVersion} · ${clock(data.latest.savedAt)}${savedVersion !== data.latest.version ? `；当前最新为 v${data.latest.version}` : ''}${cleaned ? '' : '；本地清理失败，下次会再次核对保存结果'}`,
      )
      setHistory([])
      setSelectedVersion(null)
    } catch (cause) {
      if (!alive.current || requestGeneration !== generation.current) return
      const status = cause instanceof MatchReportError ? cause.status : 0
      setError(cause instanceof Error ? cause.message : '保存结果暂时无法确认，请重试')
      // 409/validation failures are definitive rejections. Network/5xx keep the exact command.
      if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
        setPending(null)
        persist(command.fields, command.reason, null, command.expectedVersion)
        if (status === 409) {
          setConflict(true)
          try {
            const current = await gateway.load(matchId)
            if (
              alive.current &&
              requestGeneration === generation.current &&
              current.organizationId === organizationId &&
              current.matchId === matchId
            )
              setWorkspace(current)
          } catch {
            setError('已检测到版本冲突，但最新版本读取失败。请点击「重读最新版本」。你的草稿仍在。')
          }
        } else if (status === 401 || status === 403) {
          setWorkspace((current) =>
            current
              ? {
                  ...current,
                  permissions: { ...current.permissions, canEdit: false, canSubmit: false },
                }
              : null,
          )
        }
      }
    } finally {
      inFlight.current = false
      if (alive.current) {
        setBusy(false)
        if (visible.current && refreshOnResume.current) {
          refreshOnResume.current = false
          void load()
        }
      }
    }
  }

  async function reconcile(keepDraft: boolean) {
    if (busy || inFlight.current) return
    setBusy(true)
    try {
      const data = await gateway.load(matchId)
      if (
        data.matchId !== matchId ||
        data.organizationId !== organizationId ||
        readSession()?.accessToken !== actorToken
      )
        throw new Error('账号或比赛已变化，请重新进入')
      if (keepDraft && (!data.permissions.canEdit || data.latest?.status === 'CONFIRMED'))
        throw new Error('当前版本不可继续编辑，请联系管理员处理修正')
      if (!keepDraft) {
        const result = await Taro.showModal({
          title: '使用最新已保存版本？',
          content: '这会放弃本次未保存改动。历史版本仍会保留。',
          confirmText: '使用最新',
        })
        if (!result.confirm) return
      }
      const nextFields = keepDraft ? fields : cloneFields(data.latest?.fields ?? emptyFields())
      const nextReason = keepDraft ? reason : ''
      setWorkspace(data)
      setFields(nextFields)
      setReason(nextReason)
      setBaseVersion(data.latest?.version ?? 0)
      setConflict(false)
      setError('')
      setIssues([])
      persist(nextFields, nextReason, null, data.latest?.version ?? 0)
      setNotice(
        keepDraft
          ? '你的改动已保留。请重新核对与最新版本的差异，再明确保存。'
          : '已载入最新保存版本。',
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '最新版本读取失败')
    } finally {
      setBusy(false)
    }
  }

  async function openHistory(more = false) {
    if (!workspace?.permissions.canViewHistory) return
    setHistoryOpen(true)
    setHistoryLoading(true)
    setHistoryError('')
    const requestGeneration = generation.current
    try {
      const page = await gateway.history(
        matchId,
        more ? (nextHistoryVersion ?? undefined) : undefined,
      )
      if (
        !alive.current ||
        requestGeneration !== generation.current ||
        readSession()?.accessToken !== actorToken
      )
        return
      setHistory((current) => (more ? [...current, ...page.items] : page.items))
      setNextHistoryVersion(page.nextBeforeVersion)
      if (!more) setSelectedVersion(page.items[0]?.version ?? null)
    } catch (cause) {
      if (alive.current && requestGeneration === generation.current)
        setHistoryError(cause instanceof Error ? cause.message : '历史版本读取失败')
    } finally {
      if (alive.current && requestGeneration === generation.current) setHistoryLoading(false)
    }
  }

  async function useRevision(revision: ReportRevision) {
    if (locked) return
    const result = await Taro.showModal({
      title: `将 v${revision.version} 带入本次录入？`,
      content: '当前未保存内容将被替换。历史和当前已保存版本不会改变；核对后保存才会新增版本。',
      confirmText: '带入录入',
    })
    if (result.confirm) {
      edit(cloneFields(revision.fields))
      editReason(`参照 v${revision.version} 核对修正`)
      persist(revision.fields, `参照 v${revision.version} 核对修正`, null)
      setHistoryOpen(false)
      setStep(2)
    }
  }

  if (loading) return <DataState kind="loading" title="正在读取比赛与录入权限" />
  if (loadError || !workspace)
    return (
      <DataState
        kind="error"
        title="比赛录入暂时不可用"
        description={loadError}
        onRetry={() => void load()}
      />
    )
  const selected = history.find((revision) => revision.version === selectedVersion)
  return (
    <div className="match-report">
      <div className="mr-heading">
        <div>
          <span className="mr-eyebrow">比赛信息录入</span>
          <span className="mr-title">
            {workspace.homeTeam.name} <span className="mr-versus">vs</span>{' '}
            {workspace.awayTeam.name}
          </span>
          <span className="mr-muted">{workspace.title}</span>
        </div>
        <Button
          className="mr-button mr-button--secondary"
          disabled={busy || !!pending}
          onClick={() => void cancel()}
        >
          取消录入
        </Button>
      </div>
      <div className="mr-version-bar">
        <span>
          {latest
            ? `当前 v${latest.version} · ${STATUS_LABELS[latest.status]} · ${clock(latest.savedAt)}`
            : '尚未保存报告'}
        </span>
        {workspace.permissions.canViewHistory && (
          <Button className="mr-link" disabled={busy} onClick={() => void openHistory()}>
            查看历史版本
          </Button>
        )}
      </div>
      {workspace.reviewNote && (
        <div className="mr-banner mr-banner--warning">
          <span>审核反馈：{workspace.reviewNote}</span>
        </div>
      )}
      {workspace.confirmedReportVersion && workspace.officialResult && (
        <div className="mr-banner">
          <span>
            正式比分 {workspace.officialResult.homeScore ?? '—'} :{' '}
            {workspace.officialResult.awayScore ?? '—'} · 确认版 v{workspace.confirmedReportVersion}
            {latest?.status !== 'CONFIRMED' ? '。本次录入尚未重新确认，正式结果仍保持此版本。' : ''}
          </span>
        </div>
      )}
      {missingContext && (
        <div className="mr-banner mr-banner--warning">
          需要双方锁定名单和已发布赛事规程才能保存。请先联系赛事管理员补齐。
        </div>
      )}
      {!workspace.permissions.canEdit && !correction && (
        <div className="mr-banner">
          <span>当前报告为只读。录入或修正需要赛事管理员授权。</span>
        </div>
      )}
      {workspace.permissions.canCorrect && !correction && (
        <div className="mr-panel">
          <span className="mr-panel-title">已确认结果需要修正？</span>
          <span className="mr-muted">
            修正先保存为新草稿。原正式比分会保留，重新提交并确认后才更新。
          </span>
          <Button
            className="mr-button mr-button--secondary"
            disabled={busy || !!pending}
            onClick={() => {
              setCorrection(true)
              setStep(0)
              setNotice('正在准备修正，请填写原因。原正式结果仍然保留。')
            }}
          >
            开始修正已确认结果
          </Button>
        </div>
      )}
      {(workspace.permissions.canConfirm || workspace.permissions.canReturn) && (
        <div className="mr-panel">
          <span className="mr-panel-title">审核已提交的报告</span>
          <ReportPreview fields={baseline} workspace={workspace} />
          <label className="mr-label" htmlFor="mr-review-reason">
            审核说明（退回时必填）
          </label>
          <textarea
            id="mr-review-reason"
            className="mr-textarea"
            maxLength={240}
            value={reviewReason}
            disabled={busy || !!pending}
            onChange={(event) => setReviewReason(event.currentTarget.value)}
          />
          <div className="mr-actions">
            {workspace.permissions.canReturn && (
              <Button
                className="mr-button mr-button--secondary"
                disabled={busy || !!pending || conflict}
                onClick={() => void review('RETURN')}
              >
                退回报告
              </Button>
            )}
            {workspace.permissions.canConfirm && (
              <Button
                className="mr-button mr-button--primary"
                disabled={busy || !!pending || conflict || missingContext}
                onClick={() => void review('CONFIRM')}
              >
                确认报告
              </Button>
            )}
          </div>
        </div>
      )}
      {notice && (
        <div className="mr-banner" aria-live="polite">
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="mr-banner mr-banner--error" role="alert">
          <span>{error}</span>
        </div>
      )}
      {pending && (
        <div className="mr-panel">
          <span className="mr-panel-title">确认上次保存结果</span>
          <span className="mr-muted">当前内容已保留。重试会核对同一次保存，不会重复创建版本。</span>
          <Button
            className="mr-button mr-button--primary"
            loading={busy}
            disabled={busy}
            onClick={() => void send(pending)}
          >
            重试确认保存
          </Button>
        </div>
      )}
      {conflict && (
        <div className="mr-panel mr-conflict">
          <span className="mr-panel-title">最新版本与本次草稿不同</span>
          <span>
            本次草稿基于 v{baseVersion}，当前已保存 v{latest?.version ?? 0}。
          </span>
          <Diff before={baseline} after={fields} />
          <div className="mr-actions">
            <Button
              className="mr-button mr-button--secondary"
              disabled={busy}
              onClick={() => void reconcile(false)}
            >
              放弃草稿，使用最新
            </Button>
            <Button
              className="mr-button mr-button--primary"
              disabled={busy}
              onClick={() => void reconcile(true)}
            >
              重读最新版本，保留草稿
            </Button>
          </div>
        </div>
      )}
      {historyOpen ? (
        <div className="mr-history">
          <div className="mr-section-heading">
            <div>
              <span className="mr-panel-title">已保存的历史版本</span>
              <span className="mr-muted">每次明确保存产生一个版本。输入草稿不会出现在这里。</span>
            </div>
            <Button
              className="mr-button mr-button--secondary"
              onClick={() => setHistoryOpen(false)}
            >
              返回本次录入
            </Button>
          </div>
          {historyLoading && <DataState kind="loading" title="正在读取历史版本" />}
          {historyError && (
            <DataState
              kind="error"
              title="历史读取失败"
              description={historyError}
              onRetry={() => void openHistory()}
            />
          )}
          {!historyLoading && !historyError && history.length === 0 && (
            <DataState
              kind="empty"
              title="还没有已保存的版本"
              description="首次保存后，可以在这里查看。"
            />
          )}
          {!historyLoading && !historyError && history.length > 0 && (
            <div className="mr-history-grid">
              <div className="mr-history-list">
                {history.map((revision) => (
                  <Button
                    key={revision.version}
                    className={`mr-history-item ${selectedVersion === revision.version ? 'is-selected' : ''}`}
                    onClick={() => setSelectedVersion(revision.version)}
                  >
                    <span>
                      v{revision.version} · {scoreText(revision.fields)}
                    </span>
                    <span>
                      {STATUS_LABELS[revision.status]} · {clock(revision.savedAt)}
                    </span>
                    <span>
                      {revision.savedBy} · {revision.reason || '无补充说明'}
                    </span>
                  </Button>
                ))}
                {nextHistoryVersion && (
                  <Button
                    className="mr-button mr-button--secondary"
                    disabled={historyLoading}
                    onClick={() => void openHistory(true)}
                  >
                    加载更早版本
                  </Button>
                )}
              </div>
              {selected && (
                <div className="mr-panel">
                  <span className="mr-panel-title">v{selected.version} · 只读预览</span>
                  <ReportPreview
                    fields={selected.fields}
                    workspace={{
                      ...workspace,
                      homeTeam: {
                        ...workspace.homeTeam,
                        players: selected.homePlayers ?? workspace.homeTeam.players,
                      },
                      awayTeam: {
                        ...workspace.awayTeam,
                        players: selected.awayPlayers ?? workspace.awayTeam.players,
                      },
                    }}
                  />
                  <span className="mr-panel-title">与当前已保存版本比较</span>
                  <Diff before={selected.fields} after={baseline} />
                  {!locked && (
                    <Button
                      className="mr-button mr-button--secondary"
                      onClick={() => void useRevision(selected)}
                    >
                      将此版本带入本次录入
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mr-steps" aria-label="录入步骤">
            {STEPS.map((label, index) => (
              <Button
                className={`mr-step ${step === index ? 'is-active' : ''}`}
                key={label}
                aria-pressed={step === index}
                onClick={() => setStep(index)}
              >
                <span className="mr-step-number">{index + 1}</span>
                <span>{label}</span>
              </Button>
            ))}
          </div>
          {step === 0 && (
            <div className="mr-panel">
              <span className="mr-panel-title">先确认比赛结果</span>
              <span className="mr-muted">比分必须填写。双方没有进球时，请明确填 0 : 0。</span>
              <Button
                className="mr-button mr-button--secondary"
                disabled={locked}
                onClick={() => edit({ ...fields, homeScore: '0', awayScore: '0' })}
              >
                填写 0 : 0
              </Button>
              <div className="mr-score-grid">
                <ScoreInput
                  side="主队"
                  team={workspace.homeTeam.name}
                  id="mr-homeScore"
                  value={fields.homeScore}
                  disabled={locked}
                  onChange={(homeScore) => edit({ ...fields, homeScore })}
                />
                <span className="mr-score-separator">:</span>
                <ScoreInput
                  side="客队"
                  team={workspace.awayTeam.name}
                  id="mr-awayScore"
                  value={fields.awayScore}
                  disabled={locked}
                  onChange={(awayScore) => edit({ ...fields, awayScore })}
                />
              </div>
              {workspace.isKnockout && fields.outcome === 'FINISHED' && (
                <div className="mr-penalties">
                  <span className="mr-label">
                    点球大战（普通比分持平时填写，点球不计入进球事件）
                  </span>
                  <div className="mr-event-fields">
                    <div>
                      <label className="mr-label" htmlFor="mr-homePenaltyScore">
                        主队点球
                      </label>
                      <input
                        id="mr-homePenaltyScore"
                        className="mr-input"
                        type="number"
                        value={fields.homePenaltyScore}
                        placeholder="没有点球时留空"
                        disabled={locked}
                        onChange={(event) =>
                          edit({ ...fields, homePenaltyScore: event.currentTarget.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="mr-label" htmlFor="mr-awayPenaltyScore">
                        客队点球
                      </label>
                      <input
                        id="mr-awayPenaltyScore"
                        className="mr-input"
                        type="number"
                        value={fields.awayPenaltyScore}
                        placeholder="没有点球时留空"
                        disabled={locked}
                        onChange={(event) =>
                          edit({ ...fields, awayPenaltyScore: event.currentTarget.value })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}
              <span className="mr-label">比赛结果</span>
              <div className="mr-options">
                {(Object.keys(OUTCOME_LABELS) as ReportFields['outcome'][]).map((outcome) => (
                  <Button
                    key={outcome}
                    className={`mr-option ${fields.outcome === outcome ? 'is-selected' : ''}`}
                    disabled={locked}
                    aria-pressed={fields.outcome === outcome}
                    onClick={() =>
                      edit({
                        ...fields,
                        outcome,
                        ...(outcome !== 'FINISHED'
                          ? { homePenaltyScore: '', awayPenaltyScore: '' }
                          : {}),
                      })
                    }
                  >
                    {OUTCOME_LABELS[outcome]}
                  </Button>
                ))}
              </div>
              {fields.outcome !== 'FINISHED' && (
                <span className="mr-warning-text">
                  请按实际赛事规程填写判定比分，并在核对页说明原因。
                </span>
              )}
            </div>
          )}
          {step === 1 && (
            <div className="mr-panel">
              <span className="mr-panel-title">补充比赛发生的事</span>
              <span className="mr-muted">
                先选择事件，再选球队、分钟和球员。球员来自本场锁定名单；换人需同时选择换下和换上球员。
              </span>
              <div className="mr-completeness">
                <span>比分 {scoreText(fields)}</span>
                <span>
                  进球明细 {counts.HOME} : {counts.AWAY}
                </span>
                <span>
                  {fields.outcome === 'FINISHED' &&
                  (String(counts.HOME) !== fields.homeScore ||
                    String(counts.AWAY) !== fields.awayScore)
                    ? '明细待补全，可先保存'
                    : '进球明细与比分一致'}
                </span>
              </div>
              <div className="mr-event-tools">
                {EVENT_KINDS.map((kind) => (
                  <Button
                    className="mr-button mr-button--secondary"
                    key={kind}
                    disabled={locked || fields.events.length >= 500}
                    onClick={() => addEvent(kind)}
                  >
                    + {EVENT_LABELS[kind]}
                  </Button>
                ))}
              </div>
              {fields.events.length === 0 && (
                <div className="mr-empty">
                  <span>还没有比赛事件</span>
                  <span>点击上方按钮添加。0 : 0 的比赛可以没有进球事件。</span>
                </div>
              )}
              {fields.events.map((event, index) => (
                <EventEditor
                  key={event.id}
                  event={event}
                  index={index}
                  workspace={workspace}
                  disabled={locked}
                  onChange={(patch) => patchEvent(event.id, patch)}
                  onRemove={() => void removeEvent(event)}
                />
              ))}
            </div>
          )}
          {step === 2 && (
            <div className="mr-panel">
              <span className="mr-panel-title">保存前，再核对一次</span>
              <ReportPreview fields={fields} workspace={workspace} />
              <span className="mr-panel-title">{latest ? '与上次保存相比' : '本次录入内容'}</span>
              <Diff before={baseline} after={fields} />
              <label className="mr-label" htmlFor="mr-reason">
                {latest
                  ? '修改原因（修改已有内容时必填）'
                  : fields.outcome === 'FINISHED'
                    ? '录入说明（选填）'
                    : '比赛判定原因（必填）'}
              </label>
              <textarea
                id="mr-reason"
                className="mr-textarea"
                value={reason}
                maxLength={240}
                disabled={locked}
                placeholder="例如：核对裁判记录，主队第二球被判无效"
                onChange={(event) => editReason(event.currentTarget.value)}
              />
              <label className="mr-label" htmlFor="mr-notes">
                比赛说明（选填）
              </label>
              <textarea
                id="mr-notes"
                className="mr-textarea"
                value={fields.notes}
                maxLength={800}
                disabled={locked}
                placeholder="补充现场情况或需要审核员关注的信息"
                onChange={(event) => edit({ ...fields, notes: event.currentTarget.value })}
              />
              {issues.length > 0 && (
                <div className="mr-validation" role="alert">
                  <span className="mr-panel-title">还有 {issues.length} 项需要核对</span>
                  {issues.map((issue, index) => (
                    <Button
                      className="mr-validation-item"
                      key={`${issue.field}-${index}`}
                      onClick={() => {
                        setStep(
                          issue.field.includes('Score') || issue.field === 'outcome'
                            ? 0
                            : issue.field.startsWith('event')
                              ? 1
                              : 2,
                        )
                      }}
                    >
                      {issue.message} →
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="mr-footer">
            <div>
              <span className="mr-footer-title">
                {busy
                  ? '正在保存，请稍候…'
                  : dirty
                    ? '本次改动尚未保存'
                    : latest
                      ? `已与 v${latest.version} 同步`
                      : '完成录入后明确保存'}
              </span>
              <span className="mr-muted">保存一个版本，之后可查看和比较。</span>
            </div>
            <div className="mr-actions">
              {step > 0 && (
                <Button
                  className="mr-button mr-button--secondary"
                  onClick={() => setStep(step - 1)}
                >
                  上一步
                </Button>
              )}
              {step < 2 ? (
                <Button className="mr-button mr-button--primary" onClick={() => setStep(step + 1)}>
                  下一步：{STEPS[step + 1]}
                </Button>
              ) : (
                <>
                  <Button
                    className="mr-button mr-button--secondary"
                    loading={busy}
                    disabled={locked || !dirty}
                    onClick={() => void save(correction ? 'CORRECT' : 'SAVE')}
                  >
                    {correction ? '保存修正草稿' : '保存版本'}
                  </Button>
                  {workspace.permissions.canSubmit && !correction && (
                    <Button
                      className="mr-button mr-button--primary"
                      loading={busy}
                      disabled={
                        locked ||
                        (!dirty &&
                          (latest?.status === 'SUBMITTED' || latest?.status === 'CONFIRMED'))
                      }
                      onClick={() => void save('SUBMIT')}
                    >
                      保存并提交审核
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ScoreInput({
  side,
  team,
  id,
  value,
  disabled,
  onChange,
}: {
  side: string
  team: string
  id: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="mr-score-team">
      <label htmlFor={id} className="mr-score-team-name">
        {team}
        <span>{side}比分</span>
      </label>
      <div className="mr-score-control">
        <Button
          className="mr-score-adjust"
          aria-label={`${side}比分减一`}
          disabled={disabled || !value || Number(value) <= 0}
          onClick={() => onChange(String(Number(value) - 1))}
        >
          −
        </Button>
        <input
          id={id}
          aria-label={`${side}比分`}
          type="number"
          maxLength={2}
          className="mr-score-input"
          placeholder="—"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <Button
          className="mr-score-adjust"
          aria-label={`${side}比分加一`}
          disabled={disabled || Number(value) >= 99}
          onClick={() => onChange(String(Number(value || '0') + 1))}
        >
          +
        </Button>
      </div>
    </div>
  )
}

function EventEditor({
  event,
  index,
  workspace,
  disabled,
  onChange,
  onRemove,
}: {
  event: ReportEvent
  index: number
  workspace: ReportWorkspace
  disabled: boolean
  onChange: (patch: Partial<ReportEvent>) => void
  onRemove: () => void
}) {
  const team = event.side === 'HOME' ? workspace.homeTeam : workspace.awayTeam
  const options = [{ id: '', displayName: '请选择球员', shirtNumber: null }, ...team.players]
  const range = options.map(
    (player) =>
      `${player.shirtNumber === null ? '' : player.shirtNumber + ' 号 · '}${player.displayName}`,
  )
  const id = `mr-event-${event.id}`
  return (
    <div className="mr-event" id={id}>
      <div className="mr-section-heading">
        <span className={`mr-event-kind mr-event-kind--${event.kind.toLowerCase()}`}>
          {index + 1} · {EVENT_LABELS[event.kind]}
        </span>
        <Button className="mr-link mr-link--danger" disabled={disabled} onClick={onRemove}>
          删除事件
        </Button>
      </div>
      <div className="mr-event-teams">
        {(['HOME', 'AWAY'] as Side[]).map((side) => (
          <Button
            className={`mr-option ${event.side === side ? 'is-selected' : ''}`}
            key={side}
            disabled={disabled}
            aria-pressed={event.side === side}
            onClick={() => onChange({ side, playerId: '', relatedPlayerId: '' })}
          >
            {side === 'HOME' ? workspace.homeTeam.name : workspace.awayTeam.name}
          </Button>
        ))}
      </div>
      <div className="mr-event-fields">
        <div>
          <label htmlFor={`${id}-minute`} className="mr-label">
            比赛分钟 *
          </label>
          <div className="mr-minute">
            <input
              id={`${id}-minute`}
              aria-label={`第${index + 1}条事件分钟`}
              className="mr-input"
              type="number"
              maxLength={3}
              placeholder="例如 45"
              value={event.minute}
              disabled={disabled}
              onChange={(input) => onChange({ minute: input.currentTarget.value })}
            />
            <span>+</span>
            <input
              id={`${id}-added`}
              aria-label={`第${index + 1}条事件补时`}
              className="mr-input"
              type="number"
              maxLength={2}
              placeholder="补时"
              value={event.addedMinute}
              disabled={disabled}
              onChange={(input) => onChange({ addedMinute: input.currentTarget.value })}
            />
          </div>
        </div>
        <div>
          <span className="mr-label">
            {event.kind === 'SUBSTITUTION'
              ? '换下球员 *'
              : event.kind === 'OWN_GOAL'
                ? '乌龙球球员 *'
                : '事件球员 *'}
          </span>
          <select
            className="mr-picker"
            aria-label={`第${index + 1}条事件球员`}
            value={event.playerId}
            disabled={disabled || !team.rosterSnapshotId}
            onChange={(input) => onChange({ playerId: input.currentTarget.value })}
          >
            {options.map((player, position) => (
              <option value={player.id} key={player.id}>
                {range[position]}
              </option>
            ))}
          </select>
        </div>
        {(event.kind === 'GOAL' || event.kind === 'SUBSTITUTION') && (
          <div>
            <span className="mr-label">
              {event.kind === 'GOAL' ? '助攻球员（选填）' : '换上球员 *'}
            </span>
            <select
              className="mr-picker"
              aria-label={`第${index + 1}条事件关联球员`}
              value={event.relatedPlayerId}
              disabled={disabled || !team.rosterSnapshotId}
              onChange={(input) => onChange({ relatedPlayerId: input.currentTarget.value })}
            >
              {options.map((player, position) => (
                <option value={player.id} key={player.id}>
                  {range[position]}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {!team.rosterSnapshotId && (
        <span className="mr-warning-text">该队名单尚未锁定，请联系赛事管理员。</span>
      )}
      {event.kind === 'OWN_GOAL' && (
        <span className="mr-muted">选择实际发生乌龙球的球员与球队，这球计入对方比分。</span>
      )}
    </div>
  )
}

function ReportPreview({
  fields,
  workspace,
}: {
  fields: ReportFields
  workspace: ReportWorkspace
}) {
  const players = new Map(
    [...workspace.homeTeam.players, ...workspace.awayTeam.players].map((player) => [
      player.id,
      player.displayName,
    ]),
  )
  return (
    <div className="mr-preview">
      <span className="mr-preview-score">{scoreText(fields)}</span>
      <span className="mr-muted">
        {OUTCOME_LABELS[fields.outcome]} · {fields.events.length} 条事件
      </span>
      {[...fields.events]
        .sort(
          (a, b) =>
            Number(a.minute) - Number(b.minute) || Number(a.addedMinute) - Number(b.addedMinute),
        )
        .map((event) => (
          <div className="mr-preview-event" key={event.id}>
            <span>
              {event.minute || '—'}
              {event.addedMinute ? '+' + event.addedMinute : ''}′
            </span>
            <span>
              {EVENT_LABELS[event.kind]} ·{' '}
              {event.side === 'HOME' ? workspace.homeTeam.name : workspace.awayTeam.name}
            </span>
            <span>
              {players.get(event.playerId) ?? '尚未选择球员'}
              {event.relatedPlayerId
                ? ` · ${event.kind === 'SUBSTITUTION' ? '换上' : '助攻'} ${players.get(event.relatedPlayerId) ?? '原名单球员'}`
                : ''}
            </span>
          </div>
        ))}
      {fields.notes && <span className="mr-preview-notes">{fields.notes}</span>}
    </div>
  )
}

function Diff({ before, after }: { before: ReportFields; after: ReportFields }) {
  const changes = describeChanges(before, after)
  return (
    <div className="mr-diff">
      {changes.length ? (
        changes.map((change) => <span key={change}>{change}</span>)
      ) : (
        <span>没有内容差异</span>
      )}
    </div>
  )
}
function clock(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}
