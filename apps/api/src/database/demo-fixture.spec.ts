import assert from 'node:assert/strict'
import test from 'node:test'

import { DEMO_MATCHES, DEMO_PLAYERS, DEMO_TEAMS, type DemoMatchDefinition } from './demo-fixture'
import { DEMO_STARTERS_PER_TEAM, isDemoMatchStarter } from './seed-demo-competition'

test('2026 demo fixture contains 16 teams and 14 stable demo players per team', () => {
  assert.equal(DEMO_TEAMS.length, 16)
  assert.equal(DEMO_PLAYERS.length, 224)
  assert.equal(new Set(DEMO_TEAMS.map((team) => team.code)).size, 16)
  assert.ok(DEMO_TEAMS.every((team) => team.code.startsWith('DEMO-')))
  assert.equal(new Set(DEMO_PLAYERS.map((player) => player.id)).size, 224)
  assert.equal(new Set(DEMO_PLAYERS.map((player) => player.sourceKey)).size, 224)

  for (const teamIndex of DEMO_TEAMS.keys()) {
    const players = DEMO_PLAYERS.filter((player) => player.teamIndex === teamIndex)
    assert.equal(players.length, 14)
    assert.ok(players.every((player) => player.sourceKey.startsWith('DEMO-2026-DEMO-')))
  }
})

test('2026 knockout facts form a 16-team champion path with an independent third-place branch', () => {
  const knockoutMatches = DEMO_MATCHES.filter(
    (match) => match.tournament === '2026' && match.stage === 'KNOCKOUT',
  )
  const rounds = new Map<number, DemoMatchDefinition[]>()
  for (const match of knockoutMatches) {
    rounds.set(match.round, [...(rounds.get(match.round) ?? []), match])
  }
  for (const matches of rounds.values()) matches.sort(compareMatchCode)

  const roundOf16 = rounds.get(1) ?? []
  const quarterfinals = rounds.get(2) ?? []
  const semifinals = rounds.get(3) ?? []
  const finalRound = rounds.get(4) ?? []
  assert.deepEqual(
    [roundOf16.length, quarterfinals.length, semifinals.length, finalRound.length],
    [8, 4, 2, 2],
  )

  const openingTeamIndexes = roundOf16.flatMap((match) => [
    match.homeTeamIndex,
    match.awayTeamIndex,
  ])
  assert.equal(
    openingTeamIndexes.every((teamIndex) => teamIndex !== undefined),
    true,
  )
  assert.equal(new Set(openingTeamIndexes).size, 16)

  assertProgression(roundOf16, quarterfinals)
  assertProgression(quarterfinals, semifinals)

  const championshipFinal = finalRound.find((match) => match.code === 'GC26-FINAL')
  const thirdPlace = finalRound.find((match) => match.code === 'GC26-THIRD')
  assert.ok(championshipFinal)
  assert.ok(thirdPlace)
  assert.equal(championshipFinal.homeTeamIndex, winnerIndex(semifinals[0]!))
  assert.equal(championshipFinal.awayTeamIndex, undefined)
  assert.equal(thirdPlace.homeTeamIndex, loserIndex(semifinals[0]!))
  assert.equal(thirdPlace.awayTeamIndex, undefined)
  assert.notEqual(thirdPlace.code, championshipFinal.code)
})

test('every team with seeded appearances has exactly 8 starters per match', () => {
  assert.equal(DEMO_STARTERS_PER_TEAM, 8)

  const matchesWithAppearances = DEMO_MATCHES.filter(
    (match) =>
      match.homeTeamIndex !== undefined &&
      match.awayTeamIndex !== undefined &&
      match.homeScore !== undefined &&
      match.awayScore !== undefined &&
      (match.status === 'FINISHED' || match.status === 'LIVE'),
  )
  assert.ok(matchesWithAppearances.length > 0)

  for (const match of matchesWithAppearances) {
    for (const teamIndex of [match.homeTeamIndex!, match.awayTeamIndex!]) {
      const teamPlayers = DEMO_PLAYERS.filter((player) => player.teamIndex === teamIndex)
      assert.equal(
        teamPlayers.filter((_, playerIndex) => isDemoMatchStarter(playerIndex)).length,
        8,
        `${match.code} team ${teamIndex} should seed exactly 8 starters`,
      )
    }
  }
})

function assertProgression(
  sourceMatches: DemoMatchDefinition[],
  targetMatches: DemoMatchDefinition[],
) {
  assert.equal(sourceMatches.length, targetMatches.length * 2)
  for (const [targetIndex, target] of targetMatches.entries()) {
    assert.equal(target.homeTeamIndex, winnerIndex(sourceMatches[targetIndex * 2]!))
    assert.equal(target.awayTeamIndex, winnerIndex(sourceMatches[targetIndex * 2 + 1]!))
  }
}

function winnerIndex(match: DemoMatchDefinition): number {
  assert.notEqual(match.homeTeamIndex, undefined)
  assert.notEqual(match.awayTeamIndex, undefined)
  assert.notEqual(match.homeScore, undefined)
  assert.notEqual(match.awayScore, undefined)
  if (match.homeScore! > match.awayScore!) return match.homeTeamIndex!
  if (match.homeScore! < match.awayScore!) return match.awayTeamIndex!
  assert.notEqual(match.homePenaltyScore, undefined)
  assert.notEqual(match.awayPenaltyScore, undefined)
  return match.homePenaltyScore! > match.awayPenaltyScore!
    ? match.homeTeamIndex!
    : match.awayTeamIndex!
}

function loserIndex(match: DemoMatchDefinition): number {
  const winner = winnerIndex(match)
  return match.homeTeamIndex === winner ? match.awayTeamIndex! : match.homeTeamIndex!
}

function compareMatchCode(left: DemoMatchDefinition, right: DemoMatchDefinition): number {
  return left.code.localeCompare(right.code, 'en', { numeric: true })
}
