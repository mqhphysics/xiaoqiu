import { useEffect, useState } from 'react'

import { resolveMediaUrl } from '../../features/product/product.repository'
import type { HomeResponse, PostSummary } from '../../features/product/product.types'
import { tournamentHeroSlides } from './home-announcements'
import { seasonNotice } from './season-notice'

import './home-top.h5.scss'

function oneLine(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Desktop 首页 top row.
 * Left: the season's fixed 总公告 (a static notice, styled like a posted bulletin).
 * Right: rotating announcement photos with a one-line caption below the image.
 */
export function HomeTop({
  data,
  onOpenPost,
  onOpenSchedule,
}: {
  data: HomeResponse
  onOpenPost: (postId: string) => void
  onOpenSchedule: () => void
}) {
  const notice = seasonNotice(
    data.tournament.name,
    data.tournament.teamCount,
    data.tournament.matchCount,
  )
  const slides = tournamentHeroSlides(data.announcements).filter((post) => Boolean(post.imageUrl))
  return (
    <section className="home-top" aria-label="赛事公告">
      <article className="season-notice">
        <header className="season-notice__head">
          <span className="season-notice__seal">总公告</span>
          <span className="season-notice__season">{data.tournament.seasonName}</span>
        </header>
        <h1 className="season-notice__title">{notice.title}</h1>
        <p className="season-notice__lead">{notice.lead}</p>
        <ul className="season-notice__points">
          {notice.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <footer className="season-notice__foot">
          <span className="season-notice__facts">
            <b>{data.tournament.teamCount}</b> 支球队 · <b>{data.tournament.matchCount}</b> 场比赛
          </span>
          <button type="button" className="season-notice__action" onClick={onOpenSchedule}>
            查看赛程 <span aria-hidden="true">→</span>
          </button>
        </footer>
      </article>
      <AnnouncementCarousel slides={slides} onOpen={onOpenPost} />
    </section>
  )
}

function AnnouncementCarousel({
  slides,
  onOpen,
}: {
  slides: PostSummary[]
  onOpen: (postId: string) => void
}) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (slides.length < 2 || paused) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % slides.length), 6000)
    return () => window.clearInterval(timer)
  }, [slides.length, paused])
  if (slides.length === 0)
    return <div className="announce-card announce-card--empty">暂无赛事公告</div>
  const active = slides[index % slides.length]!
  return (
    <div
      className="announce-card"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <button
        type="button"
        className="announce-card__media"
        aria-label={`查看公告：${active.title ?? '赛事公告'}`}
        onClick={() => onOpen(active.id)}
      >
        {slides.map((slide, slideIndex) => (
          <img
            key={slide.id}
            src={resolveMediaUrl(slide.imageUrl) ?? ''}
            alt=""
            className={`announce-card__img ${slideIndex === index % slides.length ? 'is-active' : ''}`}
            loading={slideIndex === 0 ? 'eager' : 'lazy'}
          />
        ))}
      </button>
      <div className="announce-card__caption">
        <button type="button" className="announce-card__text" onClick={() => onOpen(active.id)}>
          <span className="announce-card__kicker">赛事公告</span>
          <strong>{active.title || '赛事公告'}</strong>
          <span className="announce-card__summary">{oneLine(active.body)}</span>
        </button>
        {slides.length > 1 && (
          <div className="announce-card__dots" role="tablist" aria-label="切换公告">
            {slides.map((slide, slideIndex) => (
              <button
                key={slide.id}
                type="button"
                className="announce-card__dot"
                role="tab"
                aria-selected={slideIndex === index % slides.length}
                aria-label={`第 ${slideIndex + 1} 条`}
                onClick={() => setIndex(slideIndex)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
