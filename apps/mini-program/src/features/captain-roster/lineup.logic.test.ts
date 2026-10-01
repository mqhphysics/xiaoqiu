import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assignPlayer,
  createFormation,
  draftStorageKey,
  fillByPosition,
  FORMATIONS,
  moveSlot,
  restoreDraft,
} from './lineup.logic.ts'

const players = Array.from({ length: 14 }, (_, i) => ({
  id: `player-${i}`,
  displayName: 'DEMO_FIXTURE 同名球员',
  shirtNumber: String(i + 1),
  avatarUrl: null,
  position: i === 0 ? 'GOALKEEPER' : i < 5 ? 'DEFENDER' : i < 10 ? 'MIDFIELDER' : 'FORWARD',
}))
test('formation switch keeps selected starters and goalkeeper, smaller teams return extras to bench', () => {
  const initial = fillByPosition(createFormation(), players)
  for (const formation of FORMATIONS.filter((item) => item.format === 11)) {
    const changed = createFormation(formation.name, initial)
    assert.deepEqual(
      changed.slots.flatMap((slot) => (slot.playerId ? [slot.playerId] : [])).sort(),
      initial.slots.flatMap((slot) => (slot.playerId ? [slot.playerId] : [])).sort(),
    )
    assert.equal(changed.slots.find((slot) => slot.label === 'GK')!.playerId, 'player-0')
  }
  const smaller = createFormation('1-2-1', initial)
  assert.equal(smaller.slots.filter((slot) => slot.playerId).length, 5)
  assert.equal(smaller.slots.find((slot) => slot.label === 'GK')!.playerId, 'player-0')
})
test('occupied drops swap identities; bench replacement demotes the displaced player; removing never creates duplicates', () => {
  const initial = fillByPosition(createFormation(), players)
  const first = initial.slots[0]!,
    second = initial.slots[1]!
  const swapped = assignPlayer(initial, first.playerId!, second.id)
  assert.equal(swapped.slots[0]!.playerId, second.playerId)
  assert.equal(swapped.slots[1]!.playerId, first.playerId)
  const replaced = assignPlayer(swapped, 'player-13', second.id)
  assert.equal(replaced.slots[1]!.playerId, 'player-13')
  assert.equal(
    replaced.slots.some((slot) => slot.playerId === first.playerId),
    false,
  )
  const removed = assignPlayer(replaced, 'player-13', null)
  assert.equal(removed.slots[1]!.playerId, null)
  assert.equal(assignPlayer(initial, first.playerId!, 'missing'), initial)
  assert.equal(new Set(swapped.slots.map((slot) => slot.playerId)).size, 11)
})
test('draft restore removes departed players and duplicates, clamps coordinates and rejects malformed storage', () => {
  const initial = fillByPosition(createFormation(), players)
  initial.slots[0]!.x = -100
  initial.slots[1]!.playerId = initial.slots[0]!.playerId
  const restored = restoreDraft(initial, players.slice(1))!
  assert.equal(restored.slots[0]!.x, 8)
  assert.equal(restored.slots[1]!.playerId, null)
  assert.equal(
    restored.slots.some((slot) => slot.playerId === 'player-0'),
    false,
  )
  assert.equal(restoreDraft({ ...initial, slots: [initial.slots[0]] }, players), null)
  assert.equal(
    restoreDraft(
      { ...initial, slots: initial.slots.map((slot) => ({ ...slot, id: 'duplicate' })) },
      players,
    ),
    null,
  )
  assert.equal(restoreDraft(null, players), null)
  assert.notEqual(
    draftStorageKey('org', 'account-A', 'tournament', 'team'),
    draftStorageKey('org', 'account-B', 'tournament', 'team'),
  )
})
test('custom positioning remains in the pitch and rejects nonfinite gesture coordinates', () => {
  const draft = createFormation()
  const moved = moveSlot(draft, draft.slots[0]!.id, -20, 120)
  assert.equal(moved.custom, true)
  assert.equal(moved.slots[0]!.x, 8)
  assert.equal(moved.slots[0]!.y, 91)
  assert.equal(moveSlot(draft, draft.slots[0]!.id, NaN, 10), draft)
})
