import Taro from '@tarojs/taro'
import { SelfPersonEditor } from './self-editor.h5'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PersonRequest, PersonHoverRequest } from '../../features/product/person-navigation.h5'
import { openPerson } from '../../features/product/person-navigation.h5'
import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import type { PublicPersonResponse } from '../../features/product/product.types'
import { identityBadgeKinds, identityLabels } from '../../features/product/identity-badges'
import { PostCard, UserAvatar } from '../product-ui'
import {
  PlayerProfile,
  PlayerActions,
  CompactStats,
  PersonHoverPreview,
} from '../player-overlay/index.h5'
import { VerificationBadge } from '../verification-badge/index.h5'
import { useOverlayFocus } from '../overlay-focus'
import { openMessaging } from '../messaging-drawer/index.h5'
import { PostIcon } from '../post-social/icons'
import cover from '../../assets/home-visual/home-campus-action.webp'
import './index.h5.scss'

const pending = new Map<string, Promise<PublicPersonResponse>>()
function usePerson(request: PersonRequest) {
  const [person, setPerson] = useState<PublicPersonResponse | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setPerson(null)
    setError('')
    const key = JSON.stringify([request.userId, request.tournamentId, readSession()?.user.id])
    let read = pending.get(key)
    if (!read) {
      read = productRepository
        .getPerson(request.userId, request.tournamentId)
        .finally(() => pending.delete(key))
      pending.set(key, read)
    }
    void read
      .then((data) => {
        if (active) setPerson(data)
      })
      .catch((issue) => {
        if (active) setError(issue instanceof Error ? issue.message : '人物资料读取失败')
      })
    return () => {
      active = false
    }
  }, [request.userId, request.tournamentId, reload])
  return { person, error, retry: () => setReload((value) => value + 1) }
}
function ReadState({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="player-read-state" role={error ? 'alert' : 'status'}>
      <h2>{error ? '人物资料暂时不可用' : '正在读取人物资料'}</h2>
      {error && (
        <>
          <p>{error}</p>
          <button type="button" className="player-button" onClick={retry}>
            重新加载
          </button>
        </>
      )}
    </div>
  )
}
function MessageAction({ person }: { person: PublicPersonResponse }) {
  const own = readSession()?.user.id === person.id
  return (
    <button
      type="button"
      className="player-button player-button--secondary"
      disabled={own || person.official}
      onClick={() => {
        if (!readSession()) {
          void Taro.showToast({ title: '登录后可以发消息', icon: 'none' })
          return
        }
        openMessaging(person)
      }}
    >
      <PostIcon name="comment" />
      {own ? '本人' : person.official ? '官方账号' : '发消息'}
    </button>
  )
}
export function PersonDialog({
  request,
  onClose,
}: {
  request: PersonRequest
  onClose: () => void
}) {
  const { person, error, retry } = usePerson(request)
  const [editing, setEditing] = useState(false)
  useOverlayFocus(true, '.person-dialog', onClose)
  return createPortal(
    <div
      className="player-scrim person-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="player-dialog person-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="人物资料"
        tabIndex={-1}
      >
        <button
          type="button"
          className="player-dialog__close"
          aria-label="关闭人物资料"
          onClick={onClose}
        >
          <PostIcon name="close" />
        </button>
        {person ? (
          person.player && request.mode !== 'coach' ? (
            <PlayerProfile
              player={{ ...person.player, displayName: person.displayName }}
              tournamentId={person.tournamentId}
              presentation={{
                verificationLevel: person.verificationLevel,
                roles: person.roles,
                official: person.official,
                messageUser: person.messageable ? person : null,
                posts: person.posts,
              }}
            />
          ) : (
            <>
              <header className="person-hero">
                <UserAvatar name={person.displayName} avatarUrl={person.avatarUrl} size="large" />
                <div>
                  <div className="person-hero__name">
                    <h1>{person.displayName}</h1>
                    <VerificationBadge
                      level={person.verificationLevel}
                      roles={person.roles}
                      official={person.official}
                      displayedKind={person.displayedBadgeKind}
                      userId={person.id}
                    />
                  </div>
                  <p>{person.bio || '还没有填写个人简介。'}</p>
                  {person.organizationName && <span>{person.organizationName}</span>}
                </div>
                <MessageAction person={person} />
              </header>
              {readSession()?.user.id === person.id && (
                <button
                  type="button"
                  className="own-profile-edit-button"
                  onClick={() => setEditing(true)}
                >
                  编辑个人信息
                </button>
              )}
              <div className="person-content">
                <div className="person-selection">动态与资料</div>
                <div className="player-profile-grid">
                  <section className="player-panel">
                    <div className="player-panel__head">
                      <h2>公开动态</h2>
                      <span>{person.tournamentName}</span>
                    </div>
                    {person.posts.length ? (
                      person.posts.map((post) => (
                        <PostCard
                          key={post.id}
                          post={post}
                          onOpen={() => {}}
                          onLike={() => void productRepository.setLike(post.id, !post.likedByMe)}
                        />
                      ))
                    ) : (
                      <div className="player-section-empty">
                        <strong>当前赛事还没有公开动态</strong>
                      </div>
                    )}
                  </section>
                  <section className="player-panel">
                    <div className="player-panel__head">
                      <h2>个人资料</h2>
                    </div>
                    <dl className="player-facts">
                      <div>
                        <dt>昵称</dt>
                        <dd>{person.displayName}</dd>
                      </div>
                      <div>
                        <dt>身份</dt>
                        <dd>
                          {identityBadgeKinds(
                            person.verificationLevel,
                            person.roles,
                            person.official,
                          )
                            .map((kind) => identityLabels[kind])
                            .join('、') || '普通用户'}
                        </dd>
                      </div>
                    </dl>
                    <p className="person-bio">{person.bio || '还没有填写个人简介。'}</p>
                  </section>
                </div>
              </div>
            </>
          )
        ) : (
          <ReadState error={error} retry={retry} />
        )}
      </section>
      {editing && (
        <SelfPersonEditor onClose={() => setEditing(false)} onChanged={() => void retry()} />
      )}
    </div>,
    document.body,
  )
}
export function PersonHoverCard({
  request,
  onEnter,
  onLeave,
  onClose,
}: {
  request: PersonHoverRequest
  onEnter: () => void
  onLeave: () => void
  onClose: () => void
}) {
  const { person, error, retry } = usePerson(request)
  const rect = request.anchor.getBoundingClientRect()
  const width = Math.min(358, window.innerWidth - 32)
  const left = Math.max(16, Math.min(rect.left - 20, window.innerWidth - width - 16))
  const height = person?.player ? 272 : 225
  const top =
    rect.bottom + height + 12 <= window.innerHeight
      ? rect.bottom + 12
      : Math.max(16, rect.top - height - 12)
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        onClose()
      }
    }
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        !event.target.closest('.person-hover-card') &&
        !request.anchor.contains(event.target)
      )
        onClose()
    }
    document.addEventListener('keydown', escape, true)
    document.addEventListener('pointerdown', outside)
    return () => {
      document.removeEventListener('keydown', escape, true)
      document.removeEventListener('pointerdown', outside)
    }
  }, [onClose, request.anchor])
  const player = person?.player
  return createPortal(
    <aside
      className="player-hover-card person-hover-card"
      aria-label="人物信息预览"
      style={{ left, top, width }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onLeave()
      }}
    >
      <div className="player-hover-card__cover">
        <img src={cover} alt="" />
      </div>
      {person ? (
        <PersonHoverPreview
          name={person.displayName}
          avatarUrl={person.avatarUrl}
          color={player?.profileColor}
          meta={
            player
              ? `${player.team?.name ?? '暂无球队'} · ${player.position === 'GOALKEEPER' ? '门将' : player.position === 'DEFENDER' ? '后卫' : player.position === 'MIDFIELDER' ? '中场' : '前锋'}${player.shirtNumber ? ` · ${player.shirtNumber}号` : ''}`
              : (person.organizationName ?? '校园社区成员')
          }
          verificationLevel={person.verificationLevel}
          roles={person.roles}
          official={person.official}
          displayedKind={person.displayedBadgeKind}
          userId={person.id}
          onOpen={() => void openPerson(person.id, person.tournamentId)}
          stats={player ? <CompactStats player={player} /> : undefined}
          actions={
            player ? (
              <PlayerActions player={player} messageUser={person.messageable ? person : null} />
            ) : (
              <div className="player-actions">
                <button
                  type="button"
                  className="player-button"
                  onClick={() => void openPerson(person.id, person.tournamentId)}
                >
                  查看资料
                </button>
                <MessageAction person={person} />
              </div>
            )
          }
        />
      ) : (
        <ReadState error={error} retry={retry} />
      )}
    </aside>,
    document.body,
  )
}
