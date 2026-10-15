/** 赛事总公告: fixed per season, so it lives with the site copy rather than the post feed. */
export interface SeasonNotice {
  title: string
  lead: string
  points: string[]
}

const NOTICES: Record<string, SeasonNotice> = {
  '2026 绿茵杯': {
    title: '2026 绿茵杯赛事总公告',
    lead: '绿茵杯是校园各学院之间的八人制足球赛事，欢迎同学们到场为球队加油。',
    points: [
      '小组赛决出八强，随后进行淘汰赛、决赛与三四名决赛',
      '比分、进球与红黄牌以赛事主办方确认后的记录为准',
      '赛程调整会在本页和赛程页同步更新，请以最新安排为准',
    ],
  },
}

export function seasonNotice(
  tournamentName: string,
  teamCount: number,
  matchCount: number,
): SeasonNotice {
  const key = tournamentName.replace(/\s+/g, ' ').trim()
  const known = NOTICES[key] ?? NOTICES[key.replace(/^(\d{4})(\S)/, '$1 $2')]
  if (known) return known
  return {
    title: `${tournamentName}赛事总公告`,
    lead: `本赛季共 ${teamCount} 支球队参赛，${matchCount} 场比赛。`,
    points: ['比分与事件以赛事主办方确认后的记录为准', '赛程如有调整，以赛程页最新安排为准'],
  }
}
