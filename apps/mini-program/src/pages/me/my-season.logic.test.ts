import assert from 'node:assert/strict'
import test from 'node:test'
import type { MatchSummary, PostSummary } from '../../features/product/product.types'
import {
  formatCount,
  isOwnReportAuthor,
  lineupStatusLabel,
  nextFollowedMatch,
  nextTeamMatch,
  rosterStatusLabel,
  seasonCardTitle,
  seasonPersona,
  studentActivity,
  summarizeReporter,
} from './my-season.logic.ts'

const schedule = [
  {
    id: 'later',
    status: 'SCHEDULED',
    scheduledStartAt: '2026-10-20T12:00:00Z',
    homeTeam: { id: 'team-a' },
    awayTeam: { id: 'team-b' },
  },
  {
    id: 'soon',
    status: 'SCHEDULED',
    scheduledStartAt: '2026-10-12T12:00:00Z',
    homeTeam: { id: 'team-b' },
    awayTeam: { id: 'team-a' },
  },
  {
    id: 'tbd',
    status: 'SCHEDULED',
    scheduledStartAt: null,
    homeTeam: { id: 'team-a' },
    awayTeam: { id: 'team-c' },
  },
  {
    id: 'done',
    status: 'FINISHED',
    scheduledStartAt: '2026-10-01T12:00:00Z',
    homeTeam: { id: 'team-a' },
    awayTeam: { id: 'team-b' },
  },
] as MatchSummary[]

test('season persona follows displayed identity then live roles', () => {
  const captainReporter = {
    linkedPlayerId: 'p1',
    roles: [
      { role: 'TEAM_CAPTAIN', scopeType: 'TEAM', scopeId: 't1' },
      { role: 'MATCH_REPORTER', scopeType: 'TOURNAMENT', scopeId: 'cup' },
    ],
  }
  assert.equal(seasonPersona({ ...captainReporter, displayedKind: 'reporter' }), 'reporter')
  assert.equal(seasonPersona({ ...captainReporter, displayedKind: 'captain' }), 'captain')
  assert.equal(seasonPersona({ ...captainReporter, displayedKind: 'player' }), 'player')
  assert.equal(seasonPersona({ ...captainReporter, displayedKind: 'student' }), 'captain')
  assert.equal(
    seasonPersona({ displayedKind: null, linkedPlayerId: 'p1', roles: [] }),
    'player',
  )
  assert.equal(seasonPersona({ displayedKind: 'admin', linkedPlayerId: null, roles: [] }), 'student')
  assert.equal(seasonCardTitle('player'), '我的赛季')
  assert.equal(seasonCardTitle('captain'), '我的赛季')
  assert.equal(seasonCardTitle('reporter'), '我的贡献')
  assert.equal(seasonCardTitle('student'), '我的贡献')
})

test('next team match is the earliest pending fixture, TBD last', () => {
  const next = nextTeamMatch(schedule, 'team-a')
  assert.equal(next?.id, 'soon')
  assert.equal(nextTeamMatch(schedule, 'missing'), null)
  assert.equal(nextFollowedMatch(schedule, ['done', 'tbd', 'later'])?.id, 'later')
  assert.equal(nextFollowedMatch(schedule, ['done']), null)
})

test('reporter summary counts own entered matches, events and corrections', () => {
  const user = { displayName: '嘉言现场', username: 'reporter' }
  const result = summarizeReporter(
    [
      {
        matchId: 'm1',
        confirmedReportVersion: 2,
        latest: {
          savedBy: '嘉言现场',
          action: 'CONFIRM',
          status: 'CONFIRMED',
          eventCount: 4,
        },
        history: [
          { savedBy: '嘉言现场', action: 'SUBMIT', status: 'SUBMITTED', eventCount: 3 },
          { savedBy: '嘉言现场', action: 'CORRECT', status: 'DRAFT', reason: '改比分', eventCount: 4 },
        ],
      },
      {
        matchId: 'm2',
        confirmedReportVersion: null,
        latest: { savedBy: '别人', action: 'SUBMIT', status: 'SUBMITTED', eventCount: 9 },
        history: [],
      },
      {
        matchId: 'm3',
        confirmedReportVersion: 1,
        latest: {
          savedBy: '嘉言现场',
          action: 'SAVE',
          status: 'DRAFT',
          reason: '更正红牌',
          eventCount: 2,
        },
        history: [],
      },
    ],
    user,
  )
  assert.deepEqual(result, { matches: 2, events: 6, corrections: 2 })
  assert.equal(isOwnReportAuthor('reporter', user), true)
  assert.equal(isOwnReportAuthor('赛事工作人员', user), false)
})

test('student activity uses followed matches and real post/like/comment rows', () => {
  const posts = [
    { id: 'a', author: { id: 'me' }, likedByMe: true },
    { id: 'b', author: { id: 'other' }, likedByMe: true },
    { id: 'c', author: { id: 'me' }, likedByMe: false },
  ] as PostSummary[]
  assert.deepEqual(
    studentActivity({
      followedMatchCount: 5,
      posts,
      userId: 'me',
      comments: [
        { author: { id: 'me' } },
        { author: { id: 'other' } },
        { author: { id: 'me' } },
      ] as Array<{ author: { id: string } }>,
    }),
    { followed: 5, comments: 2, likes: 2, posts: 2 },
  )
})

test('captain roster and lineup labels stay explicit', () => {
  assert.equal(rosterStatusLabel('LOCKED'), '已锁定')
  assert.equal(rosterStatusLabel('SUBMITTED'), '审核中')
  assert.equal(rosterStatusLabel(null), '未开放')
  assert.equal(lineupStatusLabel([]), '尚未排阵')
  assert.equal(
    lineupStatusLabel([{ kind: 'TACTIC', confirmedVersion: 1, hasUnconfirmedChanges: false }]),
    '已确认',
  )
  assert.equal(
    lineupStatusLabel([
      { kind: 'MATCH_LINEUP', confirmedVersion: 3, hasUnconfirmedChanges: true },
      { kind: 'TACTIC', confirmedVersion: 1, hasUnconfirmedChanges: false },
    ]),
    '有未确认改动',
  )
  assert.equal(formatCount(3, true), '3')
  assert.equal(formatCount(undefined, false), '—')
})
