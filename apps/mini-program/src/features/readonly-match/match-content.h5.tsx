import { Text, Textarea, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { openTeam } from '../product/team-navigation'
import { PersonTrigger } from '../../components/person-trigger'
import { DataState } from '../../components/public-ui'
import { MatchStatus, ProductSection, TeamCrest, UserAvatar } from '../../components/product-ui'
import { openMessaging } from '../../components/messaging-drawer'
import { ReportModal } from '../../components/report-modal'
import { formatLongDate, formatRelativeTime, formatTime } from '../product/product.format'
import { productRepository } from '../product/product.repository'
import { readSession } from '../product/session'
import { MatchReportEntry } from '../match-report/MatchReportEntry'
import type { MatchExperienceResponse } from '../product/product.types'
import { LineupsPanel, EventsPanel } from './panels.h5'
import './match-content.h5.scss'

type DetailTab = 'ratings' | 'events' | 'lineups'
export function MatchContent({
  match,
  onMatchUpdated,
}: {
  match: MatchExperienceResponse
  onMatchUpdated: (match: MatchExperienceResponse) => void
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>('ratings')
  const [rating, setRating] = useState(match.reviews.viewerReview?.rating ?? 0)
  const [reviewBody, setReviewBody] = useState(match.reviews.viewerReview?.body ?? '')
  const [submitting, setSubmitting] = useState(false)
  const hasScore = match.homeScore !== null && match.awayScore !== null
  const isFinished = match.status === 'FINISHED' || match.status === 'CONFIRMED'

  useEffect(() => {
    setRating(match.reviews.viewerReview?.rating ?? 0)
    setReviewBody(match.reviews.viewerReview?.body ?? '')
  }, [match.id, match.reviews.viewerReview])

  const submitReview = async () => {
    if (!isFinished || submitting) return
    if (!readSession()) {
      await Taro.showToast({ title: '登录后可以评分', icon: 'none' })
      await Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    if (rating < 1) {
      await Taro.showToast({ title: '请先选择 1 至 5 星', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      const updated = await productRepository.reviewMatch(match.id, rating, reviewBody)
      onMatchUpdated(updated)
      await Taro.showToast({ title: '评分已保存', icon: 'success' })
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '评分提交失败',
        icon: 'none',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View>
      <View className="experience-match-header">
        <View className="experience-match-header__meta">
          <Text>
            {match.stageName ?? '赛事'} · {match.roundName ?? match.title}
          </Text>
          <MatchStatus status={match.status} />
        </View>
        <Text className="experience-match-header__date">
          {formatLongDate(match.scheduledStartAt)} {formatTime(match.scheduledStartAt)}
        </Text>
        <Text className="experience-match-header__venue">{match.venue?.name ?? '场地待定'}</Text>

        <View className="experience-scoreboard">
          <TeamSide
            team={match.homeTeam}
            placeholder={match.homePlaceholder}
            tournamentId={match.tournamentId}
          />
          <View className="experience-scoreboard__score">
            <Text>{hasScore ? `${match.homeScore} : ${match.awayScore}` : 'VS'}</Text>
            {(match.homePenaltyScore !== null || match.awayPenaltyScore !== null) && (
              <Text>
                点球 {match.homePenaltyScore ?? 0} : {match.awayPenaltyScore ?? 0}
              </Text>
            )}
          </View>
          <TeamSide
            team={match.awayTeam}
            placeholder={match.awayPlaceholder}
            tournamentId={match.tournamentId}
          />
        </View>
      </View>

      <MatchReportEntry matchId={match.id} />

      {(match.summary || match.statusReason) && (
        <View className="match-summary surface">
          <Text className="match-summary__label">
            {match.statusReason ? '比赛说明' : '比赛战报'}
          </Text>
          <Text className="match-summary__body">{match.statusReason ?? match.summary}</Text>
          {match.attendance !== null && (
            <Text className="match-summary__attendance">现场观众 {match.attendance} 人</Text>
          )}
        </View>
      )}

      <View className="match-detail-tabs">
        <TabButton
          active={activeTab === 'ratings'}
          label="评分与评论"
          note={match.reviews.ratingCount > 0 ? String(match.reviews.ratingCount) : undefined}
          onClick={() => setActiveTab('ratings')}
        />
        <TabButton
          active={activeTab === 'events'}
          label="比赛事件"
          note={match.events.length > 0 ? String(match.events.length) : undefined}
          onClick={() => setActiveTab('events')}
        />
        <TabButton
          active={activeTab === 'lineups'}
          label="双方阵容"
          onClick={() => setActiveTab('lineups')}
        />
      </View>

      {activeTab === 'ratings' && (
        <RatingsPanel
          body={reviewBody}
          isFinished={isFinished}
          match={match}
          rating={rating}
          submitting={submitting}
          onBodyChange={setReviewBody}
          onRatingChange={setRating}
          onSubmit={() => void submitReview()}
        />
      )}

      {activeTab === 'events' && <EventsPanel match={match} />}
      {activeTab === 'lineups' && <LineupsPanel match={match} />}
    </View>
  )
}

function RatingsPanel({
  match,
  rating,
  body,
  isFinished,
  submitting,
  onRatingChange,
  onBodyChange,
  onSubmit,
}: {
  match: MatchExperienceResponse
  rating: number
  body: string
  isFinished: boolean
  submitting: boolean
  onRatingChange: (rating: number) => void
  onBodyChange: (body: string) => void
  onSubmit: () => void
}) {
  const session = readSession()
  const [reportId, setReportId] = useState<string | null>(null)
  return (
    <View className="ratings-layout match-tab-content">
      <View className="rating-overview surface">
        <View className="rating-overview__score">
          <Text>{match.reviews.averageRating?.toFixed(1) ?? '-'}</Text>
          <Text>{renderStars(Math.round(match.reviews.averageRating ?? 0))}</Text>
          <Text>{match.reviews.ratingCount} 人评分</Text>
        </View>
        <View className="rating-form">
          <Text className="rating-form__title">
            {!isFinished
              ? '赛后开放评分'
              : session
                ? match.reviews.viewerReview
                  ? '更新我的评分'
                  : '为这场比赛评分'
                : '登录后参与评分'}
          </Text>
          <View className="rating-stars" aria-label="选择星级">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                type="button"
                aria-label={`${value} 星`}
                className={value <= rating ? 'rating-star rating-star--active' : 'rating-star'}
                disabled={!isFinished}
                key={value}
                onClick={() => onRatingChange(value)}
              >
                ★
              </button>
            ))}
          </View>
          <Textarea
            className="rating-form__textarea"
            disabled={!isFinished}
            maxlength={500}
            placeholder={
              isFinished ? '说说这场比赛的节奏、表现或现场体验（可选）' : '比赛结束后可评论'
            }
            value={body}
            onInput={(event) => onBodyChange(event.detail.value)}
          />
          <button
            type="button"
            className="button button--primary rating-form__submit"
            disabled={!isFinished || rating < 1 || submitting}
            aria-busy={submitting}
            onClick={onSubmit}
          >
            {session ? '保存评分' : '登录后评分'}
          </button>
        </View>
      </View>

      <View className="match-review-section">
        <ProductSection
          kicker="MATCH REVIEWS"
          title="观赛评论"
          note={`${match.reviews.comments.length} 条`}
        />
        {match.reviews.comments.length === 0 ? (
          <DataState kind="empty" title={isFinished ? '还没有评论，来写第一条' : '比赛尚未开始'} />
        ) : (
          <View className="match-review-list">
            {match.reviews.comments.map((review) => (
              <View className="match-review surface" key={review.id}>
                <UserAvatar
                  avatarUrl={review.author.avatarUrl}
                  name={review.author.displayName}
                  userId={review.author.id}
                  size="small"
                />
                <View className="match-review__copy">
                  <View className="match-review__heading">
                    <PersonTrigger userId={review.author.id} name={review.author.displayName}>
                      <Text>{review.author.displayName}</Text>
                    </PersonTrigger>
                    <Text>{renderStars(review.rating)}</Text>
                    <Text>{formatRelativeTime(review.createdAt)}</Text>
                  </View>
                  <Text className="match-review__body">{review.body}</Text>
                  {session && (
                    <View className="match-review__actions">
                      {review.author.messageable && (
                        <button
                          type="button"
                          onClick={() =>
                            openMessaging({
                              id: review.author.id,
                              displayName: review.author.displayName,
                              avatarUrl: review.author.avatarUrl,
                            })
                          }
                        >
                          私聊
                        </button>
                      )}
                      <button type="button" onClick={() => setReportId(review.id)}>
                        投诉
                      </button>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
      {reportId && (
        <ReportModal
          targetId={reportId}
          targetType="MATCH_REVIEW"
          title="投诉这条观赛评论"
          onClose={() => setReportId(null)}
        />
      )}
    </View>
  )
}

function TabButton({
  label,
  note,
  active,
  onClick,
}: {
  label: string
  note?: string | undefined
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={active ? 'match-detail-tab match-detail-tab--active' : 'match-detail-tab'}
      onClick={onClick}
    >
      <Text>{label}</Text>
      {note && <Text>{note}</Text>}
    </button>
  )
}

function renderStars(value: number): string {
  return `${'★'.repeat(Math.max(0, Math.min(5, value)))}${'☆'.repeat(Math.max(0, 5 - value))}`
}

function TeamSide({
  team,
  placeholder,
  tournamentId,
}: {
  team: MatchExperienceResponse['homeTeam']
  placeholder: string | null | undefined
  tournamentId: string
}) {
  return (
    <button
      type="button"
      className={`experience-scoreboard__team ${team ? 'experience-scoreboard__team--linked' : ''}`}
      disabled={!team}
      aria-label={team ? `查看${team.name}球队资料` : (placeholder ?? '席位待定')}
      data-match-resource="team"
      onClick={() =>
        team &&
        void (getCurrentInstance().router?.path.includes('readonly-match-detail')
          ? Taro.navigateTo({
              url: `/pages/readonly-team-detail/index?teamId=${encodeURIComponent(team.id)}&tournamentId=${encodeURIComponent(tournamentId)}`,
            })
          : openTeam(team.id, tournamentId))
      }
    >
      <TeamCrest team={team} size="large" />
      <Text>{team?.name ?? placeholder ?? '席位待定'}</Text>
    </button>
  )
}
