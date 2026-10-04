import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import { validateMedia } from './media-image'
import { dataUrl, gifFixture } from './media-test-fixtures'

test('GIF fully decodes every frame, normalizes animation, and has a static WebP poster', async () => {
  const source = await gifFixture()
  const result = await validateMedia(dataUrl(source, 'gif'), 'GOAL_GIF')
  assert.equal(result.frames, 3)
  assert.equal(result.durationMs, 300)
  const decoded = await sharp(result.body, { animated: true })
    .raw()
    .toBuffer({ resolveWithObject: true })
  assert.equal(decoded.info.height, 96)
  const poster = await sharp(result.poster).metadata()
  assert.equal(poster.format, 'webp')
  assert.equal(poster.pages ?? 1, 1)
})

test('GIF rejects forged format, truncation, frame/duration/dimension bombs, and static files', async () => {
  const gif = await gifFixture()
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#339955' } })
    .png()
    .toBuffer()
  for (const candidate of [
    dataUrl(png, 'gif'),
    dataUrl(gif.subarray(0, Math.floor(gif.length / 2)), 'gif'),
    dataUrl(await gifFixture(121), 'gif'),
    dataUrl(await gifFixture(2, 8000), 'gif'),
    dataUrl(await gifFixture(2, 100, 961, 16), 'gif'),
    dataUrl(png, 'png'),
  ])
    await assert.rejects(validateMedia(candidate, 'GOAL_GIF'))
  await assert.rejects(validateMedia(dataUrl(Buffer.alloc(6 * 1024 * 1024 + 1), 'gif'), 'GOAL_GIF'))
})

test('static purposes strip metadata, preserve separate shape rules, and reject animation', async () => {
  const source = await sharp({
    create: { width: 1600, height: 900, channels: 3, background: '#664433' },
  })
    .withMetadata()
    .jpeg()
    .toBuffer()
  const background = await validateMedia(dataUrl(source, 'jpeg'), 'USER_BACKGROUND')
  assert.equal(background.width, 1600)
  assert.equal(background.height, 900)
  assert.equal((await sharp(background.body).metadata()).exif, undefined)
  const portrait = await validateMedia(dataUrl(source, 'jpeg'), 'PLAYER_PORTRAIT')
  assert.equal(portrait.width, 1200)
  await assert.rejects(validateMedia(dataUrl(source, 'jpeg'), 'USER_AVATAR'))
  await assert.rejects(validateMedia(dataUrl(await gifFixture(), 'gif'), 'PLAYER_PORTRAIT'))
  await assert.rejects(validateMedia(dataUrl(source, 'png'), 'USER_BACKGROUND'))
  await assert.rejects(
    validateMedia('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'USER_BACKGROUND'),
  )
})
