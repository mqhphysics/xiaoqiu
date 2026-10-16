import assert from 'node:assert/strict'
import test from 'node:test'
import {
  nativeFocusLabel,
  nativeFocusMatches,
  nativeFocusValue,
} from './home-display.logic.weapp.ts'
import type { MatchSummary } from '../../features/product/product.types.ts'
const match = (id: string, changes: Partial<MatchSummary> = {}): MatchSummary => ({
  id,
  tournamentId: 'fictional',
  matchCode: id,
  title: '半决赛 1',
  status: 'SCHEDULED',
  scheduledStartAt: '2026-09-01T11:00:00Z',
  homeTeam: null,
  awayTeam: null,
  homeScore: null,
  awayScore: null,
  homePenaltyScore: null,
  awayPenaltyScore: null,
  statusReason: null,
  venue: null,
  ...changes,
})
test('unscored focus games show kickoff date and time on the league clock, while zero stays a score', () => {
  assert.equal(nativeFocusValue(match('upcoming')), '09/01\n19:00')
  assert.equal(
    nativeFocusValue(match('midnight', { scheduledStartAt: '2026-09-01T16:30:00Z' })),
    '09/02\n00:30',
  )
  assert.equal(nativeFocusValue(match('draw', { homeScore: 0, awayScore: 0 })), '0 : 0')
  assert.equal(nativeFocusValue(match('unknown', { scheduledStartAt: null })), '待定')
})
test('focus captions show tournament and round instead of repeated kickoff dates', () => {
  assert.equal(nativeFocusLabel(match('semi'), '绿茵杯'), '绿茵杯 · 半决赛')
  assert.equal(
    nativeFocusLabel(match('group', { title: '小组赛第3轮', roundName: '小组赛' }), '绿茵杯'),
    '绿茵杯 · 小组赛第3轮',
  )
})
test('focus always uses at most two real games and fills a completed tournament without duplicates', () => {
  const recent = match('recent', { status: 'FINISHED' }),
    older = match('older', { status: 'FINISHED', scheduledStartAt: '2026-08-30T02:00:00Z' }),
    upcoming = match('upcoming', { scheduledStartAt: '2026-09-02T11:00:00Z' })
  assert.deepEqual(
    nativeFocusMatches([older, recent, upcoming]).map((item) => item.id),
    ['recent', 'upcoming'],
  )
  assert.deepEqual(
    nativeFocusMatches([older, recent]).map((item) => item.id),
    ['recent', 'older'],
  )
})
