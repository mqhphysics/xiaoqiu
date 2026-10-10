import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

import { DEMO_POSTS } from '../database/demo-fixture'
import { DEMO_PHOTO_ALBUMS, demoPhotoAlbumUrls } from './demo-photo-albums'
import { postImageUrls } from './media.service'

test('demo photo albums expand from a readable cover and leave single photos alone', () => {
  assert.deepEqual(demoPhotoAlbumUrls('/api/media/demo/photos/08.webp'), [
    '/api/media/demo/photos/08.webp',
    '/api/media/demo/photos/10.webp',
    '/api/media/demo/photos/14.webp',
  ])
  assert.deepEqual(postImageUrls('https://xiaoqiu.example/api/media/demo/photos/11.webp'), [
    'https://xiaoqiu.example/api/media/demo/photos/11.webp',
    'https://xiaoqiu.example/api/media/demo/photos/16.webp',
  ])
  assert.equal(demoPhotoAlbumUrls('/api/media/demo/photos/04.webp'), null)
  assert.deepEqual(postImageUrls('/api/media/demo/photos/07.webp'), [
    '/api/media/demo/photos/07.webp',
  ])
  assert.deepEqual(
    postImageUrls(
      '/api/media/posts/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-3-0.webp',
    ).length,
    3,
  )
})

test('every demo album frame is a real photo and the cover is used by exactly one post', async () => {
  const photoDir = resolve(process.cwd(), 'demo-media/photos')
  for (const [cover, frames] of Object.entries(DEMO_PHOTO_ALBUMS)) {
    assert.equal(frames[0], cover)
    assert.ok(frames.length >= 2 && frames.length <= 9)
    assert.equal(
      DEMO_POSTS.filter((post) => post.imageUrl?.endsWith(`/photos/${cover}.webp`)).length,
      1,
      `cover ${cover} should belong to one demo post`,
    )
    for (const frame of frames) {
      assert.match(frame, /^(0[1-9]|1[0-6])$/)
      await access(resolve(photoDir, `${frame}.webp`))
    }
  }
})
