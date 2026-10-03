import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { readSession } from '../../features/product/session'
import { DesktopPostComposer } from '../post-composer'
import { Empty, TeamPost } from '../team-hub/content.h5'
import { TeamIcon } from '../team-hub/icons.h5'
import type { PlayerPostFeedProps } from './index'
import '../team-hub/index.h5.scss'

export function PlayerPostFeed({
  playerId,
  playerName,
  tournamentId,
  posts: initialPosts,
}: PlayerPostFeedProps) {
  const [posts, setPosts] = useState(initialPosts)
  const [composer, setComposer] = useState(false)
  useEffect(() => setPosts(initialPosts), [initialPosts])
  if (!window.matchMedia('(min-width: 721px)').matches) return null
  return (
    <section className="th-root th-surface player-post-feed" style={{ marginTop: 28 }}>
      <div className="th-heading">
        <h2>球员动态</h2>
        <button
          data-team-control
          type="button"
          className="th-soft-button"
          onClick={() => {
            if (!readSession()) {
              void Taro.showToast({ title: '登录后可以发布动态', icon: 'none' })
              return
            }
            setComposer(true)
          }}
        >
          <TeamIcon name="plus" />
          发布动态
        </button>
      </div>
      {posts.length ? (
        posts.map((post) => <TeamPost key={post.id} post={post} tournamentId={tournamentId} />)
      ) : (
        <Empty title="还没有相关动态" copy={`添加「${playerName}」球员标签的动态会在这里展示。`} />
      )}
      <DesktopPostComposer
        open={composer}
        tournamentId={tournamentId || undefined}
        initialTags={[{ kind: 'PLAYER', targetId: playerId, label: playerName }]}
        onClose={() => setComposer(false)}
        onPublished={(post) => {
          if (post.tags?.some((tag) => tag.kind === 'PLAYER' && tag.targetId === playerId))
            setPosts((current) => [post, ...current])
          else void Taro.showToast({ title: '动态已发布', icon: 'success' })
        }}
      />
    </section>
  )
}
