import { createHash, randomBytes } from 'node:crypto'

import { HttpStatus, Inject, Injectable } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'

import { ApiHttpException } from '../common/api-http.exception'
import { PrismaService } from '../database/prisma.service'
import { UserStatus } from '../generated/prisma/client'
import type { AuthUserDto, LoginResponseDto } from './auth.dto'
import { verifyPassword } from './password'

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000

export interface AuthenticatedSession {
  sessionId: string
  userId: string
  organizationId: string
  user: AuthUserDto
}

@Injectable()
export class AuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async login(
    username: string,
    password: string,
    request: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<LoginResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { loginNameNormalized: username, status: UserStatus.ACTIVE },
      include: userInclude,
    })

    if (
      !user?.passwordCredential ||
      !verifyPassword(
        password,
        user.passwordCredential.passwordHash,
        user.passwordCredential.passwordSalt,
      )
    ) {
      throw new ApiHttpException(HttpStatus.UNAUTHORIZED, {
        code: ERROR_CODES.UNAUTHORIZED,
        message: '账号或密码不正确',
      })
    }

    const membership = user.memberships.find((item) => item.status === 'ACTIVE')
    if (!membership) {
      throw new ApiHttpException(HttpStatus.FORBIDDEN, {
        code: ERROR_CODES.FORBIDDEN,
        message: '账号当前不属于可用组织',
      })
    }

    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
    await this.prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashToken(token),
        expiresAt,
        lastSeenAt: new Date(),
        ipAddress: request.ip ?? null,
        userAgent: request.userAgent?.slice(0, 512) ?? null,
      },
    })

    return {
      accessToken: token,
      expiresAt: expiresAt.toISOString(),
      user: mapAuthUser(user),
    }
  }

  async getSession(authorization: string | undefined): Promise<AuthenticatedSession | null> {
    const token = readBearerToken(authorization)
    if (!token) return null

    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash: hashToken(token) },
      include: { user: { include: userInclude } },
    })
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      session.user.status !== UserStatus.ACTIVE
    ) {
      return null
    }

    const membership = session.user.memberships.find((item) => item.status === 'ACTIVE')
    if (!membership) return null

    void this.prisma.userSession
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined)

    return {
      sessionId: session.id,
      userId: session.user.id,
      organizationId: membership.organizationId,
      user: mapAuthUser(session.user),
    }
  }

  async requireSession(authorization: string | undefined): Promise<AuthenticatedSession> {
    const session = await this.getSession(authorization)
    if (!session) {
      throw new ApiHttpException(HttpStatus.UNAUTHORIZED, {
        code: ERROR_CODES.UNAUTHORIZED,
        message: '登录状态已失效，请重新登录',
      })
    }
    return session
  }

  async logout(authorization: string | undefined): Promise<void> {
    const token = readBearerToken(authorization)
    if (!token) return

    await this.prisma.userSession.updateMany({
      where: { refreshTokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }
}

const userInclude = {
  passwordCredential: true,
  memberships: true,
  playerProfile: true,
  roleAssignments: { where: { revokedAt: null } },
} as const

function mapAuthUser(user: {
  id: string
  loginNameNormalized: string | null
  displayName: string
  bio: string | null
  verificationLevel: string
  playerProfile: { id: string; displayName: string; position: string | null } | null
  roleAssignments: Array<{ role: string; scopeType: string; scopeId: string }>
}): AuthUserDto {
  return {
    id: user.id,
    username: user.loginNameNormalized ?? '',
    displayName: user.displayName,
    bio: user.bio,
    verificationLevel: user.verificationLevel,
    roles: user.roleAssignments.map((assignment) => ({
      role: assignment.role,
      scopeType: assignment.scopeType,
      scopeId: assignment.scopeId,
    })),
    linkedPlayer: user.playerProfile
      ? {
          id: user.playerProfile.id,
          displayName: user.playerProfile.displayName,
          position: user.playerProfile.position,
        }
      : null,
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function readBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization?.startsWith('Bearer ')) return undefined
  const token = authorization.slice('Bearer '.length).trim()
  return token || undefined
}
