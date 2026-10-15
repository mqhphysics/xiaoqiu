import referenceArtwork from '../../assets/home-visual/home-cover-reference.png'
import type { HomeHeroCopyProps } from './home-hero-copy'
import './home-hero-copy.h5.scss'

/** Keep the reference lettering, with its light paper texture masked out. */
export function HomeHeroCopy({ tournament, onOpenSchedule }: HomeHeroCopyProps) {
  return (
    <section className="experience-hero__copy hero-season reference-hero" aria-label="2026绿茵杯封面">
      <svg className="reference-hero__filters" aria-hidden="true" focusable="false" width="0" height="0">
        <defs>
          <filter id="home-hero-lettering" colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -3 -3 -3 0 6.5"
            />
          </filter>
        </defs>
      </svg>
      <div className="reference-hero__canvas">
        <p className="reference-hero__season">2026 校园足球赛季</p>
        <h1 className="reference-hero__art">
          <img src={referenceArtwork} alt="绿茵正燃，青春正好" />
        </h1>
        <p className="reference-hero__message">2026绿茵杯火热进行中</p>
        <span className="reference-hero__underline" aria-hidden="true" />
        <div className="reference-hero__facts">
          <span className="reference-hero__teams">{tournament.teamCount} 支球队</span>
          <span className="reference-hero__matches">{tournament.matchCount} 场比赛</span>
          <button className="reference-hero__schedule" type="button" onClick={onOpenSchedule}>
            <span>查看赛程</span>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M4 12h16m-6-6 6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  )
}
