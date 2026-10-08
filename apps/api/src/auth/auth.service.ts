import { createHash, randomBytes } from 'node:crypto'

import { HttpStatus, Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'

import { ApiHttpException } from '../common/api-http.exception'
import { DEMO_ACCOUNTS, DEMO_ORGANIZATION_ID, fixtureId } from '../database/demo-fixture'
import { PrismaService } from '../database/prisma.service'
import {
  AuditActorType,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
  UserStatus,
  VerificationLevel,
} from '../generated/prisma/client'
import type {
  AdminIdentityDto,
  AuthUserDto,
  LoginResponseDto,
  RegisterDto,
  ResetPasswordByIdentityDto,
  UpdateProfileDto,
} from './auth.dto'
import { hashPassword, verifyPassword } from './password'
import {
  EmailCodeService,
  invalidCode,
  normalizeEmail,
  type EmailRequestContext,
} from './email-code.service'
import { MailService, type EmailPurpose } from './mail.service'
import type { EmailPasswordResetDto, EmailVerificationDto } from './email-auth.dto'

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000
const MAX_ALIAS_CANDIDATES = 10
const DEMO_ACCOUNT_IDS = DEMO_ACCOUNTS.map(({ username }) => fixtureId(`user:${username}`))

export interface AuthenticatedSession {
  sessionId: string
  userId: string
  organizationId: string
  user: AuthUserDto
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(EmailCodeService) private readonly emailCodes?: EmailCodeService,
    @Optional() @Inject(MailService) private readonly mail?: MailService,
  ) {}

  async login(
    identifier: string,
    password: string,
    organizationId: string,
    request: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<LoginResponseDto> {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, status: OrganizationStatus.ACTIVE },
      select: { id: true },
    })
    if (!organization) {
      throw new ApiHttpException(HttpStatus.FORBIDDEN, {
        code: ERROR_CODES.FORBIDDEN,
        message: '当前组织不可用',
      })
    }
    const normalizedIdentifier = normalizeIdentifier(identifier)
    const activeUserWhere = {
      status: UserStatus.ACTIVE,
      memberships: {
        some: { organizationId, status: MembershipStatus.ACTIVE },
      },
    } as const
    // Unique account identifiers take precedence over other people's display names.
    // A numeric username can still collide with another account's student ID.
    let candidates = await this.prisma.user.findMany({
      where: {
        ...activeUserWhere,
        OR: [
          { loginNameNormalized: normalizedIdentifier },
          { studentId: identifier.trim() },
          { emailNormalized: normalizedIdentifier },
        ],
      },
      include: userInclude,
      take: 4,
    })
    if (candidates.length > 3) throw ambiguousIdentifier()
    if (candidates.length === 0) {
      candidates = await this.prisma.user.findMany({
        where: {
          ...activeUserWhere,
          OR: [
            { displayName: { equals: identifier.trim(), mode: 'insensitive' } },
            { realNameNormalized: normalizedIdentifier },
          ],
        },
        include: userInclude,
        take: MAX_ALIAS_CANDIDATES + 1,
      })
      // Never authenticate using an incomplete subset of a larger same-name group.
      if (candidates.length > MAX_ALIAS_CANDIDATES) throw ambiguousIdentifier()
    }
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

    if (!user?.passwordCredential) {
      throw new ApiHttpException(HttpStatus.UNAUTHORIZED, {
        code: ERROR_CODES.UNAUTHORIZED,
        message: '账号或密码不正确',
      })
    }

    const membership = user.memberships.find(
      (item) => item.status === MembershipStatus.ACTIVE && item.organizationId === organizationId,
    )
    if (!membership) {
      throw new ApiHttpException(HttpStatus.FORBIDDEN, {
        code: ERROR_CODES.FORBIDDEN,
        message: '账号当前不属于可用组织',
      })
    }

    return this.createSession(this.prisma, user, organizationId, request)
  }

  private async createSession(
    tx: Prisma.TransactionClient,
    user: Prisma.UserGetPayload<{ include: typeof userInclude }>,
    organizationId: string,
    request: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<LoginResponseDto> {
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
    await tx.userSession.create({
      data: {
        userId: user.id,
        organizationId,
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
      user: mapAuthUser(user, organizationId),
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
    const create = async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: {
          loginNameNormalized: username,
          displayName: body.displayName.trim(),
          realName: body.realName.trim(),
          realNameNormalized: normalizeIdentifier(body.realName),
          studentId,
          email: body.email.trim(),
          emailNormalized: email,
          emailVerifiedAt: this.emailCodes?.enabled ? new Date() : null,
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
    }
    await (
      this.emailCodes?.enabled
        ? this.emailCodes.withCode(
            email,
            'REGISTER',
            organizationId,
            body.emailCode,
            undefined,
            create,
          )
        : this.prisma.$transaction(create)
    ).catch((error: unknown) => rethrowUniqueConflict(error, '用户名、学号或邮箱已被使用'))

    // The verified registration write owns this email; a numeric username may
    // collide with another account's student ID and must not break auto-login.
    return this.login(email, body.password, organizationId, request)
  }

  async requestEmailCode(
    email: string,
    purpose: EmailPurpose,
    organizationId: string,
    request: EmailRequestContext,
    authorization?: string,
  ) {
    const owner = purpose === 'VERIFY_EMAIL' ? await this.requireSession(authorization) : undefined
    if (owner && owner.organizationId !== organizationId) throw invalidCode()
    if (!this.emailCodes) throw invalidCode()
    return this.emailCodes.requestCode(email, purpose, organizationId, request, owner?.userId)
  }

  async loginByEmail(
    body: EmailVerificationDto,
    organizationId: string,
    request: EmailRequestContext,
  ): Promise<LoginResponseDto> {
    if (!this.emailCodes) throw invalidCode()
    return this.emailCodes.withCode(
      body.email,
      'LOGIN',
      organizationId,
      body.emailCode,
      undefined,
      async (tx, userId) => {
        const user = await this.verifiedEmailUser(tx, userId, body.email, organizationId)
        await this.emailAudit(tx, user.id, organizationId, 'EMAIL_LOGIN', request)
        return this.createSession(tx, user, organizationId, request)
      },
    )
  }

  async verifyCurrentEmail(
    authorization: string | undefined,
    body: EmailVerificationDto,
    request: EmailRequestContext,
  ): Promise<AuthUserDto> {
    const session = await this.requireSession(authorization)
    if (!this.emailCodes) throw invalidCode()
    return this.emailCodes.withCode(
      body.email,
      'VERIFY_EMAIL',
      session.organizationId,
      body.emailCode,
      session.userId,
      async (tx) => {
        // Recheck the current binding, never grant verification to a replacement email.
        const changed = await tx.user.updateMany({
          where: {
            id: session.userId,
            emailNormalized: normalizeEmail(body.email),
            status: 'ACTIVE',
          },
          data: { emailVerifiedAt: new Date() },
        })
        if (changed.count !== 1) throw invalidCode()
        await this.emailAudit(tx, session.userId, session.organizationId, 'EMAIL_VERIFIED', request)
        const user = await tx.user.findUniqueOrThrow({
          where: { id: session.userId },
          include: userInclude,
        })
        return mapAuthUser(user, session.organizationId)
      },
    )
  }

  async resetPasswordByEmail(
    body: EmailPasswordResetDto,
    organizationId: string,
    request: EmailRequestContext,
  ): Promise<void> {
    if (!this.emailCodes) throw invalidCode()
    const credential = hashPassword(body.newPassword)
    await this.emailCodes.withCode(
      body.email,
      'RESET_PASSWORD',
      organizationId,
      body.emailCode,
      undefined,
      async (tx, userId) => {
        const user = await this.verifiedEmailUser(tx, userId, body.email, organizationId)
        await tx.passwordCredential.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            passwordHash: credential.hash,
            passwordSalt: credential.salt,
            algorithm: credential.algorithm,
          },
          update: {
            passwordHash: credential.hash,
            passwordSalt: credential.salt,
            algorithm: credential.algorithm,
          },
        })
        await tx.userSession.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        })
        await tx.emailAuthCode.updateMany({
          where: { userId: user.id, consumedAt: null },
          data: { consumedAt: new Date() },
        })
        await this.emailAudit(tx, user.id, organizationId, 'SELF_PASSWORD_RESET', request)
      },
    )
    // Password write already committed. A failed notification cannot undo it.
    void this.mail
      ?.sendPasswordChanged(normalizeEmail(body.email))
      .catch(() => new Logger(AuthService.name).error('PASSWORD_CHANGE_NOTICE_FAILED'))
  }

  private async verifiedEmailUser(
    tx: Prisma.TransactionClient,
    userId: string | null,
    email: string,
    organizationId: string,
  ) {
    if (!userId) throw invalidCode()
    const user = await tx.user.findFirst({
      where: {
        id: userId,
        emailNormalized: normalizeEmail(email),
        emailVerifiedAt: { not: null },
        status: 'ACTIVE',
        memberships: {
          some: { organizationId, status: 'ACTIVE', organization: { status: 'ACTIVE' } },
        },
      },
      include: userInclude,
    })
    if (!user) throw invalidCode()
    return user
  }

  private async emailAudit(
    tx: Prisma.TransactionClient,
    userId: string,
    organizationId: string,
    action: string,
    request: EmailRequestContext,
  ) {
    await tx.auditLog.create({
      data: {
        organizationId,
        actorType: 'USER',
        actorUserId: userId,
        action,
        targetType: 'User',
        targetId: userId,
        reason: '邮箱验证码验证',
        source: 'API',
        requestId: request.requestId,
        ipAddress: request.ip ?? null,
        userAgent: request.userAgent?.slice(0, 512) ?? null,
      },
    })
  }

  async getSession(authorization: string | undefined): Promise<AuthenticatedSession | null> {
    const token = readBearerToken(authorization)
    if (!token) return null

    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash: hashToken(token) },
      include: {
        organization: { select: { status: true } },
        user: { include: userInclude },
      },
    })
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      session.organization.status !== OrganizationStatus.ACTIVE ||
      session.user.status !== UserStatus.ACTIVE
    ) {
      return null
    }

    const membership = session.user.memberships.find(
      (item) =>
        item.status === MembershipStatus.ACTIVE && item.organizationId === session.organizationId,
    )
    if (!membership) return null

    if (!session.lastSeenAt || Date.now() - session.lastSeenAt.getTime() >= 60_000) {
      void this.prisma.userSession
        .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
        .catch(() => undefined)
    }

    return {
      sessionId: session.id,
      userId: session.user.id,
      organizationId: session.organizationId,
      user: mapAuthUser(session.user, session.organizationId),
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

  async updateProfile(
    authorization: string | undefined,
    body: UpdateProfileDto,
    request: { ip?: string | undefined; requestId: string; userAgent?: string | undefined },
  ): Promise<AuthUserDto> {
    const session = await this.requireSession(authorization)
    const email = body.email?.trim() ?? session.user.email
    const emailNormalized = email ? normalizeIdentifier(email) : null
    if (emailNormalized !== (session.user.email ? normalizeIdentifier(session.user.email) : null))
      throw new ApiHttpException(HttpStatus.CONFLICT, {
        code: ERROR_CODES.CONFLICT,
        message: '请通过邮箱换绑窗口验证原邮箱和新邮箱',
      })
    if (body.displayName === undefined && body.bio === undefined)
      throw new ApiHttpException(HttpStatus.BAD_REQUEST, {
        code: ERROR_CODES.BAD_REQUEST,
        message: '请选择要更改的公开资料',
      })

    const before = {
      displayName: session.user.displayName,
      email: session.user.email,
      bio: session.user.bio,
    }
    const user = await this.prisma
      .$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: session.userId },
          data: {
            ...(body.displayName !== undefined ? { displayName: body.displayName.trim() } : {}),
            ...(body.bio !== undefined ? { bio: body.bio?.trim() || null } : {}),
          },
          include: userInclude,
        })
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
            action: 'PROFILE_UPDATED',
            targetType: 'User',
            targetId: session.userId,
            beforeSummary: before,
            afterSummary: {
              displayName: updated.displayName,
              email: updated.email,
              bio: updated.bio,
            },
            reason: '用户修改个人资料',
            requestId: request.requestId,
            ipAddress: request.ip ?? null,
            userAgent: request.userAgent?.slice(0, 512) ?? null,
            source: 'API',
          },
        })
        return updated
      })
      .catch((error: unknown) => rethrowUniqueConflict(error, '该邮箱已被其他账号绑定'))
    return mapAuthUser(user, session.organizationId)
  }

  async resetPasswordByIdentity(
    body: ResetPasswordByIdentityDto,
    request: {
      ip?: string | undefined
      requestId: string
      userAgent?: string | undefined
    },
  ): Promise<void> {
    if (
      process.env.NODE_ENV === 'production' ||
      process.env.ENABLE_DEMO_IDENTITY_RECOVERY !== 'true'
    ) {
      throw new ApiHttpException(HttpStatus.FORBIDDEN, {
        code: ERROR_CODES.FORBIDDEN,
        message: '该找回方式当前未开放，请联系管理员处理',
      })
    }

    const users = await this.prisma.user.findMany({
      where: {
        id: { in: DEMO_ACCOUNT_IDS },
        realNameNormalized: normalizeIdentifier(body.realName),
        studentId: body.studentId.trim(),
        status: UserStatus.ACTIVE,
      },
      include: {
        memberships: {
          where: {
            organizationId: DEMO_ORGANIZATION_ID,
            status: MembershipStatus.ACTIVE,
            organization: { status: OrganizationStatus.ACTIVE },
          },
        },
      },
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
      (assignment) => assignment.role === 'PLATFORM_ADMIN' && assignment.scopeType === 'PLATFORM',
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
          include: {
            roleAssignments: {
              where: {
                revokedAt: null,
                OR: [
                  { organizationId: session.organizationId },
                  { organizationId: null, role: 'PLATFORM_ADMIN' },
                ],
              },
            },
          },
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

function mapAuthUser(
  user: {
    id: string
    loginNameNormalized: string | null
    displayName: string
    realName: string | null
    studentId: string | null
    email: string | null
    emailVerifiedAt?: Date | null
    bio: string | null
    avatarUrl: string | null
    verificationLevel: string
    playerProfile: {
      id: string
      organizationId: string
      displayName: string
      position: string | null
      avatarUrl: string | null
    } | null
    roleAssignments: Array<{
      organizationId: string | null
      role: string
      scopeType: string
      scopeId: string
      grantedAt?: Date
    }>
  },
  organizationId: string,
): AuthUserDto {
  const roles = user.roleAssignments.filter(
    (assignment) =>
      (!assignment.grantedAt || assignment.grantedAt.getTime() <= Date.now()) &&
      ((assignment.organizationId === organizationId && assignment.role !== 'PLATFORM_ADMIN') ||
        (assignment.role === 'PLATFORM_ADMIN' &&
          assignment.organizationId === null &&
          assignment.scopeType === 'PLATFORM')),
  )
  const linkedPlayer =
    user.playerProfile?.organizationId === organizationId ? user.playerProfile : null
  return {
    id: user.id,
    organizationId,
    username: user.loginNameNormalized ?? '',
    displayName: user.displayName,
    realName: user.realName,
    studentId: user.studentId,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    verificationLevel: user.verificationLevel,
    roles: roles.map((assignment) => ({
      role: assignment.role,
      scopeType: assignment.scopeType,
      scopeId: assignment.scopeId,
    })),
    linkedPlayer: linkedPlayer
      ? {
          id: linkedPlayer.id,
          displayName: linkedPlayer.displayName,
          position: linkedPlayer.position,
          avatarUrl: linkedPlayer.avatarUrl,
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
  return authorization?.match(/^Bearer[ \t]+([^\s]+)[ \t]*$/i)?.[1]
}

function ambiguousIdentifier(): ApiHttpException {
  return new ApiHttpException(HttpStatus.UNAUTHORIZED, {
    code: ERROR_CODES.UNAUTHORIZED,
    message: '登录标识无法唯一识别账号，请改用自己的用户名、学号或邮箱',
  })
}

function rethrowUniqueConflict(error: unknown, message: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ApiHttpException(HttpStatus.CONFLICT, { code: ERROR_CODES.CONFLICT, message })
  }
  throw error
}
