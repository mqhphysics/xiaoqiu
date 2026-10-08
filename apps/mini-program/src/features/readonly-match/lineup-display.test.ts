import assert from 'node:assert/strict'
import test from 'node:test'
import { createLineupDisplay } from './lineup-display.h5.ts'
import { lineupGroups, type MatchLineup } from './lineup.logic.ts'

const player = (id: string, position: string | null): MatchLineup['players'][number] => ({
  id,
  displayName: id,
  shirtNumber: id,
  position,
  starter: true,
  minutesPlayed: 90,
  pitchPosition: null,
})

test('default display places goalkeeper at the goal and separates defence, midfield and attack without editing facts', () => {
  const players = [
    player('1', 'GOALKEEPER'),
    player('2', 'DEFENDER'),
    player('3', 'DEFENDER'),
    player('4', 'MIDFIELDER'),
    player('5', 'FORWARD'),
  ]
  const before = JSON.stringify(players)
  const display = createLineupDisplay(players)
  assert.equal(display.source, 'DEFAULT')
  const depths = new Map(display.players.map(({ player, point }) => [player.id, point.y]))
  assert.ok(
    depths.get('1')! < depths.get('2')! &&
      depths.get('2')! < depths.get('4')! &&
      depths.get('4')! < depths.get('5')!,
  )
  const defenders = display.players.filter(({ player }) => player.position === 'DEFENDER')
  assert.ok(defenders[0]!.point.x < 50 && defenders[1]!.point.x > 50)
  assert.equal(JSON.stringify(players), before)
})

test('published coordinates take priority over position defaults', () => {
  const players = [
    { ...player('1', 'GOALKEEPER'), pitchPosition: { x: 42, y: 12 } },
    { ...player('2', 'FORWARD'), pitchPosition: { x: 73, y: 66 } },
  ]
  const display = createLineupDisplay(players)
  assert.equal(display.source, 'PUBLISHED')
  assert.deepEqual(
    display.players.map(({ point }) => point),
    players.map(({ pitchPosition }) => pitchPosition),
  )
})

test('defaults preserve two goalkeeper profiles and do not promote bench players', () => {
  const players = [
    player('1', 'GOALKEEPER'),
    player('12', 'GOALKEEPER'),
    { ...player('9', 'FORWARD'), starter: false },
  ]
  const lineup = { players } as MatchLineup
  const display = createLineupDisplay(lineupGroups(lineup).starters)
  assert.deepEqual(
    display.players.map(({ player }) => player.id),
    ['1', '12'],
  )
  assert.notEqual(display.players[0]!.point.x, display.players[1]!.point.x)
  assert.equal(display.players[0]!.point.y, display.players[1]!.point.y)
})

test('missing or invalid coordinates use a bounded default; empty starters remain empty', () => {
  const display = createLineupDisplay([{ ...player('1', null), pitchPosition: { x: -1, y: 200 } }])
  assert.equal(display.source, 'DEFAULT')
  for (const { point } of display.players)
    assert.ok(point.x > 0 && point.x < 100 && point.y > 0 && point.y < 100)
  assert.deepEqual(createLineupDisplay([]).players, [])
})
