import assert from 'node:assert/strict'
import test from 'node:test'

import {
  filterMatches,
  filterTeams,
  findFocusMatch,
  getMatchStatusText,
  getScheduleDateOptions,
  getScheduleStageOptions,
  groupMatchesByDateAndStage,
  sortMatchesByStartAt,
} from './readonly-schedule.logic.ts'
import type { ReadonlyMatch, ReadonlyTeamSummary } from './readonly-schedule.types.ts'

const matches: ReadonlyMatch[] = [
  createMatch('m-3', '2026-07-02T09:00:00+08:00', '八强赛', 'CANCELLED'),
  createMatch('m-1', '2026-07-01T15:00:00+08:00', '小组赛', 'LIVE'),
  createMatch('m-2', '2026-07-01T10:00:00+08:00', '小组赛', 'SCHEDULED'),
  createMatch('m-4', '2026-07-02T11:00:00+08:00', '小组赛', 'FINISHED'),
]

test('sortMatchesByStartAt orders matches by scheduled time', () => {
  assert.deepEqual(
    sortMatchesByStartAt(matches).map((match) => match.id),
    ['m-2', 'm-1', 'm-3', 'm-4'],
  )
})

test('groupMatchesByDateAndStage groups schedule by date then stage', () => {
  const groups = groupMatchesByDateAndStage(matches)

  assert.equal(groups.length, 2)
  assert.equal(groups[0]?.dateKey, '2026-07-01')
  assert.equal(groups[0]?.stages[0]?.stageName, '小组赛')
  assert.deepEqual(
    groups[0]?.stages[0]?.matches.map((match) => match.id),
    ['m-2', 'm-1'],
  )
  assert.equal(groups[1]?.dateKey, '2026-07-02')
  assert.deepEqual(
    groups[1]?.stages.map((stage) => stage.stageName),
    ['八强赛', '小组赛'],
  )
})

test('getMatchStatusText maps readonly match statuses', () => {
  assert.equal(getMatchStatusText('SCHEDULED'), '未开始')
  assert.equal(getMatchStatusText('LIVE'), '进行中')
  assert.equal(getMatchStatusText('POSTPONED'), '已延期')
  assert.equal(getMatchStatusText('CANCELLED'), '已取消')
  assert.equal(getMatchStatusText('FINISHED'), '已结束')
})

test('schedule filters keep date and stage selection deterministic', () => {
  assert.deepEqual(getScheduleDateOptions(matches), ['2026-07-01', '2026-07-02'])
  assert.deepEqual(getScheduleStageOptions(matches), ['小组赛', '八强赛'])
  assert.deepEqual(
    filterMatches(matches, { dateKey: '2026-07-02', stageName: '小组赛' }).map((match) => match.id),
    ['m-4'],
  )
})

test('team search matches public name, short name and stable team code', () => {
  const teams: ReadonlyTeamSummary[] = [
    createTeam('team-b', '江湾联队', '江湾', 'RIVER-02'),
    createTeam('team-a', '星火学院', '星火', 'SPARK-01'),
  ]

  assert.deepEqual(
    filterTeams(teams, ' spark 01 ').map((team) => team.id),
    ['team-a'],
  )
  assert.deepEqual(
    filterTeams(teams, '江湾').map((team) => team.id),
    ['team-b'],
  )
})

test('focus match prefers live then the next scheduled match', () => {
  assert.equal(findFocusMatch(matches, new Date('2026-07-01T08:00:00+08:00'))?.id, 'm-1')

  const withoutLive = matches.map((match) =>
    match.id === 'm-1' ? { ...match, status: 'FINISHED' as const } : match,
  )
  assert.equal(findFocusMatch(withoutLive, new Date('2026-07-01T08:00:00+08:00'))?.id, 'm-2')
})

function createMatch(
  id: string,
  scheduledStartAt: string,
  stageName: string,
  status: ReadonlyMatch['status'],
): ReadonlyMatch {
  return {
    id,
    tournamentId: 'tournament-1',
    stageName,
    roundName: '第 1 轮',
    scheduledStartAt,
    venueName: '东区足球场',
    pitchName: '1 号场',
    homeTeamId: 'team-a',
    awayTeamId: 'team-b',
    homeTeamName: '主队',
    awayTeamName: '客队',
    status,
  }
}

function createTeam(
  id: string,
  name: string,
  shortName: string,
  teamCode: string,
): ReadonlyTeamSummary {
  return {
    id,
    tournamentId: 'tournament-1',
    teamCode,
    name,
    shortName,
    registrationStatus: 'APPROVED',
    rosterStatus: 'LOCKED',
    rosterPlayerCount: 18,
  }
}
