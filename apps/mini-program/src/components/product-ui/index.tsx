import { Button, Image, Text, View } from '@tarojs/components'
import type { BaseEventOrig } from '@tarojs/components/types/common'
import Taro from '@tarojs/taro'
import { useRef, useState } from 'react'

import {
  formatDate,
  formatRelativeTime,
  formatTime,
  matchStatusLabel,
  matchStatusTone,
  verificationLabel,
} from '../../features/product/product.format'
import type { MatchSummary, PostSummary, TeamSummary } from '../../features/product/product.types'
import { demoCrestUrl } from '../../features/product/demo-media'
import { productRepository, resolveMediaUrl } from '../../features/product/product.repository'
import { openPost, updatePostInteraction, usePostInteraction } from '../../features/product/post-navigation'
import { readSession } from '../../features/product/session'
import { PlayerTrigger } from '../player-trigger'

import './index.scss'

export function TeamCrest({
  team,
  size = 'medium',
}: {
  team: TeamSummary | null
  size?: 'small' | 'medium' | 'large'
}) {
  const label = team ? team.shortName.slice(0, 2) : '待定'
  const crestPath = team?.crestUrl?.includes('/api/media/demo/crests/')
    ? demoCrestUrl(team.teamCode)
    : (team?.crestUrl ?? (team ? demoCrestUrl(team.teamCode) : null))
  const source = resolveMediaUrl(crestPath)
  if (source) {
    return (
      <Image
        aria-label={`${team?.name ?? '球队'}队徽`}
        className={`team-crest team-crest--${size}`}
        mode="aspectFit"
        src={source}
      />
    )
  }
  return (
    <Text
      aria-label={team ? `${team.name}队徽待上传` : '球队待定'}
      className={`team-crest team-crest--${size} team-crest--fallback`}
      style={{ backgroundColor: team?.primaryColor ?? '#8a948c' }}
    >
      {label}
    </Text>
  )
}

export function UserAvatar({
  name,
  color,
  avatarUrl,
  size = 'medium',
  playerId,
  tournamentId,
}: {
  name: string
  color?: string | null
  avatarUrl?: string | null
  size?: 'small' | 'medium' | 'large'
  playerId?: string
  tournamentId?: string
}) {
  const source = resolveMediaUrl(avatarUrl)
  const avatar = source ? (
    <Image
      aria-label={`${name}的头像`}
      className={`user-avatar user-avatar--${size}`}
      mode="aspectFill"
      src={source}
    />
  ) : (
    <Text
      className={`user-avatar user-avatar--${size}`}
      style={{ backgroundColor: color ?? avatarColor(name) }}
    >
      {name.slice(0, 1)}
    </Text>
  )
  return playerId ? (
    <PlayerTrigger playerId={playerId} {...(tournamentId ? { tournamentId } : {})} name={name}>
      {avatar}
    </PlayerTrigger>
  ) : avatar
}

export function MatchStatus({ status }: { status: MatchSummary['status'] }) {
  return (
    <Text className={`match-status match-status--${matchStatusTone(status)}`}>
      {status === 'LIVE' && <Text className="match-status__dot" />}
      {matchStatusLabel(status)}
    </Text>
  )
}

export function MatchCard({ match, onClick }: { match: MatchSummary; onClick?: () => void }) {
  const hasScore = match.homeScore !== null && match.awayScore !== null
  return (
    <View className="product-match-card" {...(onClick ? { onClick } : {})}>
      <View className="product-match-card__head">
        <Text className="product-match-card__meta">
          {match.title} · {formatDate(match.scheduledStartAt)} {formatTime(match.scheduledStartAt)}
        </Text>
        <MatchStatus status={match.status} />
      </View>
      <View className="product-match-card__team">
        <TeamCrest team={match.homeTeam} size="small" />
        <Text className="product-match-card__name">
          {match.homeTeam?.name ?? match.homePlaceholder ?? '主队待定'}
        </Text>
        <Text className="product-match-card__score">{hasScore ? match.homeScore : '-'}</Text>
      </View>
      <View className="product-match-card__team">
        <TeamCrest team={match.awayTeam} size="small" />
        <Text className="product-match-card__name">
          {match.awayTeam?.name ?? match.awayPlaceholder ?? '客队待定'}
        </Text>
        <Text className="product-match-card__score">{hasScore ? match.awayScore : '-'}</Text>
      </View>
      <Text className="product-match-card__venue">{match.venue?.name ?? '场地待定'}</Text>
    </View>
  )
}

export function PostCard({
  post: originalPost,
  onOpen,
  onLike,
  onMessageAuthor,
  variant,
}: {
  post: PostSummary
  onOpen: () => void
  onLike?: () => void
  onMessageAuthor?: () => void
  variant?: 'home'
}) {
  const post = usePostInteraction(originalPost)
  const open = () => {
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB && window.matchMedia('(min-width: 721px)').matches) void openPost(post.id)
    else onOpen()
  }
  const [imageFailed, setImageFailed] = useState(false)
  const likePending = useRef(false)
  const imageUrl = variant === 'home' && !imageFailed ? resolveMediaUrl(post.imageUrl) : undefined
  const stopAndLike = (event: BaseEventOrig) => {
    event.stopPropagation()
    if (Taro.getEnv() !== Taro.ENV_TYPE.WEB || !window.matchMedia('(min-width: 721px)').matches) { onLike?.(); return }
    if (likePending.current) return
    if (!readSession()) {
      void Taro.showToast({ title: '登录后可以点赞', icon: 'none' })
      return
    }
    likePending.current = true
    void productRepository.setLike(post.id, !post.likedByMe).then(result => {
      updatePostInteraction({ ...post, likedByMe: result.liked, likeCount: result.likeCount })
    }).catch(issue => {
      void Taro.showToast({ title: issue instanceof Error ? issue.message : '点赞失败，请重试', icon: 'none' })
    }).finally(() => { likePending.current = false })
  }
  const stopAndMessage = (event: BaseEventOrig) => {
    if (!onMessageAuthor) return
    event.stopPropagation()
    onMessageAuthor()
  }
  return (
    <View
      className={`post-card ${variant === 'home' ? 'post-card--home' : ''} ${imageUrl ? 'post-card--with-image' : ''}`}
      onClick={open}
    >
      <View className="post-card__author">
        <UserAvatar avatarUrl={post.author.avatarUrl} name={post.author.displayName} size="small" />
        <View className="post-card__identity">
          <View className="post-card__name-row">
            <Text className="post-card__name">{post.author.displayName}</Text>
            <Text className="post-card__verified">
              {verificationLabel(post.author.verificationLevel)}
            </Text>
          </View>
          <Text className="post-card__time">{formatRelativeTime(post.publishedAt)}</Text>
        </View>
        {onMessageAuthor && (
          <Button
            aria-label={`私聊${post.author.displayName}`}
            className="post-card__message-author"
            onClick={stopAndMessage}
          >
            私聊
          </Button>
        )}
      </View>
      {imageUrl && (
        <Image
          aria-label={post.title ?? '动态配图'}
          className="post-card__image"
          mode="aspectFill"
          src={imageUrl}
          onError={() => setImageFailed(true)}
          onClick={(event) => {
            event.stopPropagation()
            if (Taro.getEnv() === Taro.ENV_TYPE.WEB && window.matchMedia('(min-width: 721px)').matches) open()
            else void Taro.previewImage({ urls: [imageUrl], current: imageUrl })
          }}
        />
      )}
      {Taro.getEnv() === Taro.ENV_TYPE.WEB && (post.imageUrls?.length ?? 0) > 1 && <Text className="post-card__album-count">{post.imageUrls!.length} 张</Text>}
      {post.title && <Text className="post-card__title">{post.title}</Text>}
      <Text className="post-card__body">{post.body}</Text>
      <View className="post-card__actions">
        <Button
          aria-label={`${post.likedByMe ? '取消点赞' : '点赞'}，当前 ${post.likeCount} 赞`}
          aria-pressed={post.likedByMe}
          className={`post-card__action ${post.likedByMe ? 'post-card__action--active' : ''}`}
          disabled={!onLike}
          onClick={stopAndLike}
        >
          <Text className="post-card__action-icon">{post.likedByMe ? '♥' : '♡'}</Text>
          <Text>{post.likeCount}</Text>
        </Button>
        <Text
          aria-label={`评论 ${post.commentCount} 条`}
          className="post-card__action post-card__action--plain"
        >
          <Text className="post-card__comment-icon" />
          <Text>{post.commentCount}</Text>
        </Text>
        <Text className="post-card__open">查看详情</Text>
      </View>
    </View>
  )
}

export function ProductSection({
  kicker,
  title,
  note,
  actionLabel,
  onAction,
}: {
  kicker: string
  title: string
  note?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <View className="product-section-heading">
      <View>
        <Text className="product-section-heading__kicker">{kicker}</Text>
        <Text className="product-section-heading__title">{title}</Text>
      </View>
      {onAction && actionLabel ? (
        <Button className="product-section-heading__action" onClick={onAction}>
          {actionLabel} →
        </Button>
      ) : (
        note && <Text className="product-section-heading__note">{note}</Text>
      )}
    </View>
  )
}

function avatarColor(name: string): string {
  const colors = ['#1f6b45', '#9b4034', '#2f648f', '#6f4a91', '#a36b20']
  let hash = 0
  for (const character of name) hash += character.charCodeAt(0)
  return colors[hash % colors.length] ?? colors[0]!
}
