import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { productRepository } from '../../features/product/product.repository'
import { positionLabel } from '../../features/product/product.format'
import type { PlayerFollowsResponse, SearchResponse } from '../../features/product/product.types'
import { UserAvatar } from '../product-ui'
import { useOverlayFocus } from '../overlay-focus'
import { Empty } from './content.h5'
import { TeamIcon } from './icons.h5'

export function PlayerPicker({
  follows,
  onChange,
  onClose,
  tournamentId,
}: {
  follows: PlayerFollowsResponse
  onChange: (value: PlayerFollowsResponse) => void
  onClose: () => void
  tournamentId: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResponse['players']>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const locked = useRef(false)
  const close = () => {
    if (!locked.current) onClose()
  }
  useOverlayFocus(true, '.th-player-picker', close)
  useEffect(() => {
    let active = true
    setError('')
    if (!query.trim()) {
      setLoading(false)
      setResults([])
      return
    }
    setLoading(true)
    const timer = window.setTimeout(() => {
      void productRepository
        .search(query, 'PLAYER', tournamentId)
        .then((data) => {
          if (active) setResults(data.players)
        })
        .catch((issue) => {
          if (active) setError(issue instanceof Error ? issue.message : '球员搜索失败')
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [query, tournamentId])
  const toggle = async (id: string) => {
    if (locked.current) return
    locked.current = true
    setBusy(id)
    setError('')
    try {
      onChange(
        await (follows.items.some((player) => player.id === id)
          ? productRepository.unfollowPlayer(id)
          : productRepository.followPlayer(id)),
      )
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '关注操作失败')
    } finally {
      locked.current = false
      setBusy(null)
    }
  }
  const visible = query.trim() ? results : follows.items
  return createPortal(
    <div
      className="th-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <section
        className="th-picker th-player-picker th-root"
        role="dialog"
        aria-modal="true"
        aria-labelledby="th-player-picker-title"
      >
        <div className="th-heading">
          <h2 id="th-player-picker-title">关注校园球员</h2>
          <button
            data-team-control
            type="button"
            className="th-icon-button"
            aria-label="关闭球员选择"
            disabled={Boolean(busy)}
            onClick={close}
          >
            <TeamIcon name="close" />
          </button>
        </div>
        <label className="th-search">
          <TeamIcon name="search" />
          <input
            data-team-control
            aria-label="搜索球员"
            placeholder="搜索球员姓名或球衣名"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="th-picker__summary">
          {query.trim() ? (loading ? '正在搜索…' : '搜索结果') : '我关注的球员'}
        </div>
        {error ? (
          <p className="th-inline-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="th-picker__list">
          {!loading
            ? visible.map((player) => (
                <div className="th-player-result" key={player.id}>
                  <UserAvatar name={player.displayName} avatarUrl={player.avatarUrl} />
                  <span>
                    <strong>{player.displayName}</strong>
                    <small>
                      {positionLabel(player.position)} · {player.team?.name ?? '球队未登记'}
                    </small>
                  </span>
                  <button
                    data-team-control
                    type="button"
                    className="th-soft-button"
                    disabled={Boolean(busy)}
                    onClick={() => void toggle(player.id)}
                  >
                    {busy === player.id
                      ? '保存中…'
                      : follows.items.some((item) => item.id === player.id)
                        ? '取消关注'
                        : '关注'}
                  </button>
                </div>
              ))
            : null}
          {!loading && !visible.length ? (
            <Empty
              title={query.trim() ? '没有找到对应球员' : '还没有关注球员'}
              copy="在上方输入姓名或球队，找到你关注的球员。"
            />
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  )
}
