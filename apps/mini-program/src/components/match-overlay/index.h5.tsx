import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { OPEN_MATCH_EVENT } from '../../features/product/match-navigation.h5'
import { OPEN_TEAM_EVENT } from '../../features/product/team-navigation.h5'
import { OPEN_PLAYER_EVENT } from '../../features/product/player-navigation.h5'
import { OPEN_PERSON_EVENT } from '../../features/product/person-navigation.h5'
import { productRepository } from '../../features/product/product.repository'
import type { MatchExperienceResponse } from '../../features/product/product.types'
import type { MatchContent as MatchContentComponent } from '../../features/readonly-match/match-content.h5'
import {
  createMatchOverlayHistory,
  readMatchRequest,
  type MatchRequest,
} from '../../features/readonly-match/navigation.logic'
import { useOverlayFocus } from '../overlay-focus'
import './index.h5.scss'

const loadContent = () => import('../../features/readonly-match/match-content.h5')

export function MatchOverlayHost() {
  const [request, setRequest] = useState<MatchRequest | null>(null)
  const [close, setClose] = useState<() => void>(() => () => undefined)
  useEffect(() => {
    const owner = `match-${crypto.randomUUID()}`
    const navigation = createMatchOverlayHistory(window.history, owner, setRequest)
    setClose(() => navigation.close)
    const open = (event: Event) => {
      const next = readMatchRequest((event as CustomEvent<unknown>).detail)
      if (next) navigation.open(next)
    }
    window.addEventListener(OPEN_MATCH_EVENT, open)
    window.addEventListener(OPEN_TEAM_EVENT, navigation.routeChanged)
    window.addEventListener(OPEN_PLAYER_EVENT, navigation.routeChanged)
    window.addEventListener(OPEN_PERSON_EVENT, navigation.routeChanged)
    window.addEventListener('popstate', navigation.pop)
    window.addEventListener('hashchange', navigation.routeChanged)
    return () => {
      window.removeEventListener(OPEN_MATCH_EVENT, open)
      window.removeEventListener(OPEN_TEAM_EVENT, navigation.routeChanged)
      window.removeEventListener(OPEN_PLAYER_EVENT, navigation.routeChanged)
      window.removeEventListener(OPEN_PERSON_EVENT, navigation.routeChanged)
      window.removeEventListener('popstate', navigation.pop)
      window.removeEventListener('hashchange', navigation.routeChanged)
    }
  }, [])
  return request ? <MatchDialog key={request.matchId} request={request} onClose={close} /> : null
}

type State =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | {
      phase: 'ready'
      match: MatchExperienceResponse
      Content: typeof MatchContentComponent
    }

export function MatchDialog({ request, onClose }: { request: MatchRequest; onClose: () => void }) {
  const [state, setState] = useState<State>({ phase: 'loading' })
  const [retry, setRetry] = useState(0)
  const titleId = useId()
  const panelId = useId().replace(/:/g, '')
  useOverlayFocus(true, `#match-dialog-${panelId}`, onClose)
  useEffect(() => {
    let current = true
    setState({ phase: 'loading' })
    if (!request.matchId) {
      setState({ phase: 'failed', message: '缺少比赛参数。' })
      return
    }
    void Promise.all([productRepository.getMatch(request.matchId), loadContent()]).then(
      ([match, content]) => {
        if (current) setState({ phase: 'ready', match, Content: content.MatchContent })
      },
      (error: unknown) => {
        if (current)
          setState({
            phase: 'failed',
            message: error instanceof Error ? error.message : '比赛详情加载失败。',
          })
      },
    )
    return () => {
      current = false
    }
  }, [request.matchId, retry])
  return createPortal(
    <div
      className="match-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        id={`match-dialog-${panelId}`}
        className="match-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="match-dialog__bar">
          <h1 id={titleId}>比赛详情</h1>
          <button
            type="button"
            className="match-dialog__close"
            aria-label="关闭比赛详情"
            onClick={onClose}
          >
            关闭 <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="match-dialog__body">
          {state.phase === 'ready' ? (
            <state.Content
              match={state.match}
              onMatchUpdated={(match) =>
                setState((previous) =>
                  previous.phase === 'ready' ? { ...previous, match } : previous,
                )
              }
            />
          ) : (
            <div
              className="match-dialog__state"
              role={state.phase === 'failed' ? 'alert' : 'status'}
            >
              <h2>{state.phase === 'loading' ? '正在读取比赛详情' : '比赛详情不可用'}</h2>
              <p>{state.phase === 'failed' ? state.message : '正在获取比分、阵容和比赛事件。'}</p>
              {state.phase === 'failed' && (
                <button type="button" onClick={() => setRetry((value) => value + 1)}>
                  重试
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  )
}
