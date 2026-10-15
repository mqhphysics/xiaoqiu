import fifa from '../../assets/match-media/fifa-celebration.gif'
import lfc from '../../assets/match-media/lfc-celebration.gif'
import mufc from '../../assets/match-media/mufc-goal.gif'
import muller from '../../assets/match-media/muller-goal.gif'
import { hasMatchBulletin } from './match-bulletin.logic.ts'

export { hasMatchBulletin }

export interface MatchBulletinSeed {
  title: string
  body: string
  author: string
  publishedLabel: string
  imageSrc: string
  imageAlt: string
}

/** Post-like 快报 for a handful of finished demo matches. Missing codes render nothing. */
const BULLETINS: Record<string, MatchBulletinSeed> = {
  'GC26-A-R1-01': {
    title: '物院德比：一队下半场反击锁定胜局',
    body: '开场双方都把防线压得很靠前。一队在易边后抓住一次右路传中后的第二点，由前场连续两次射门改写比分。二队虽有定位球机会，门将两次扩大防守面积把比分保住。终场 2:1，小组头名争夺提前升温。',
    author: '晓球赛事组',
    publishedLabel: '赛后快报',
    imageSrc: muller,
    imageAlt: '进球瞬间',
  },
  'GC26-A-R2-01': {
    title: '一队三球完胜，前压换来小组气势',
    body: '本场几乎一边倒。一队从开场就用高位压迫切断星火出球，中场两次直塞形成单刀。下半场再由定位球头球扩大比分。星火直到最后二十分钟才把阵线推上来，但已经很难形成完整进攻。',
    author: '晓球赛事组',
    publishedLabel: '赛后快报',
    imageSrc: fifa,
    imageAlt: '进球庆祝',
  },
  'GC26-B-R1-02': {
    title: '教育联队终场前逆转，首轮进球大战',
    body: '这是本轮进球最多的一场。教育联队两度落后又两度追平，最后三分钟右路低传中路包抄得手。现场看台在哨响时已经站起来。5 粒进球里有 3 次来自反击，门将扑救同样值得记一笔。',
    author: '晓球赛事组',
    publishedLabel: '赛后快报',
    imageSrc: mufc,
    imageAlt: '进球庆祝',
  },
  'GC26-SF-01': {
    title: '半决赛：一队下半场制胜，率先晋级决赛',
    body: '上半场双方都把重心放在中路绞杀，直到易边后一队才把边路宽度拉开。一次肋部直塞形成单刀，随后用换人稳住中场。青藤在最后阶段连换两名前插，但已经缺少传球落点。一队拿到决赛席位。',
    author: '晓球赛事组',
    publishedLabel: '赛后快报',
    imageSrc: lfc,
    imageAlt: '进球庆祝',
  },
}

export function matchBulletin(matchCode: string): MatchBulletinSeed | null {
  return BULLETINS[matchCode] ?? null
}
