import assert from 'node:assert/strict'
import test from 'node:test'

import { HttpStatus } from '@nestjs/common'
import sharp from 'sharp'

import { ApiHttpException } from '../common/api-http.exception'
import { normalizeAvatarImage } from './media.service'

const OUTPUT_EDGE = 320
const MAX_OUTPUT_BYTES = 72 * 1024

type AvatarSubtype = 'jpeg' | 'png' | 'webp'

for (const subtype of ['png', 'jpeg', 'webp'] as const) {
  test(`normalizeAvatarImage fully decodes ${subtype.toUpperCase()} and emits a metadata-free square WebP`, async () => {
    const source = await createFixture(512, 512, subtype)
    const sourceMetadata = await sharp(source).metadata()
    assert.ok(sourceMetadata.exif, 'the source fixture should contain removable EXIF metadata')

    const normalized = await normalizeAvatarImage(source, subtype)
    assert.equal(normalized.mimeType, 'image/webp')
    assert.equal(normalized.subtype, 'webp')
    assert.equal(normalized.width, OUTPUT_EDGE)
    assert.equal(normalized.height, OUTPUT_EDGE)
    assert.ok(normalized.body.length < MAX_OUTPUT_BYTES)

    const output = sharp(normalized.body, { failOn: 'error' })
    const metadata = await output.metadata()
    assert.equal(metadata.format, 'webp')
    assert.equal(metadata.width, OUTPUT_EDGE)
    assert.equal(metadata.height, OUTPUT_EDGE)
    assert.equal(metadata.orientation, undefined)
    assert.equal(metadata.exif, undefined)
    assert.equal(metadata.icc, undefined)
    assert.equal(metadata.iptc, undefined)
    assert.equal(metadata.xmp, undefined)

    const decoded = await output.raw().toBuffer({ resolveWithObject: true })
    assert.equal(decoded.info.width, OUTPUT_EDGE)
    assert.equal(decoded.info.height, OUTPUT_EDGE)
    assert.equal(
      decoded.data.length,
      decoded.info.width * decoded.info.height * decoded.info.channels,
      'the complete normalized image should decode, not only its header',
    )
  })
}

test('normalizeAvatarImage rejects a declaration that does not match the image bytes', async () => {
  const png = await createFixture(128, 128, 'png')

  await assertBadAvatar(() => normalizeAvatarImage(png, 'jpeg'), '头像文件内容与格式不一致')
})

test('normalizeAvatarImage rejects a damaged image even when its header remains recognizable', async () => {
  const png = await createFixture(128, 128, 'png')
  const truncated = png.subarray(0, png.length - 32)
  const metadata = await sharp(truncated, { failOn: 'none' }).metadata()
  assert.equal(metadata.format, 'png', 'fixture should retain a parseable PNG header')

  await assertBadAvatar(() => normalizeAvatarImage(truncated, 'png'), '头像文件无法完整解码')
})

test('normalizeAvatarImage rejects images that have not been cropped square', async () => {
  const landscape = await createFixture(320, 240, 'jpeg')

  await assertBadAvatar(() => normalizeAvatarImage(landscape, 'jpeg'), '头像必须裁剪为正方形')
})

test('normalizeAvatarImage rejects image dimensions above the server safety limit', async () => {
  const oversized = await createFixture(513, 513, 'webp')

  await assertBadAvatar(() => normalizeAvatarImage(oversized, 'webp'))
})

async function createFixture(
  width: number,
  height: number,
  subtype: AvatarSubtype,
): Promise<Buffer> {
  const pixels = Buffer.allocUnsafe(width * height * 3)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3
      pixels[offset] = (x * 17 + y * 3) % 256
      pixels[offset + 1] = (x * 5 + y * 29) % 256
      pixels[offset + 2] = (x * 11 + y * 7) % 256
    }
  }

  const image = sharp(pixels, { raw: { width, height, channels: 3 } }).withMetadata({
    density: 144,
    orientation: 3,
  })
  if (subtype === 'png') return image.png().toBuffer()
  if (subtype === 'jpeg') return image.jpeg({ quality: 88 }).toBuffer()
  return image.webp({ quality: 88 }).toBuffer()
}

async function assertBadAvatar(
  action: () => Promise<unknown>,
  expectedMessage?: string,
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof ApiHttpException)
    assert.equal(error.getStatus(), HttpStatus.BAD_REQUEST)
    if (expectedMessage) {
      const response = error.getResponse()
      assert.equal(
        typeof response === 'object' && response !== null && 'message' in response
          ? response.message
          : undefined,
        expectedMessage,
      )
    }
    return true
  })
}
