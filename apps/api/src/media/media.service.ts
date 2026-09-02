import { createHash } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { HttpStatus, Inject, Injectable } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import sharp from 'sharp'

import { AuthService } from '../auth/auth.service'
import { ApiHttpException } from '../common/api-http.exception'
import { PrismaService } from '../database/prisma.service'
import { AuditActorType } from '../generated/prisma/client'

const MAX_AVATAR_BYTES = 72 * 1024
const MIN_AVATAR_EDGE = 64
const MAX_AVATAR_EDGE = 512
const AVATAR_DIRECTORY = resolve(__dirname, '../../../../private-data/media/avatars')

export interface StoredAvatar {
  avatarUrl: string
  bytes: number
  height: number
  mimeType: string
  width: number
}

type AvatarSubtype = 'jpeg' | 'png' | 'webp'

@Injectable()
export class MediaService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  async updateMyAvatar(authorization: string | undefined, dataUrl: string, requestId: string) {
    const session = await this.authService.requireSession(authorization)
    const stored = await this.storeAvatar(dataUrl)
    const previousUrls = new Set(
      [session.user.avatarUrl, session.user.linkedPlayer?.avatarUrl].filter(
        (value): value is string => Boolean(value),
      ),
    )
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: session.userId },
          data: { avatarUrl: stored.avatarUrl },
        })
        if (session.user.linkedPlayer) {
          await tx.playerProfile.updateMany({
            where: {
              id: session.user.linkedPlayer.id,
              organizationId: session.organizationId,
            },
            data: { avatarUrl: stored.avatarUrl },
          })
        }
        await tx.auditLog.create({
          data: {
            organizationId: session.organizationId,
            actorType: AuditActorType.USER,
            actorUserId: session.userId,
            actorRoleSnapshot: session.user.roles.map(({ role, scopeType, scopeId }) => ({
              role,
              scopeType,
              scopeId,
            })),
            action: 'USER_AVATAR_UPDATED',
            targetType: 'User',
            targetId: session.userId,
            afterSummary: {
              ...stored,
              linkedPlayerId: session.user.linkedPlayer?.id ?? null,
            },
            reason: '用户裁剪并上传头像，并同步本人球员档案',
            requestId,
            source: 'API',
          },
        })
      })
    } catch (error) {
      await this.cleanupAvatarIfUnreferenced(stored.avatarUrl)
      throw error
    }
    for (const previousUrl of previousUrls) {
      if (previousUrl !== stored.avatarUrl) await this.cleanupAvatarIfUnreferenced(previousUrl)
    }
    return {
      avatar: stored,
      user: (await this.authService.requireSession(authorization)).user,
    }
  }

  async updatePlayerAvatar(
    authorization: string | undefined,
    playerId: string,
    dataUrl: string,
    requestId: string,
  ) {
    const session = await this.authService.requireSession(authorization)
    const canAdminister = session.user.roles.some(
      (assignment) =>
        assignment.role === 'PLATFORM_ADMIN' ||
        (assignment.role === 'ORGANIZATION_ADMIN' &&
          assignment.scopeType === 'ORGANIZATION' &&
          assignment.scopeId === session.organizationId),
    )
    if (session.user.linkedPlayer?.id !== playerId && !canAdminister) {
      throw new ApiHttpException(HttpStatus.FORBIDDEN, {
        code: ERROR_CODES.FORBIDDEN,
        message: '只能修改本人已关联的球员头像',
      })
    }
    const player = await this.prisma.playerProfile.findFirst({
      where: { id: playerId, organizationId: session.organizationId },
      select: { id: true, avatarUrl: true },
    })
    if (!player) throw notFound('球员不存在')

    const stored = await this.storeAvatar(dataUrl)
    try {
      await this.prisma.$transaction([
        this.prisma.playerProfile.update({
          where: { id: playerId },
          data: { avatarUrl: stored.avatarUrl },
        }),
        this.prisma.auditLog.create({
          data: {
            organizationId: session.organizationId,
            actorType: canAdminister ? AuditActorType.ADMIN : AuditActorType.USER,
            actorUserId: session.userId,
            actorRoleSnapshot: session.user.roles.map(({ role, scopeType, scopeId }) => ({
              role,
              scopeType,
              scopeId,
            })),
            action: 'PLAYER_AVATAR_UPDATED',
            targetType: 'PlayerProfile',
            targetId: playerId,
            afterSummary: { ...stored },
            reason: canAdminister ? '管理员更新球员头像' : '球员更新本人头像',
            requestId,
            source: 'API',
          },
        }),
      ])
    } catch (error) {
      await this.cleanupAvatarIfUnreferenced(stored.avatarUrl)
      throw error
    }
    if (player.avatarUrl && player.avatarUrl !== stored.avatarUrl) {
      await this.cleanupAvatarIfUnreferenced(player.avatarUrl)
    }
    return { avatar: stored }
  }

  async readAvatar(fileName: string): Promise<{ body: Buffer; mimeType: string }> {
    if (!/^[a-f0-9]{64}\.(?:webp|png|jpg)$/.test(fileName)) throw notFound('头像不存在')
    try {
      const body = await readFile(resolve(AVATAR_DIRECTORY, fileName))
      const extension = fileName.slice(fileName.lastIndexOf('.') + 1)
      return {
        body,
        mimeType:
          extension === 'webp' ? 'image/webp' : extension === 'png' ? 'image/png' : 'image/jpeg',
      }
    } catch {
      throw notFound('头像不存在')
    }
  }

  private async storeAvatar(dataUrl: string): Promise<StoredAvatar> {
    const match = /^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
    if (!match) throw badAvatar('仅支持裁剪后生成的 WebP、PNG 或 JPEG 头像')
    const body = Buffer.from(match[2]!, 'base64')
    if (body.length < 100 || body.length > MAX_AVATAR_BYTES) {
      throw badAvatar(`头像压缩后需小于 ${MAX_AVATAR_BYTES / 1024} KiB`)
    }
    const normalized = await normalizeAvatarImage(body, match[1]! as AvatarSubtype)

    const hash = createHash('sha256').update(normalized.body).digest('hex')
    const extension = normalized.subtype
    const fileName = `${hash}.${extension}`
    await mkdir(AVATAR_DIRECTORY, { recursive: true })
    try {
      await writeFile(resolve(AVATAR_DIRECTORY, fileName), normalized.body, { flag: 'wx' })
    } catch (error) {
      if (!isAlreadyExists(error)) throw error
    }
    return {
      avatarUrl: `/api/media/avatars/${fileName}`,
      bytes: normalized.body.length,
      height: normalized.height,
      mimeType: normalized.mimeType,
      width: normalized.width,
    }
  }

  private async cleanupAvatarIfUnreferenced(avatarUrl: string): Promise<void> {
    const fileName = avatarUrl.split('/').at(-1)
    if (!fileName || !/^[a-f0-9]{64}\.(?:webp|png|jpg)$/.test(fileName)) return
    const [userReferences, playerReferences] = await Promise.all([
      this.prisma.user.count({ where: { avatarUrl } }),
      this.prisma.playerProfile.count({ where: { avatarUrl } }),
    ])
    if (userReferences + playerReferences > 0) return
    try {
      await unlink(resolve(AVATAR_DIRECTORY, fileName))
    } catch {
      // Missing or concurrently cleaned content-addressed files need no further action.
    }
  }
}

export async function normalizeAvatarImage(
  body: Buffer,
  declaredSubtype: AvatarSubtype,
): Promise<{
  body: Buffer
  height: number
  mimeType: 'image/webp'
  subtype: 'webp'
  width: number
}> {
  let metadata: sharp.Metadata
  try {
    metadata = await sharp(body, {
      failOn: 'error',
      limitInputPixels: MAX_AVATAR_EDGE * MAX_AVATAR_EDGE,
    }).metadata()
  } catch {
    throw badAvatar('头像文件无法完整解码')
  }
  const sourceSubtype = metadata.format === 'jpg' ? 'jpeg' : metadata.format
  if (sourceSubtype !== declaredSubtype) throw badAvatar('头像文件内容与格式不一致')
  const swapsAxes = [5, 6, 7, 8].includes(metadata.orientation ?? 1)
  const width = swapsAxes ? metadata.height : metadata.width
  const height = swapsAxes ? metadata.width : metadata.height
  if (
    !width ||
    !height ||
    width < MIN_AVATAR_EDGE ||
    height < MIN_AVATAR_EDGE ||
    width > MAX_AVATAR_EDGE ||
    height > MAX_AVATAR_EDGE
  ) {
    throw badAvatar(`头像尺寸需在 ${MIN_AVATAR_EDGE}–${MAX_AVATAR_EDGE} 像素之间`)
  }
  if (width !== height) throw badAvatar('头像必须裁剪为正方形')

  const edges = [...new Set([Math.min(width, 320), Math.min(width, 256)])]
  for (const edge of edges) {
    for (const quality of [82, 74, 66, 58]) {
      try {
        const normalized = await sharp(body, {
          failOn: 'error',
          limitInputPixels: MAX_AVATAR_EDGE * MAX_AVATAR_EDGE,
        })
          .rotate()
          .resize(edge, edge, { fit: 'cover', withoutEnlargement: true })
          .webp({ effort: 4, quality })
          .toBuffer()
        if (normalized.length <= MAX_AVATAR_BYTES) {
          return {
            body: normalized,
            height: edge,
            mimeType: 'image/webp',
            subtype: 'webp',
            width: edge,
          }
        }
      } catch {
        throw badAvatar('头像文件无法完整解码')
      }
    }
  }
  throw badAvatar(`头像压缩后需小于 ${MAX_AVATAR_BYTES / 1024} KiB`)
}

function badAvatar(message: string): ApiHttpException {
  return new ApiHttpException(HttpStatus.BAD_REQUEST, {
    code: ERROR_CODES.BAD_REQUEST,
    message,
  })
}

function notFound(message: string): ApiHttpException {
  return new ApiHttpException(HttpStatus.NOT_FOUND, {
    code: ERROR_CODES.NOT_FOUND,
    message,
  })
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST'
}
