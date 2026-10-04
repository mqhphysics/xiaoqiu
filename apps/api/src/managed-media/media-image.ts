import { createHash } from 'node:crypto'
import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import sharp from 'sharp'
import { ApiHttpException } from '../common/api-http.exception'
import { normalizeAvatarImage } from '../media/media.service'
import type { MediaPurpose } from './managed-media.dto'

export interface ValidatedMedia {
  body: Buffer
  poster: Buffer
  mimeType: 'image/gif' | 'image/webp'
  checksum: string
  width: number
  height: number
  frames: number
  durationMs: number
}

export function invalidMedia(message: string) {
  return new ApiHttpException(HttpStatus.BAD_REQUEST, { code: ERROR_CODES.BAD_REQUEST, message })
}

export async function validateMedia(
  dataUrl: string,
  purpose: MediaPurpose,
): Promise<ValidatedMedia> {
  const match = /^data:image\/(gif|jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match || match[2]!.length % 4 !== 0)
    throw invalidMedia('请选择完整的 GIF、JPEG、PNG 或 WebP 图片')
  const subtype = match[1]!
  if ((purpose === 'GOAL_GIF') !== (subtype === 'gif'))
    throw invalidMedia('进球投稿仅支持 GIF；资料照片不支持动画')
  const source = Buffer.from(match[2]!, 'base64')
  if (source.toString('base64') !== match[2]) throw invalidMedia('图片编码无效')
  const limit = purpose === 'GOAL_GIF' ? 6 * 1024 * 1024 : 4 * 1024 * 1024
  if (source.length > limit) throw invalidMedia(`文件不能超过 ${limit / 1024 / 1024} MiB`)
  try {
    const metadata = await sharp(source, {
      animated: true,
      failOn: 'error',
      limitInputPixels: 32 * 1024 * 1024,
    }).metadata()
    if (metadata.format !== subtype) throw invalidMedia('声明格式与实际图片内容不一致')
    const width = metadata.width ?? 0
    const height = metadata.pageHeight ?? metadata.height ?? 0
    const frames = metadata.pages ?? 1
    if (purpose === 'GOAL_GIF') {
      if (width < 16 || height < 16 || width > 960 || height > 960 || frames < 2 || frames > 120)
        throw invalidMedia('GIF 需为 16–960 像素、2–120 帧')
      const durationMs = (metadata.delay ?? []).reduce((sum, delay) => sum + Math.max(20, delay), 0)
      if (durationMs < 40 || durationMs > 15_000 || (metadata.delay?.length ?? 0) !== frames)
        throw invalidMedia('GIF 单次播放不能超过 15 秒')
      // Decode EVERY frame and re-encode. Uploaded bytes/metadata/trailing payloads are never served.
      const body = await sharp(source, {
        animated: true,
        failOn: 'error',
        limitInputPixels: 32 * 1024 * 1024,
      })
        .gif({ effort: 3, loop: 1, delay: metadata.delay!.map((delay) => Math.max(20, delay)) })
        .toBuffer()
      if (body.length > limit) throw invalidMedia('处理后的 GIF 超过 6 MiB')
      const poster = await sharp(body, { page: 0, pages: 1, failOn: 'error' })
        .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 76 })
        .toBuffer()
      return {
        body,
        poster,
        mimeType: 'image/gif',
        checksum: digest(body),
        width,
        height,
        frames,
        durationMs,
      }
    }
    if (frames !== 1 || width < 64 || height < 64 || width > 4096 || height > 4096)
      throw invalidMedia('资料图片需为 64–4096 像素的静态图片')
    let body: Buffer
    if (purpose === 'USER_AVATAR') {
      body = (await normalizeAvatarImage(source, subtype as 'jpeg' | 'png' | 'webp')).body
    } else {
      const edge = purpose === 'USER_BACKGROUND' ? 1600 : 1200
      body = await sharp(source, { failOn: 'error', limitInputPixels: 16 * 1024 * 1024 })
        .rotate()
        .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toBuffer()
    }
    if (body.length > 2 * 1024 * 1024) throw invalidMedia('处理后的图片超过 2 MiB')
    const output = await sharp(body).metadata()
    const poster = await sharp(body)
      .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 76 })
      .toBuffer()
    return {
      body,
      poster,
      mimeType: 'image/webp',
      checksum: digest(body),
      width: output.width!,
      height: output.height!,
      frames: 1,
      durationMs: 0,
    }
  } catch (error) {
    if (error instanceof ApiHttpException) throw error
    throw invalidMedia('图片无法完整解码或超出处理限制')
  }
}

function digest(body: Buffer) {
  return createHash('sha256').update(body).digest('hex')
}
