import { Button, Text, View } from '@tarojs/components'
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

import './index.scss'

export function TeamCrest({ team, size = 'medium' }: { team: TeamSummary | null; size?: 'small' | 'medium' | 'large' }) {
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

export function UserAvatar({ name, color, size = 'medium' }: { name: string; color?: string | null; size?: 'small' | 'medium' | 'large' }) {
  return (
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
}: {
  post: PostSummary
  onOpen: () => void
  onLike?: () => void
}) {
  const stopAndLike = (event: BaseEventOrig) => {
    event.stopPropagation()
    onLike?.()
  }
  return (
    <View className="post-card" onClick={onOpen}>
      <View className="post-card__author">
        <UserAvatar name={post.author.displayName} size="small" />
        <View className="post-card__identity">
          <View className="post-card__name-row">
            <Text className="post-card__name">{post.author.displayName}</Text>
            <Text className="post-card__verified">
              {verificationLabel(post.author.verificationLevel)}
            </Text>
          </View>
          <Text className="post-card__time">{formatRelativeTime(post.publishedAt)}</Text>
        </View>
      </View>
      {post.title && <Text className="post-card__title">{post.title}</Text>}
      <Text className="post-card__body">{post.body}</Text>
      <View className="post-card__actions">
        <Button
          className={`post-card__action ${post.likedByMe ? 'post-card__action--active' : ''}`}
          disabled={!onLike}
          onClick={stopAndLike}
        >
          {post.likedByMe ? '已赞' : '赞'} {post.likeCount}
        </Button>
        <Text className="post-card__action post-card__action--plain">评论 {post.commentCount}</Text>
        <Text className="post-card__open">查看详情</Text>
      </View>
    </View>
  )
}

export function ProductSection({
  kicker,
  title,
  note,
}: {
  kicker: string
  title: string
  note?: string
}) {
  return (
    <View className="product-section-heading">
      <View>
        <Text className="product-section-heading__kicker">{kicker}</Text>
        <Text className="product-section-heading__title">{title}</Text>
      </View>
      {note && <Text className="product-section-heading__note">{note}</Text>}
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
