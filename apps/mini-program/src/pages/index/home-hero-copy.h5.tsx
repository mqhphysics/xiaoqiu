import referenceArtwork from '../../assets/home-visual/home-cover-reference.png'
import type { HomeHeroCopyProps } from './home-hero-copy'
import './home-hero-copy.h5.scss'

/** Reference artwork stays intact; the changing line and facts remain real text. */
export function HomeHeroCopy({ tournament, onOpenSchedule }: HomeHeroCopyProps) {
  return (
    <section className="experience-hero__copy hero-season reference-hero" aria-label="2026绿茵杯封面">
      <div className="reference-hero__canvas">
        <h1 className="reference-hero__art">
          <img src={referenceArtwork} alt="2026校园足球赛季，绿茵正燃，青春正好" />
        </h1>
        <p className="reference-hero__message">2026绿茵杯火热进行中</p>
        <span className="reference-hero__underline" aria-hidden="true" />
        <span className="reference-hero__teams">{tournament.teamCount} 支球队</span>
        <span className="reference-hero__matches">{tournament.matchCount} 场比赛</span>
        <button className="reference-hero__schedule" type="button" aria-label="查看赛程" onClick={onOpenSchedule}>
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  )
}
