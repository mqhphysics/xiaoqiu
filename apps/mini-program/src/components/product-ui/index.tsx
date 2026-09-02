import { Button, Image, Text, View } from '@tarojs/components'
import type { BaseEventOrig } from '@tarojs/components/types/common'

import {
  formatDate,
  formatRelativeTime,
  formatTime,
  matchStatusLabel,
  matchStatusTone,
  verificationLabel,
} from '../../features/product/product.format'
import type { MatchSummary, PostSummary, TeamSummary } from '../../features/product/product.types'
import { resolveMediaUrl } from '../../features/product/product.repository'

import './index.scss'

export function TeamCrest({
  team,
  size = 'medium',
}: {
  team: TeamSummary | null
  size?: 'small' | 'medium' | 'large'
}) {
  const label = team ? team.shortName.slice(0, 2) : '待定'
  return (
    <Text
      className={`team-crest team-crest--${size}`}
      style={{
        backgroundColor: team?.primaryColor ?? '#8a948c',
        color: getContrastColor(team?.primaryColor),
      }}
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
}: {
  name: string
  color?: string | null
  avatarUrl?: string | null
  size?: 'small' | 'medium' | 'large'
}) {
  const source = resolveMediaUrl(avatarUrl)
  return source ? (
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
  post,
  onOpen,
  onLike,
  onMessageAuthor,
}: {
  post: PostSummary
  onOpen: () => void
  onLike?: () => void
  onMessageAuthor?: () => void
}) {
  const stopAndLike = (event: BaseEventOrig) => {
    event.stopPropagation()
    onLike?.()
  }
  const stopAndMessage = (event: BaseEventOrig) => {
    if (!onMessageAuthor) return
    event.stopPropagation()
    onMessageAuthor()
  }
  return (
    <View className="post-card" onClick={onOpen}>
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

function getContrastColor(color?: string | null): string {
  if (!color?.startsWith('#') || color.length !== 7) return '#ffffff'
  const red = Number.parseInt(color.slice(1, 3), 16)
  const green = Number.parseInt(color.slice(3, 5), 16)
  const blue = Number.parseInt(color.slice(5, 7), 16)
  return red * 0.299 + green * 0.587 + blue * 0.114 > 170 ? '#17231a' : '#ffffff'
}
