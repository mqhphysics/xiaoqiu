import { TextDisclosure } from '../../components/interactions/text-disclosure.h5'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { openTeam } from '../product/team-navigation'
import { PersonTrigger } from '../../components/person-trigger'
import { DataState } from '../../components/public-ui'
import { MatchStatus, ProductSection, TeamCrest, UserAvatar } from '../../components/product-ui'
import { openMessaging } from '../../components/messaging-drawer'
import { ReportModal } from '../../components/report-modal'
import { formatLongDate, formatRelativeTime, formatTime } from '../product/product.format'
import { productRepository, resolveMediaUrl } from '../product/product.repository'
import { readSession } from '../product/session'
import { openPost } from '../product/post-navigation'
import { InlineEventEditor, MatchChangeRequest } from '../match-report/inline-editor.h5'
import type { InlineReportController } from '../match-report/use-inline-report.h5'
import type { MatchExperienceResponse } from '../product/product.types'
import { LineupsPanel, EventsPanel } from './panels.h5'
import { EmojiPicker, insertAtCursor } from '../../components/post-social/emoji-picker'
import '../../components/post-social/index.h5.scss'
import './match-content.h5.scss'

type DetailTab = 'ratings' | 'events' | 'lineups'
export function MatchContent({
  match,
  onMatchUpdated,
  editor,
}: {
  match: MatchExperienceResponse
  onMatchUpdated: (match: MatchExperienceResponse) => void
  editor?: InlineReportController
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>('ratings')
  const wasEditing = useRef(false)
  useEffect(() => {
    if (wasEditing.current && !editor?.editing) setActiveTab('events')
    wasEditing.current = editor?.editing ?? false
  }, [editor?.editing])
  const [rating, setRating] = useState(match.reviews.viewerReview?.rating ?? 0)
  const [reviewBody, setReviewBody] = useState(match.reviews.viewerReview?.body ?? '')
  const [submitting, setSubmitting] = useState(false)
  const hasScore = match.homeScore !== null && match.awayScore !== null
  const isFinished = match.status === 'FINISHED' || match.status === 'CONFIRMED'

  useEffect(() => {
    setRating(match.reviews.viewerReview?.rating ?? 0)
    setReviewBody(match.reviews.viewerReview?.body ?? '')
  }, [match.id])

  const submitReview = async (kind: 'rating' | 'comment') => {
    if (!isFinished || submitting) return false
    if (!readSession()) {
      await Taro.showToast({ title: '登录后可以评分', icon: 'none' })
      await Taro.reLaunch({ url: '/pages/login/index' })
      return false
    }
    if (kind === 'rating' && (rating < 1 || (match.reviews.viewerReview?.rating ?? 0) > 0)) {
      await Taro.showToast({ title: '请先选择 1 至 5 星', icon: 'none' })
      return false
    }
    if (kind === 'comment' && !reviewBody.trim()) return false
    setSubmitting(true)
    try {
      const updated = await productRepository.reviewMatch(
        match.id,
        kind === 'rating' ? rating : undefined,
        kind === 'comment' ? reviewBody : undefined,
      )
      onMatchUpdated(updated)
      await Taro.showToast({
        title: kind === 'rating' ? '评分已确认' : '评论已发布',
        icon: 'success',
      })
      return true
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '提交失败',
        icon: 'none',
      })
      return false
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
        <View className="experience-match-header__context">
          <Text className="experience-match-header__date">
            {formatLongDate(match.scheduledStartAt)} {formatTime(match.scheduledStartAt)}
          </Text>
          <Text className="experience-match-header__venue">{match.venue?.name ?? '场地待定'}</Text>
        </View>

        <View className="experience-scoreboard">
          <TeamSide
            team={match.homeTeam}
            placeholder={match.homePlaceholder}
            tournamentId={match.tournamentId}
            blocked={editor?.editing}
          />
          <View className="experience-scoreboard__score">
            {editor?.editing ? (
              <div className="experience-scoreboard__inputs">
                <input
                  type="number"
                  min="0"
                  max="99"
                  className="experience-scoreboard__input"
                  aria-label="主队比分"
                  value={editor.fields.homeScore}
                  disabled={editor.locked}
                  onChange={(event) => editor.score('HOME', event.target.value)}
                />
                <span>:</span>
                <input
                  type="number"
                  min="0"
                  max="99"
                  className="experience-scoreboard__input"
                  aria-label="客队比分"
                  value={editor.fields.awayScore}
                  disabled={editor.locked}
                  onChange={(event) => editor.score('AWAY', event.target.value)}
                />
              </div>
            ) : (
              <Text className="experience-scoreboard__result">
                {hasScore ? `${match.homeScore} : ${match.awayScore}` : 'VS'}
              </Text>
            )}
            {(match.homePenaltyScore !== null || match.awayPenaltyScore !== null) && (
              <Text className="experience-scoreboard__penalty">
                点球 {match.homePenaltyScore ?? 0} : {match.awayPenaltyScore ?? 0}
              </Text>
            )}
          </View>
          <TeamSide
            team={match.awayTeam}
            placeholder={match.awayPlaceholder}
            tournamentId={match.tournamentId}
            blocked={editor?.editing}
          />
        </View>
      </View>

      {editor && <MatchChangeRequest editor={editor} />}
      {editor?.error && !editor.editing && !editor.requesting && (
        <p className="inline-match-error" role="alert">
          {editor.error}
        </p>
      )}

      {match.summary ? (
        <View className="match-summary surface">
          <Text className="match-summary__label">比赛快报</Text>
          <TextDisclosure className="match-summary__body" lines={2}>
            {match.summary}
          </TextDisclosure>
        </View>
      ) : null}
      {match.statusReason ? (
        <View className="match-summary surface">
          <Text className="match-summary__label">比赛说明</Text>
          <TextDisclosure className="match-summary__body" lines={2}>
            {match.statusReason}
          </TextDisclosure>
        </View>
      ) : null}

      {!editor?.editing && (
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
      )}

      {!editor?.editing && activeTab === 'ratings' && (
        <>
          <RatingsPanel
            body={reviewBody}
            isFinished={isFinished}
            match={match}
            rating={rating}
            submitting={submitting}
            onBodyChange={setReviewBody}
            onRatingChange={setRating}
            onSubmitRating={() => void submitReview('rating')}
            onSubmitComment={() => submitReview('comment')}
          />
        </>
      )}

      {editor?.editing ? (
        <InlineEventEditor editor={editor} />
      ) : activeTab === 'events' ? (
        <EventsPanel match={match} />
      ) : activeTab === 'lineups' ? (
        <LineupsPanel match={match} />
      ) : null}
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
  onSubmitRating,
  onSubmitComment,
}: {
  match: MatchExperienceResponse
  rating: number
  body: string
  isFinished: boolean
  submitting: boolean
  onRatingChange: (rating: number) => void
  onBodyChange: (body: string) => void
  onSubmitRating: () => void
  onSubmitComment: () => Promise<boolean>
}) {
  const session = readSession()
  const [reportId, setReportId] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const lockedRating = match.reviews.viewerReview?.rating ?? 0
  const distribution = match.reviews.ratingDistribution
  return (
    <View className="ratings-layout match-tab-content">
      <MatchFlash match={match} />
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
                ? lockedRating > 0
                  ? `我的评分 ${lockedRating} 分 · 已确认`
                  : '为这场比赛评分'
                : '登录后参与评分'}
          </Text>
          {lockedRating > 0 ? (
            <div className="rating-distribution" aria-label="1 至 5 分的评分分布">
              {distribution ? (
                [1, 2, 3, 4, 5].map((value) => {
                  const count = distribution.find((item) => item.rating === value)?.count ?? 0
                  const percentage = match.reviews.ratingCount
                    ? (count / match.reviews.ratingCount) * 100
                    : 0
                  return (
                    <div
                      className="rating-distribution__item"
                      key={value}
                      title={`${value} 分：${count} 人`}
                    >
                      <span>{value} 分</span>
                      <i>
                        <b style={{ width: `${percentage}%` }} />
                      </i>
                      <strong>{Number(percentage.toFixed(1))}%</strong>
                    </div>
                  )
                })
              ) : (
                <span>评分分布暂不可用</span>
              )}
            </div>
          ) : (
            <View className="rating-choice">
              <View className="rating-stars" aria-label="选择星级">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    type="button"
                    aria-label={`${value} 星`}
                    className={value <= rating ? 'rating-star rating-star--active' : 'rating-star'}
                    disabled={!isFinished || submitting}
                    aria-pressed={rating === value}
                    key={value}
                    onClick={() => onRatingChange(value)}
                  >
                    ★
                  </button>
                ))}
              </View>
              <button
                type="button"
                className="button button--primary rating-form__submit"
                disabled={!isFinished || rating < 1 || submitting}
                aria-busy={submitting}
                onClick={onSubmitRating}
              >
                {submitting ? '提交中…' : session ? '确认评分' : '登录后评分'}
              </button>
            </View>
          )}
        </View>
      </View>

      <View className="match-review-section">
        <form
          className={`match-comment-inline ${!isFinished || !session ? 'is-disabled' : ''}`}
          onSubmit={(event) => {
            event.preventDefault()
            if (!body.trim() || submitting) return
            void onSubmitComment()
          }}
        >
          <UserAvatar
            avatarUrl={session?.user.avatarUrl ?? null}
            name={session?.user.displayName ?? '访客'}
            size="small"
          />
          <input
            ref={input}
            className="match-comment-inline__input"
            aria-label="观赛评论"
            maxLength={500}
            value={body}
            disabled={!isFinished || !session || submitting}
            placeholder={
              !isFinished
                ? '赛后开放评论'
                : !session
                  ? '登录后参与评论'
                  : match.reviews.viewerReview?.body
                    ? '修改我的评论…'
                    : '说说比赛节奏、球员表现或现场体验…'
            }
            onChange={(event) => onBodyChange(event.target.value)}
          />
          <EmojiPicker
            disabled={!isFinished || !session || submitting}
            onSelect={(emoji) =>
              insertAtCursor(
                input.current as unknown as HTMLTextAreaElement,
                body,
                emoji,
                500,
                onBodyChange,
              )
            }
          />
          <button
            type="submit"
            className="match-comment-inline__send"
            disabled={!body.trim() || submitting || !isFinished || !session}
          >
            {submitting ? '发送中…' : '发送'}
          </button>
        </form>
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
                    {review.rating > 0 && <Text>{renderStars(review.rating)}</Text>}
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

/** 快报 — official posts linked to this match. Renders nothing when the match has none. */
function MatchFlash({ match }: { match: MatchExperienceResponse }) {
  const reports = match.flashReports ?? []
  if (reports.length === 0) return null
  return (
    <section className="match-flash surface" aria-label="比赛快报">
      <header className="match-flash__head">
        <span className="match-flash__badge">快报</span>
        {reports.length > 1 && <span className="match-flash__count">{reports.length} 篇</span>}
      </header>
      {reports.map((report) => {
        const image = resolveMediaUrl(report.imageUrls?.[0] ?? report.imageUrl)
        return (
          <button
            key={report.id}
            className="match-flash__item"
            type="button"
            onClick={() => void openPost(report.id)}
          >
            {image && (
              <span className="match-flash__media">
                <img src={image} alt="" loading="lazy" />
                {/\/media-assets\//.test(image) && <span className="match-flash__gif">GIF</span>}
              </span>
            )}
            <span className="match-flash__text">
              <strong>{report.title ?? '比赛快报'}</strong>
              <span className="match-flash__body">{report.body}</span>
              <span className="match-flash__meta">
                {report.author?.displayName ?? '官方'} · {formatRelativeTime(report.publishedAt)}
              </span>
            </span>
          </button>
        )
      })}
    </section>
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
  blocked = false,
}: {
  team: MatchExperienceResponse['homeTeam']
  placeholder: string | null | undefined
  tournamentId: string
  blocked?: boolean | undefined
}) {
  return (
    <div
      className={`experience-scoreboard__team ${team ? 'experience-scoreboard__team--linked' : ''}`}
    >
      <span data-match-resource="team">
        <TeamCrest team={team} size="large" interactive={!blocked} />
      </span>
      {team && !blocked ? (
        <button
          type="button"
          data-match-resource="team"
          className="experience-scoreboard__name"
          onClick={() => void openTeam(team.id, tournamentId)}
        >
          {team.name}
        </button>
      ) : (
        <Text>{team?.name ?? placeholder ?? '席位待定'}</Text>
      )}
    </div>
  )
}
