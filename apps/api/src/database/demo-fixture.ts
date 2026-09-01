import { createHash } from 'node:crypto'

import {
  DominantFoot,
  MatchStatus,
  PlayerPosition,
  PostType,
  Role,
  VerificationLevel,
} from '../generated/prisma/client'

export const DEMO_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001'
export const DEMO_PASSWORD = 'Xiaoqiu2026!'

export interface DemoTeamDefinition {
  code: string
  name: string
  shortName: string
  collegeName: string
  description: string
  motto: string
  primaryColor: string
  secondaryColor: string
  foundedYear: number
  major: string
}

export interface DemoPlayerDefinition {
  id: string
  sourceKey: string
  studentId: string
  displayName: string
  jerseyName: string
  shirtNumber: string
  position: PlayerPosition
  secondaryPosition: PlayerPosition
  dominantFoot: DominantFoot
  heightCm: number
  academicYear: string
  major: string
  hometown: string
  bio: string
  profileColor: string
  teamIndex: number
}

export interface DemoMatchDefinition {
  code: string
  title: string
  tournament: '2025' | '2026'
  stage: 'GROUP' | 'KNOCKOUT'
  group?: 'A' | 'B' | undefined
  round: number
  homeTeamIndex?: number | undefined
  awayTeamIndex?: number | undefined
  status: MatchStatus
  scheduledStartAt: string
  homeScore?: number | undefined
  awayScore?: number | undefined
  homePenaltyScore?: number | undefined
  awayPenaltyScore?: number | undefined
  statusReason?: string | undefined
  summary?: string | undefined
  attendance?: number | undefined
}

export interface DemoAccountDefinition {
  username: string
  displayName: string
  realName: string
  studentId: string
  email: string
  verificationLevel: VerificationLevel
  linkedTeamIndex?: number
  linkedPlayerIndex?: number
  roles: Array<{ role: Role; scope: 'ORGANIZATION' | 'TOURNAMENT' | 'TEAM' }>
  primaryTeamIndex: number
  followedTeamIndexes: number[]
  bio: string
}

export interface DemoPostDefinition {
  key: string
  type: PostType
  authorUsername?: string
  title?: string
  body: string
  publishedAt: string
}

export const DEMO_TEAMS: DemoTeamDefinition[] = [
  {
    code: 'DEMO-PHY-1',
    name: '物院一队',
    shortName: '物院一队',
    collegeName: '物理科学与技术学院',
    description: '以高年级骨干为中轴的攻守平衡球队，强调前场压迫与快速转移。',
    motto: '知行合一，向光而行',
    primaryColor: '#1f6b45',
    secondaryColor: '#f4c95d',
    foundedYear: 2016,
    major: '物理学',
  },
  {
    code: 'DEMO-PHY-2',
    name: '物院二队',
    shortName: '物院二队',
    collegeName: '物理科学与技术学院',
    description: '年轻、敢于持球的学院新生力量，习惯从后场耐心组织进攻。',
    motto: '保持热爱，奔向下一球',
    primaryColor: '#2f77c5',
    secondaryColor: '#ffffff',
    foundedYear: 2021,
    major: '电子信息科学与技术',
  },
  {
    code: 'DEMO-MATH',
    name: '数院星火',
    shortName: '星火',
    collegeName: '数学与统计学学院',
    description: '阵型纪律严谨，擅长通过中场人数优势控制比赛节奏。',
    motto: '精确到最后一分钟',
    primaryColor: '#9f2f35',
    secondaryColor: '#f7efe2',
    foundedYear: 2014,
    major: '数学与应用数学',
  },
  {
    code: 'DEMO-CS',
    name: '计算机雷霆',
    shortName: '雷霆',
    collegeName: '计算机学院',
    description: '转换速度快、边路冲击鲜明，是杯赛中最具攻击性的队伍之一。',
    motto: '快速迭代，持续进球',
    primaryColor: '#2c3345',
    secondaryColor: '#4cc9b0',
    foundedYear: 2013,
    major: '计算机科学与技术',
  },
  {
    code: 'DEMO-CHEM',
    name: '化院原子',
    shortName: '原子',
    collegeName: '化学学院',
    description: '重视身体对抗和定位球，在胶着比赛中保持很强的执行力。',
    motto: '聚合每一份力量',
    primaryColor: '#7b3fa1',
    secondaryColor: '#f1d65c',
    foundedYear: 2015,
    major: '化学',
  },
  {
    code: 'DEMO-BIO',
    name: '生科青藤',
    shortName: '青藤',
    collegeName: '生命科学学院',
    description: '跑动积极、整体协作出色，常通过连续的小范围配合创造机会。',
    motto: '扎根生长，向上突破',
    primaryColor: '#148c72',
    secondaryColor: '#f6fbf2',
    foundedYear: 2017,
    major: '生物科学',
  },
  {
    code: 'DEMO-GEO',
    name: '地科山岳',
    shortName: '山岳',
    collegeName: '城市与环境科学学院',
    description: '防线稳定、反击直接，善于把有限机会转化成高质量射门。',
    motto: '稳如山岳，行至远方',
    primaryColor: '#31708f',
    secondaryColor: '#e8d8a8',
    foundedYear: 2012,
    major: '地理科学',
  },
  {
    code: 'DEMO-EDU',
    name: '教育联队',
    shortName: '教育联队',
    collegeName: '教育学院',
    description: '经验与活力并存，前锋线个人能力突出，比赛气质沉稳。',
    motto: '以球会友，共同成长',
    primaryColor: '#d45b35',
    secondaryColor: '#fff4e7',
    foundedYear: 2011,
    major: '教育学',
  },
]

const surnames = [
  '周',
  '陈',
  '林',
  '许',
  '张',
  '吴',
  '郑',
  '何',
  '徐',
  '孙',
  '高',
  '罗',
  '梁',
  '宋',
  '唐',
  '彭',
  '韩',
  '曹',
  '邓',
  '潘',
  '谢',
  '袁',
  '蒋',
  '程',
  '叶',
  '苏',
  '曾',
  '傅',
]

const givenNames = [
  '启川',
  '景行',
  '明澈',
  '承宇',
  '亦航',
  '思远',
  '嘉树',
  '泽安',
  '闻野',
  '子谦',
  '星野',
  '清和',
  '云舟',
  '予安',
  '知远',
  '骁然',
  '怀瑾',
  '屹辰',
  '沐阳',
  '言蹊',
]

const hometowns = [
  '武汉',
  '宜昌',
  '襄阳',
  '荆州',
  '黄冈',
  '长沙',
  '南昌',
  '合肥',
  '郑州',
  '杭州',
  '广州',
  '成都',
]
const shirtNumbers = ['1', '12', '2', '3', '4', '5', '6', '8', '10', '14', '7', '9', '11', '18']

export const DEMO_PLAYERS: DemoPlayerDefinition[] = DEMO_TEAMS.flatMap((team, teamIndex) =>
  Array.from({ length: 14 }, (_, playerIndex) => {
    const globalIndex = teamIndex * 14 + playerIndex
    const surname = surnames[globalIndex % surnames.length]!
    const givenNameIndex =
      (Math.floor(globalIndex / surnames.length) + globalIndex * 7) % givenNames.length
    const displayName = `${surname}${givenNames[givenNameIndex]}`
    const position = positionForIndex(playerIndex)
    const secondaryPosition = secondaryPositionFor(position, playerIndex)
    const style = styleForPosition(position)
    const academicYear = `${2022 + ((teamIndex + playerIndex) % 4)}级`

    return {
      id: fixtureId(`player:${team.code}:${playerIndex + 1}`),
      sourceKey: `DEMO-2026-${team.code}-${String(playerIndex + 1).padStart(2, '0')}`,
      studentId: `${academicYear.slice(0, 4)}88${String(globalIndex + 1).padStart(5, '0')}`,
      displayName,
      jerseyName: displayName.slice(1),
      shirtNumber: shirtNumbers[playerIndex]!,
      position,
      secondaryPosition,
      dominantFoot:
        playerIndex % 7 === 0
          ? DominantFoot.BOTH
          : playerIndex % 3 === 0
            ? DominantFoot.LEFT
            : DominantFoot.RIGHT,
      heightCm: 168 + ((teamIndex * 5 + playerIndex * 3) % 20),
      academicYear,
      major: team.major,
      hometown: hometowns[(teamIndex * 3 + playerIndex) % hometowns.length]!,
      bio: `${team.shortName}${positionLabel(position)}，${style}。训练之外喜欢记录校园比赛，也期待在绿茵杯留下属于球队的片段。`,
      profileColor: team.primaryColor,
      teamIndex,
    }
  }),
)

export const DEMO_MATCHES: DemoMatchDefinition[] = [
  match(
    'GC26-A-R1-01',
    'A组第1轮',
    '2026',
    'GROUP',
    'A',
    1,
    0,
    1,
    MatchStatus.FINISHED,
    '2026-08-24T10:00:00+08:00',
    2,
    1,
    '物院德比节奏紧凑，一队凭借下半场反击锁定胜局。',
    326,
  ),
  match(
    'GC26-A-R1-02',
    'A组第1轮',
    '2026',
    'GROUP',
    'A',
    1,
    2,
    3,
    MatchStatus.FINISHED,
    '2026-08-24T16:00:00+08:00',
    1,
    1,
    '星火与雷霆各自掌控半场，最终握手言和。',
    284,
  ),
  match(
    'GC26-B-R1-01',
    'B组第1轮',
    '2026',
    'GROUP',
    'B',
    1,
    4,
    5,
    MatchStatus.FINISHED,
    '2026-08-25T10:00:00+08:00',
    1,
    0,
    '原子利用一次定位球取得开门红。',
    241,
  ),
  match(
    'GC26-B-R1-02',
    'B组第1轮',
    '2026',
    'GROUP',
    'B',
    1,
    6,
    7,
    MatchStatus.FINISHED,
    '2026-08-25T16:00:00+08:00',
    2,
    3,
    '教育联队在终场前完成逆转，打出首轮进球最多的比赛。',
    309,
  ),
  match(
    'GC26-A-R2-01',
    'A组第2轮',
    '2026',
    'GROUP',
    'A',
    2,
    0,
    2,
    MatchStatus.FINISHED,
    '2026-08-28T16:00:00+08:00',
    3,
    0,
    '一队通过持续前压取得三球胜利。',
    338,
  ),
  match(
    'GC26-A-R2-02',
    'A组第2轮',
    '2026',
    'GROUP',
    'A',
    2,
    1,
    3,
    MatchStatus.FINISHED,
    '2026-08-28T19:00:00+08:00',
    2,
    2,
    '双方四次改写比分，雷霆终场前扳平。',
    351,
  ),
  match(
    'GC26-B-R2-01',
    'B组第2轮',
    '2026',
    'GROUP',
    'B',
    2,
    4,
    6,
    MatchStatus.FINISHED,
    '2026-08-29T16:00:00+08:00',
    2,
    2,
    '山岳依靠高效反击从两球落后中追平。',
    276,
  ),
  match(
    'GC26-B-R2-02',
    'B组第2轮',
    '2026',
    'GROUP',
    'B',
    2,
    5,
    7,
    MatchStatus.LIVE,
    '2026-09-01T19:00:00+08:00',
    1,
    1,
    '比赛进入下半场，双方仍在争夺中场主动权。',
    412,
  ),
  match(
    'GC26-A-R3-01',
    'A组第3轮',
    '2026',
    'GROUP',
    'A',
    3,
    0,
    3,
    MatchStatus.SCHEDULED,
    '2026-09-04T16:00:00+08:00',
  ),
  match(
    'GC26-A-R3-02',
    'A组第3轮',
    '2026',
    'GROUP',
    'A',
    3,
    1,
    2,
    MatchStatus.SCHEDULED,
    '2026-09-04T19:00:00+08:00',
  ),
  match(
    'GC26-B-R3-01',
    'B组第3轮',
    '2026',
    'GROUP',
    'B',
    3,
    4,
    7,
    MatchStatus.POSTPONED,
    '2026-09-05T16:00:00+08:00',
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    '受场地维护影响，顺延至 9 月 7 日。',
  ),
  match(
    'GC26-B-R3-02',
    'B组第3轮',
    '2026',
    'GROUP',
    'B',
    3,
    5,
    6,
    MatchStatus.SCHEDULED,
    '2026-09-05T19:00:00+08:00',
  ),
  match(
    'GC26-SF-01',
    '半决赛 1',
    '2026',
    'KNOCKOUT',
    undefined,
    1,
    undefined,
    undefined,
    MatchStatus.SCHEDULED,
    '2026-09-10T16:00:00+08:00',
  ),
  match(
    'GC26-SF-02',
    '半决赛 2',
    '2026',
    'KNOCKOUT',
    undefined,
    1,
    undefined,
    undefined,
    MatchStatus.SCHEDULED,
    '2026-09-10T19:00:00+08:00',
  ),
  match(
    'GC26-THIRD',
    '三四名决赛',
    '2026',
    'KNOCKOUT',
    undefined,
    2,
    undefined,
    undefined,
    MatchStatus.SCHEDULED,
    '2026-09-14T16:00:00+08:00',
  ),
  match(
    'GC26-FINAL',
    '绿茵杯决赛',
    '2026',
    'KNOCKOUT',
    undefined,
    2,
    undefined,
    undefined,
    MatchStatus.SCHEDULED,
    '2026-09-14T19:00:00+08:00',
  ),

  match(
    'GC25-QF-01',
    '2025 八强赛 1',
    '2025',
    'KNOCKOUT',
    undefined,
    1,
    0,
    7,
    MatchStatus.FINISHED,
    '2025-05-10T14:00:00+08:00',
    2,
    0,
    '物院一队稳健晋级四强。',
    255,
  ),
  match(
    'GC25-QF-02',
    '2025 八强赛 2',
    '2025',
    'KNOCKOUT',
    undefined,
    1,
    2,
    5,
    MatchStatus.FINISHED,
    '2025-05-10T16:00:00+08:00',
    1,
    2,
    '青藤在下半场完成逆转。',
    231,
  ),
  match(
    'GC25-QF-03',
    '2025 八强赛 3',
    '2025',
    'KNOCKOUT',
    undefined,
    1,
    3,
    6,
    MatchStatus.FINISHED,
    '2025-05-11T14:00:00+08:00',
    3,
    1,
    '雷霆用快速进攻建立优势。',
    288,
  ),
  match(
    'GC25-QF-04',
    '2025 八强赛 4',
    '2025',
    'KNOCKOUT',
    undefined,
    1,
    4,
    1,
    MatchStatus.FINISHED,
    '2025-05-11T16:00:00+08:00',
    1,
    1,
    '点球大战后物院二队晋级。',
    302,
    3,
    4,
  ),
  match(
    'GC25-SF-01',
    '2025 半决赛 1',
    '2025',
    'KNOCKOUT',
    undefined,
    2,
    0,
    5,
    MatchStatus.FINISHED,
    '2025-05-17T15:00:00+08:00',
    2,
    1,
    '一队在加速阶段连续创造机会。',
    347,
  ),
  match(
    'GC25-SF-02',
    '2025 半决赛 2',
    '2025',
    'KNOCKOUT',
    undefined,
    2,
    3,
    1,
    MatchStatus.FINISHED,
    '2025-05-17T18:00:00+08:00',
    1,
    2,
    '二队防守反击奏效，首次进入决赛。',
    366,
  ),
  match(
    'GC25-THIRD',
    '2025 三四名决赛',
    '2025',
    'KNOCKOUT',
    undefined,
    3,
    5,
    3,
    MatchStatus.FINISHED,
    '2025-05-24T15:00:00+08:00',
    2,
    3,
    '雷霆获得季军。',
    381,
  ),
  match(
    'GC25-FINAL',
    '2025 绿茵杯决赛',
    '2025',
    'KNOCKOUT',
    undefined,
    3,
    0,
    1,
    MatchStatus.FINISHED,
    '2025-05-24T19:00:00+08:00',
    2,
    2,
    '物院一队通过点球大战夺得冠军。',
    618,
    5,
    4,
  ),
]

export const DEMO_ACCOUNTS: DemoAccountDefinition[] = [
  {
    username: 'student',
    displayName: '知夏看球',
    realName: '林知夏',
    studentId: '20249990001',
    email: 'student@xiaoqiu.demo',
    verificationLevel: VerificationLevel.STUDENT_VERIFIED,
    roles: [],
    primaryTeamIndex: 2,
    followedTeamIndexes: [0, 4],
    bio: '普通学生用户，关注校园比赛和数院星火。',
  },
  {
    username: 'player',
    displayName: '星野',
    realName: DEMO_PLAYERS[10]!.displayName,
    studentId: DEMO_PLAYERS[10]!.studentId,
    email: 'player@xiaoqiu.demo',
    verificationLevel: VerificationLevel.PLAYER_CONFIRMED,
    linkedTeamIndex: 0,
    linkedPlayerIndex: 10,
    roles: [],
    primaryTeamIndex: 0,
    followedTeamIndexes: [2],
    bio: '已认领球员档案的参赛球员。',
  },
  {
    username: 'captain',
    displayName: '明澈队长',
    realName: DEMO_PLAYERS[6]!.displayName,
    studentId: DEMO_PLAYERS[6]!.studentId,
    email: 'captain@xiaoqiu.demo',
    verificationLevel: VerificationLevel.PLAYER_CONFIRMED,
    linkedTeamIndex: 0,
    linkedPlayerIndex: 6,
    roles: [{ role: Role.TEAM_CAPTAIN, scope: 'TEAM' }],
    primaryTeamIndex: 0,
    followedTeamIndexes: [1, 3],
    bio: '物院一队队长，负责球队沟通和名单确认。',
  },
  {
    username: 'reporter',
    displayName: '嘉言现场',
    realName: '沈嘉言',
    studentId: '20239990002',
    email: 'reporter@xiaoqiu.demo',
    verificationLevel: VerificationLevel.STAFF_VERIFIED,
    roles: [{ role: Role.MATCH_REPORTER, scope: 'TOURNAMENT' }],
    primaryTeamIndex: 3,
    followedTeamIndexes: [0, 7],
    bio: '绿茵杯信息员，负责授权场次的现场数据记录。',
  },
  {
    username: 'admin',
    displayName: '清越赛事组',
    realName: '韩清越',
    studentId: '20219990003',
    email: 'admin@xiaoqiu.demo',
    verificationLevel: VerificationLevel.STAFF_VERIFIED,
    roles: [
      { role: Role.ORGANIZATION_ADMIN, scope: 'ORGANIZATION' },
      { role: Role.TOURNAMENT_ADMIN, scope: 'TOURNAMENT' },
    ],
    primaryTeamIndex: 0,
    followedTeamIndexes: [1, 2, 3],
    bio: '本地演示赛事管理员，可查看赛事管理入口。',
  },
]

export const DEMO_POSTS: DemoPostDefinition[] = [
  {
    key: 'official-round-two',
    type: PostType.OFFICIAL,
    title: '小组赛第二轮战报与积分形势',
    body: '第二轮结束后，物院一队保持全胜领跑 A 组；B 组竞争依旧胶着。数据页已更新积分、射手和助攻排行。',
    publishedAt: '2026-08-30T09:00:00+08:00',
  },
  {
    key: 'official-venue',
    type: PostType.OFFICIAL,
    title: '场地维护与赛程调整说明',
    body: '原定 9 月 5 日下午进行的化院原子对教育联队比赛顺延至 9 月 7 日，其他场次保持不变。',
    publishedAt: '2026-08-31T14:30:00+08:00',
  },
  {
    key: 'community-derby',
    type: PostType.COMMUNITY,
    authorUsername: 'student',
    body: '第一次现场看物院德比，双方从开场就把节奏拉满。看台上的气氛也很棒，期待下一轮！',
    publishedAt: '2026-08-24T20:10:00+08:00',
  },
  {
    key: 'community-training',
    type: PostType.COMMUNITY,
    authorUsername: 'captain',
    body: '完成恢复训练。两轮比赛只是开始，周四继续专注自己的节奏。感谢到场支持我们的同学。',
    publishedAt: '2026-08-30T21:15:00+08:00',
  },
  {
    key: 'community-reporter',
    type: PostType.COMMUNITY,
    authorUsername: 'reporter',
    body: '今日信息台将在开赛前 30 分钟开放。如果对比分或球员事件有疑问，可以在比赛详情中提交反馈。',
    publishedAt: '2026-09-01T12:20:00+08:00',
  },
  {
    key: 'community-player',
    type: PostType.COMMUNITY,
    authorUsername: 'player',
    body: '进球当然开心，但更重要的是全队一起完成了赛前部署。下一场见。',
    publishedAt: '2026-08-29T10:05:00+08:00',
  },
]

export function fixtureId(key: string): string {
  const hex = createHash('sha256').update(`xiaoqiu:${key}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function positionForIndex(index: number): PlayerPosition {
  if (index < 2) return PlayerPosition.GOALKEEPER
  if (index < 6) return PlayerPosition.DEFENDER
  if (index < 10) return PlayerPosition.MIDFIELDER
  return PlayerPosition.FORWARD
}

function secondaryPositionFor(position: PlayerPosition, index: number): PlayerPosition {
  if (position === PlayerPosition.GOALKEEPER) return PlayerPosition.GOALKEEPER
  if (position === PlayerPosition.DEFENDER)
    return index % 2 === 0 ? PlayerPosition.MIDFIELDER : PlayerPosition.DEFENDER
  if (position === PlayerPosition.MIDFIELDER)
    return index % 2 === 0 ? PlayerPosition.FORWARD : PlayerPosition.DEFENDER
  return PlayerPosition.MIDFIELDER
}

function positionLabel(position: PlayerPosition): string {
  switch (position) {
    case PlayerPosition.GOALKEEPER:
      return '门将'
    case PlayerPosition.DEFENDER:
      return '后卫'
    case PlayerPosition.MIDFIELDER:
      return '中场'
    case PlayerPosition.FORWARD:
      return '前锋'
  }
}

function styleForPosition(position: PlayerPosition): string {
  switch (position) {
    case PlayerPosition.GOALKEEPER:
      return '反应迅速，习惯主动指挥防线'
    case PlayerPosition.DEFENDER:
      return '对抗稳定，擅长判断第二落点'
    case PlayerPosition.MIDFIELDER:
      return '跑动覆盖积极，重视向前传递'
    case PlayerPosition.FORWARD:
      return '喜欢攻击防线身后，门前处理果断'
  }
}

function match(
  code: string,
  title: string,
  tournament: '2025' | '2026',
  stage: 'GROUP' | 'KNOCKOUT',
  group: 'A' | 'B' | undefined,
  round: number,
  homeTeamIndex: number | undefined,
  awayTeamIndex: number | undefined,
  status: MatchStatus,
  scheduledStartAt: string,
  homeScore?: number,
  awayScore?: number,
  summary?: string,
  attendance?: number,
  homePenaltyScore?: number,
  awayPenaltyScore?: number,
  statusReason?: string,
): DemoMatchDefinition {
  return {
    code,
    title,
    tournament,
    stage,
    group,
    round,
    homeTeamIndex,
    awayTeamIndex,
    status,
    scheduledStartAt,
    homeScore,
    awayScore,
    homePenaltyScore,
    awayPenaltyScore,
    statusReason,
    summary,
    attendance,
  }
}
