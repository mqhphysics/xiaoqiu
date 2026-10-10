import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LEADER_PREVIEW_COUNT,
  groupTableColumns,
  leaderScrollAvailable,
  visibleLeaderRows,
} from './standings-layout.logic.ts'

test('four group tables use two columns only while the standings panel is expanded', () => {
  assert.equal(groupTableColumns(4, true), 2)
  assert.equal(groupTableColumns(3, true), 2)
  assert.equal(groupTableColumns(4, false), 1)
  assert.equal(groupTableColumns(1, true), 1)
  assert.equal(groupTableColumns(0, true), 1)
})

test('player rankings preview inside the module until 查看更多 opens the scroll', () => {
  const rows = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
  assert.equal(leaderScrollAvailable(rows.length), true)
  assert.equal(leaderScrollAvailable(LEADER_PREVIEW_COUNT), false)
  assert.deepEqual(visibleLeaderRows(rows, false), rows.slice(0, LEADER_PREVIEW_COUNT))
  assert.deepEqual(visibleLeaderRows(rows, true), rows)
  assert.deepEqual(visibleLeaderRows(rows.slice(0, 4), false), rows.slice(0, 4))
})
