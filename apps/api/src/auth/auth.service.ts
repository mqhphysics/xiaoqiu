import { createHash, randomBytes } from 'node:crypto'

import { HttpStatus, Inject, Injectable } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'

import { ApiHttpException } from '../common/api-http.exception'
import { PrismaService } from '../database/prisma.service'
import {
  AuditActorType,
  MembershipStatus,
  UserStatus,
  VerificationLevel,
} from '../generated/prisma/client'
import type {
  AdminIdentityDto,
  AuthUserDto,
  LoginResponseDto,
  RegisterDto,
  ResetPasswordByIdentityDto,
} from './auth.dto'
import { hashPassword, verifyPassword } from './password'

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
    identifier: string,
    password: string,
    request: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<LoginResponseDto> {
    const normalizedIdentifier = normalizeIdentifier(identifier)
    const candidates = await this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        OR: [
          { loginNameNormalized: normalizedIdentifier },
          { displayName: { equals: identifier.trim(), mode: 'insensitive' } },
          { realNameNormalized: normalizedIdentifier },
          { studentId: identifier.trim() },
          { emailNormalized: normalizedIdentifier },
        ],
      },
      include: userInclude,
      take: 10,
    })
    const matchingUsers = candidates.filter(
      (candidate) =>
        candidate.passwordCredential &&
        verifyPassword(
          password,
          candidate.passwordCredential.passwordHash,
          candidate.passwordCredential.passwordSalt,
        ),
    )
    const user = matchingUsers.length === 1 ? matchingUsers[0] : undefined

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

  async register(
    body: RegisterDto,
    organizationId: string,
    request: {
      ip?: string | undefined
      requestId: string
      userAgent?: string | undefined
    },
  ): Promise<LoginResponseDto> {
    const username = normalizeIdentifier(body.username)
    const email = normalizeIdentifier(body.email)
    const studentId = body.studentId.trim()
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, status: 'ACTIVE' },
      select: { id: true },
    })
    if (!organization) {
      throw new ApiHttpException(HttpStatus.NOT_FOUND, {
        code: ERROR_CODES.NOT_FOUND,
        message: '当前组织不可用',
      })
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ loginNameNormalized: username }, { studentId }, { emailNormalized: email }],
      },
      select: {
        loginNameNormalized: true,
        studentId: true,
        emailNormalized: true,
      },
    })
    if (existing) {
      const field =
        existing.loginNameNormalized === username
          ? '用户名'
          : existing.studentId === studentId
            ? '学号'
            : '邮箱'
      throw new ApiHttpException(HttpStatus.CONFLICT, {
        code: ERROR_CODES.CONFLICT,
        message: `${field}已被使用`,
      })
    }

    const credential = hashPassword(body.password)
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          loginNameNormalized: username,
          displayName: body.displayName.trim(),
          realName: body.realName.trim(),
          realNameNormalized: normalizeIdentifier(body.realName),
          studentId,
          email: body.email.trim(),
          emailNormalized: email,
          verificationLevel: VerificationLevel.UNVERIFIED,
          status: UserStatus.ACTIVE,
        },
      })
      await tx.passwordCredential.create({
        data: {
          userId: user.id,
          passwordHash: credential.hash,
          passwordSalt: credential.salt,
          algorithm: credential.algorithm,
        },
      })
      await tx.organizationMembership.create({
        data: {
          organizationId,
          userId: user.id,
          status: MembershipStatus.ACTIVE,
          joinedAt: new Date(),
        },
      })
      await tx.auditLog.create({
        data: {
          organizationId,
          actorType: AuditActorType.USER,
          actorUserId: user.id,
          action: 'ACCOUNT_REGISTERED',
          targetType: 'User',
          targetId: user.id,
          reason: '用户自主注册',
          requestId: request.requestId,
          ipAddress: request.ip ?? null,
          userAgent: request.userAgent?.slice(0, 512) ?? null,
          source: 'API',
        },
      })
    })

    return this.login(username, body.password, request)
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

  async resetPasswordByIdentity(
    body: ResetPasswordByIdentityDto,
    request: {
      ip?: string | undefined
      requestId: string
      userAgent?: string | undefined
    },
  ): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new ApiHttpException(HttpStatus.FORBIDDEN, {
        code: ERROR_CODES.FORBIDDEN,
        message: '请使用已绑定邮箱或联系管理员重置密码',
      })
    }

    const users = await this.prisma.user.findMany({
      where: {
        realNameNormalized: normalizeIdentifier(body.realName),
        studentId: body.studentId.trim(),
        status: UserStatus.ACTIVE,
      },
      include: { memberships: { where: { status: 'ACTIVE' } } },
      take: 2,
    })
    const user = users.length === 1 ? users[0] : undefined
    const membership = user?.memberships[0]
    if (!user || !membership) {
      throw new ApiHttpException(HttpStatus.UNAUTHORIZED, {
        code: ERROR_CODES.UNAUTHORIZED,
        message: '姓名与学号不匹配',
      })
    }

    const password = hashPassword(body.newPassword)
    await this.prisma.$transaction([
      this.prisma.passwordCredential.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          passwordHash: password.hash,
          passwordSalt: password.salt,
          algorithm: password.algorithm,
        },
        update: {
          passwordHash: password.hash,
          passwordSalt: password.salt,
          algorithm: password.algorithm,
        },
      }),
      this.prisma.userSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          organizationId: membership.organizationId,
          actorType: AuditActorType.USER,
          actorUserId: user.id,
          action: 'SELF_PASSWORD_RESET',
          targetType: 'User',
          targetId: user.id,
          reason: '本地演示身份校验',
          requestId: request.requestId,
          ipAddress: request.ip ?? null,
          userAgent: request.userAgent?.slice(0, 512) ?? null,
          source: 'LOCAL_DEMO_RECOVERY',
        },
      }),
    ])
  }

  async listOrganizationIdentities(
    authorization: string | undefined,
    request: {
      ip?: string | undefined
      requestId: string
      userAgent?: string | undefined
    },
  ): Promise<AdminIdentityDto[]> {
    const session = await this.requireSession(authorization)
    const isOrganizationAdmin = session.user.roles.some(
      (assignment) =>
        assignment.role === 'ORGANIZATION_ADMIN' &&
        assignment.scopeType === 'ORGANIZATION' &&
        assignment.scopeId === session.organizationId,
    )
    const isPlatformAdmin = session.user.roles.some(
      (assignment) => assignment.role === 'PLATFORM_ADMIN',
    )
    if (!isOrganizationAdmin && !isPlatformAdmin) {
      throw new ApiHttpException(HttpStatus.FORBIDDEN, {
        code: ERROR_CODES.FORBIDDEN,
        message: '仅组织管理员可查看实名账号目录',
      })
    }

    const memberships = await this.prisma.organizationMembership.findMany({
      where: { organizationId: session.organizationId, status: 'ACTIVE' },
      include: {
        user: {
          include: { roleAssignments: { where: { revokedAt: null } } },
        },
      },
      orderBy: [{ user: { realName: 'asc' } }, { user: { displayName: 'asc' } }],
    })
    await this.prisma.auditLog.create({
      data: {
        organizationId: session.organizationId,
        actorType: AuditActorType.ADMIN,
        actorUserId: session.userId,
        actorRoleSnapshot: session.user.roles.map(({ role, scopeType, scopeId }) => ({
          role,
          scopeType,
          scopeId,
        })),
        action: 'IDENTITY_DIRECTORY_VIEWED',
        targetType: 'Organization',
        targetId: session.organizationId,
        reason: '管理员实名目录查看',
        requestId: request.requestId,
        ipAddress: request.ip ?? null,
        userAgent: request.userAgent?.slice(0, 512) ?? null,
        source: 'API',
      },
    })

    return memberships
      .filter(({ user }) => user.studentId !== null)
      .map(({ user }) => ({
        id: user.id,
        username: user.loginNameNormalized ?? '',
        displayName: user.displayName,
        realName: user.realName,
        studentId: user.studentId,
        email: user.email,
        verificationLevel: user.verificationLevel,
        roles: user.roleAssignments.map((assignment) => assignment.role),
      }))
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
  realName: string | null
  studentId: string | null
  email: string | null
  bio: string | null
  verificationLevel: string
  playerProfile: { id: string; displayName: string; position: string | null } | null
  roleAssignments: Array<{ role: string; scopeType: string; scopeId: string }>
}): AuthUserDto {
  return {
    id: user.id,
    username: user.loginNameNormalized ?? '',
    displayName: user.displayName,
    realName: user.realName,
    studentId: user.studentId,
    email: user.email,
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

function normalizeIdentifier(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN')
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function readBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization?.startsWith('Bearer ')) return undefined
  const token = authorization.slice('Bearer '.length).trim()
  return token || undefined
}
