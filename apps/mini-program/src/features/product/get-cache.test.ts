import assert from 'node:assert/strict'
import test from 'node:test'

import { createGetCache } from './get-cache.ts'

test('a fresh GET is reused and a stale GET is dropped', () => {
  const cache = createGetCache()
  cache.put('home', { ok: true }, '"v1"', 1_000)
  assert.deepEqual(cache.peek('home', 500, 1_200), { ok: true })
  assert.equal(cache.peek('home', 500, 1_600), undefined)
  assert.equal(cache.read('home')?.etag, '"v1"')
  assert.equal(cache.fresh('home', 500, 1_200), true)
  cache.clear()
  assert.equal(cache.read('home'), undefined)
})
