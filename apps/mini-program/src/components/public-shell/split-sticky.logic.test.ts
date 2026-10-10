import assert from 'node:assert/strict'
import test from 'node:test'

import {
  availableStickyHeight,
  chooseStickyIndexes,
  countGridColumns,
  stickyOffset,
} from './split-sticky.logic.ts'

test('countGridColumns keeps minmax tracks intact', () => {
  assert.equal(countGridColumns('none'), 1)
  assert.equal(countGridColumns(''), 1)
  assert.equal(countGridColumns('640px'), 1)
  assert.equal(countGridColumns('minmax(0px, 1fr) 268px'), 2)
  assert.equal(countGridColumns('minmax(0px, 1.9fr) minmax(330px, 1fr)'), 2)
  assert.equal(countGridColumns('200px 180px 160px'), 3)
})

test('sticky offset clears the page header and stays small inside overlays', () => {
  assert.equal(stickyOffset(80, false), 92)
  assert.equal(stickyOffset(80.4, false), 92)
  assert.equal(stickyOffset(0, false), 12)
  assert.equal(stickyOffset(80, true), 12)
})

test('available height subtracts the pin offset and a bottom gap', () => {
  assert.equal(availableStickyHeight(900, 92), 796)
  assert.equal(availableStickyHeight(0, 92), -104)
})

test('only a shorter column that fits the viewport is pinned', () => {
  assert.deepEqual(chooseStickyIndexes([1200, 420], 796, 2), [1])
  assert.deepEqual(chooseStickyIndexes([420, 1200], 796, 2), [0])
  assert.deepEqual(chooseStickyIndexes([1200, 900], 796, 2), [])
  assert.deepEqual(chooseStickyIndexes([800, 804], 900, 2), [])
  assert.deepEqual(chooseStickyIndexes([800, 400], 900, 1), [])
  assert.deepEqual(chooseStickyIndexes([0, 400], 900, 2), [])
  assert.deepEqual(chooseStickyIndexes([400], 900, 2), [])
})
