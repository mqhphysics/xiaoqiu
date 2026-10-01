import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useEffect } from 'react'
import { PublicShell } from '../../components/public-shell'
import { MatchReportWorkspace } from '../../features/match-report/MatchReportWorkspace'

export default function QuickReportPage() {
  useEffect(() => {
    void Taro.setNavigationBarTitle({ title: '比赛信息录入' })
  }, [])
  const matchId = getCurrentInstance().router?.params.matchId ?? ''
  const exit = () => {
    if (Taro.getCurrentPages().length > 1) void Taro.navigateBack()
    else
      void Taro.redirectTo({
        url: `/pages/readonly-match-detail/index?matchId=${encodeURIComponent(matchId)}`,
      })
  }
  return (
    <PublicShell active="schedule">
      <MatchReportWorkspace matchId={matchId} onExit={exit} />
    </PublicShell>
  )
}
