import { ReportButton as Button } from './ReportButton'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { readSession } from '../product/session'
import { matchReportGateway } from './repository'
import type { ReportWorkspace } from './types'
import './index.scss'

export function MatchReportEntry({ matchId }: { matchId: string }) {
  const session = readSession()
  const token = session?.accessToken
  const candidate =
    session?.user.roles.some(({ role }) =>
      ['MATCH_REPORTER', 'TOURNAMENT_ADMIN', 'ORGANIZATION_ADMIN', 'PLATFORM_ADMIN'].includes(role),
    ) ?? false
  const [workspace, setWorkspace] = useState<ReportWorkspace | null>(null)
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setWorkspace(null)
    setMessage('')
    if (candidate)
      void matchReportGateway
        .load(matchId)
        .then((data) => {
          if (active) setWorkspace(data)
        })
        .catch((error: unknown) => {
          if (active) setMessage(error instanceof Error ? error.message : '报告入口暂时不可用')
        })
    return () => {
      active = false
    }
  }, [matchId, token, candidate, attempt])
  if (
    !candidate ||
    (workspace && !workspace.permissions.canEdit && !workspace.permissions.canViewHistory)
  )
    return null
  return (
    <div className="report-entry">
      <div>
        <span className="report-entry__title">比赛信息录入</span>
        <span className="report-entry__note">
          {message ||
            (workspace ? '比分、进球和红黄牌 · 保存后可查看历史版本' : '正在确认本场比赛权限…')}
        </span>
      </div>
      {message ? (
        <Button
          className="mr-button mr-button--secondary"
          onClick={() => setAttempt((value) => value + 1)}
        >
          重试入口
        </Button>
      ) : (
        <Button
          className="mr-button mr-button--primary"
          disabled={!workspace}
          onClick={() =>
            void Taro.navigateTo({
              url: `/pages/quick-report/index?matchId=${encodeURIComponent(matchId)}`,
            })
          }
        >
          {workspace?.permissions.canEdit
            ? workspace.latest
              ? '继续录入 / 修改'
              : '录入比赛信息'
            : '查看报告版本'}
        </Button>
      )}
    </div>
  )
}
