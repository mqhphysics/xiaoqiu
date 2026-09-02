import { HttpStatus, Inject, Injectable } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'

import { AuthService, type AuthenticatedSession } from '../auth/auth.service'
import { ApiHttpException } from '../common/api-http.exception'
import { PrismaService } from '../database/prisma.service'
import {
  AuditActorType,
  NotificationType,
  PostStatus,
  TeamJoinApplicationStatus,
  TeamMembershipStatus,
} from '../generated/prisma/client'
import type {
  PlayerPosition,
  Prisma,
  ReportStatus,
  ReportTargetType,
} from '../generated/prisma/client'
import type {
  CreateReportDto,
  CreateTeamApplicationDto,
  ReviewReportDto,
  ReviewTeamApplicationDto,
  UpdateTeamMemberDto,
} from './social.dto'

export interface NotificationInput {
  actorUserId?: string | null
  body?: string | null
  deduplicationKey?: string
  linkPath?: string | null
  metadata?: Prisma.InputJsonValue
  organizationId: string
  recipientUserId: string
  refreshOnDuplicate?: boolean
  title: string
  type: NotificationType
}

type NotificationClient = Pick<Prisma.TransactionClient, 'userNotification'>

@Injectable()
export class SocialService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  async listPlayerFollows(authorization: string | undefined) {
    const session = await this.authService.requireSession(authorization)
    const follows = await this.prisma.userPlayerFollow.findMany({
      where: { organizationId: session.organizationId, userId: session.userId },
      include: {
        playerProfile: {
          include: {
            teamMemberships: {
              where: { status: TeamMembershipStatus.ACTIVE },
              include: { team: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
    return {
      items: follows.map(({ playerProfile }) => ({
        id: playerProfile.id,
        displayName: playerProfile.displayName,
        position: playerProfile.position,
        avatarUrl: playerProfile.avatarUrl,
        profileColor: playerProfile.profileColor,
        team: playerProfile.teamMemberships[0]?.team
          ? mapTeam(playerProfile.teamMemberships[0].team)
          : null,
      })),
    }
  }

  async followPlayer(authorization: string | undefined, playerId: string) {
    const session = await this.authService.requireSession(authorization)
    const player = await this.prisma.playerProfile.findFirst({
      where: { id: playerId, organizationId: session.organizationId },
      select: { id: true },
    })
    if (!player) throw notFound('球员不存在')
    await this.prisma.userPlayerFollow.upsert({
      where: { userId_playerProfileId: { userId: session.userId, playerProfileId: playerId } },
      create: {
        organizationId: session.organizationId,
        userId: session.userId,
        playerProfileId: playerId,
      },
      update: {},
    })
    return this.listPlayerFollows(authorization)
  }

  async unfollowPlayer(authorization: string | undefined, playerId: string) {
    const session = await this.authService.requireSession(authorization)
    await this.prisma.userPlayerFollow.deleteMany({
      where: {
        organizationId: session.organizationId,
        userId: session.userId,
        playerProfileId: playerId,
      },
    })
    return this.listPlayerFollows(authorization)
  }

  async getTeamRelationship(authorization: string | undefined, teamId: string) {
    const session = await this.authService.requireSession(authorization)
    const [team, membership, application] = await Promise.all([
      this.prisma.team.findFirst({
        where: { id: teamId, organizationId: session.organizationId },
        select: { id: true },
      }),
      this.prisma.teamMembership.findFirst({
        where: {
          organizationId: session.organizationId,
          teamId,
          status: TeamMembershipStatus.ACTIVE,
          OR: [
            { userId: session.userId },
            ...(session.user.linkedPlayer
              ? [{ playerProfileId: session.user.linkedPlayer.id }]
              : []),
          ],
        },
      }),
      this.prisma.teamJoinApplication.findFirst({
        where: {
          organizationId: session.organizationId,
          teamId,
          userId: session.userId,
        },
      }),
    ])
    if (!team) throw notFound('球队不存在')
    return {
      isCaptain: canManageTeam(session, teamId),
      membershipStatus: membership?.status ?? null,
      application: application
        ? {
            id: application.id,
            status: application.status,
            requestedPosition: application.requestedPosition,
            message: application.message,
            decisionNote: application.decisionNote,
            updatedAt: application.updatedAt.toISOString(),
          }
        : null,
    }
  }

  async applyToTeam(
    authorization: string | undefined,
    teamId: string,
    input: CreateTeamApplicationDto,
  ) {
    const session = await this.authService.requireSession(authorization)
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, organizationId: session.organizationId },
      select: { id: true, name: true },
    })
    if (!team) throw notFound('球队不存在')
    const existingMembership = await this.prisma.teamMembership.findFirst({
      where: {
        teamId,
        status: TeamMembershipStatus.ACTIVE,
        OR: [
          { userId: session.userId },
          ...(session.user.linkedPlayer ? [{ playerProfileId: session.user.linkedPlayer.id }] : []),
        ],
      },
      select: { id: true },
    })
    if (existingMembership) throw conflict('你已经是该球队成员')

    const captains = await this.prisma.roleAssignment.findMany({
      where: {
        organizationId: session.organizationId,
        role: 'TEAM_CAPTAIN',
        scopeType: 'TEAM',
        scopeId: teamId,
        revokedAt: null,
      },
      select: { userId: true },
    })
    await this.prisma.$transaction(async (tx) => {
      const application = await tx.teamJoinApplication.upsert({
        where: { teamId_userId: { teamId, userId: session.userId } },
        create: {
          organizationId: session.organizationId,
          teamId,
          userId: session.userId,
          playerProfileId: session.user.linkedPlayer?.id ?? null,
          requestedPosition: (input.requestedPosition as PlayerPosition | undefined) ?? null,
          message: input.message?.trim() || null,
        },
        update: {
          status: TeamJoinApplicationStatus.PENDING,
          playerProfileId: session.user.linkedPlayer?.id ?? null,
          requestedPosition: (input.requestedPosition as PlayerPosition | undefined) ?? null,
          message: input.message?.trim() || null,
          reviewedAt: null,
          reviewedByUserId: null,
          decisionNote: null,
        },
      })
      for (const { userId } of captains) {
        await this.notify(
          {
            actorUserId: session.userId,
            body: `${session.user.displayName} 申请加入 ${team.name}`,
            deduplicationKey: `team-application:${application.id}`,
            linkPath: `/pages/my-team/index?teamId=${encodeURIComponent(teamId)}`,
            organizationId: session.organizationId,
            recipientUserId: userId,
            refreshOnDuplicate: true,
            title: '新的入队申请',
            type: NotificationType.TEAM_APPLICATION,
          },
          tx,
        )
      }
    })
    return this.getTeamRelationship(authorization, teamId)
  }

  async getCaptainWorkspace(authorization: string | undefined, teamId: string) {
    const session = await this.requireTeamManager(authorization, teamId)
    const [team, members, applications, captainAssignments] = await Promise.all([
      this.prisma.team.findFirst({
        where: { id: teamId, organizationId: session.organizationId },
      }),
      this.prisma.teamMembership.findMany({
        where: {
          organizationId: session.organizationId,
          teamId,
          status: TeamMembershipStatus.ACTIVE,
        },
        include: { playerProfile: true, user: true },
        orderBy: [{ position: 'asc' }, { joinedAt: 'asc' }],
      }),
      this.prisma.teamJoinApplication.findMany({
        where: { organizationId: session.organizationId, teamId },
        include: { user: true, playerProfile: true },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.roleAssignment.findMany({
        where: {
          organizationId: session.organizationId,
          role: 'TEAM_CAPTAIN',
          scopeType: 'TEAM',
          scopeId: teamId,
          revokedAt: null,
        },
        select: { userId: true },
      }),
    ])
    if (!team) throw notFound('球队不存在')
    const captainUserIds = new Set(captainAssignments.map(({ userId }) => userId))
    return {
      team: mapTeam(team),
      members: members.map((membership) => ({
        id: membership.id,
        userId: membership.userId,
        playerId: membership.playerProfileId,
        displayName:
          membership.playerProfile?.displayName ?? membership.user?.displayName ?? '未命名成员',
        avatarUrl: membership.playerProfile?.avatarUrl ?? membership.user?.avatarUrl ?? null,
        position: membership.position ?? membership.playerProfile?.position ?? null,
        isCaptain: membership.userId ? captainUserIds.has(membership.userId) : false,
      })),
      applications: applications.map((application) => ({
        id: application.id,
        applicant: {
          id: application.user.id,
          displayName: application.user.displayName,
          avatarUrl: application.user.avatarUrl,
        },
        player: application.playerProfile
          ? {
              id: application.playerProfile.id,
              displayName: application.playerProfile.displayName,
              avatarUrl: application.playerProfile.avatarUrl,
            }
          : null,
        requestedPosition: application.requestedPosition,
        message: application.message,
        status: application.status,
        decisionNote: application.decisionNote,
        createdAt: application.createdAt.toISOString(),
      })),
    }
  }

  async reviewTeamApplication(
    authorization: string | undefined,
    teamId: string,
    applicationId: string,
    input: ReviewTeamApplicationDto,
    requestId: string,
  ) {
    const session = await this.requireTeamManager(authorization, teamId)
    const application = await this.prisma.teamJoinApplication.findFirst({
      where: {
        id: applicationId,
        organizationId: session.organizationId,
        teamId,
        status: TeamJoinApplicationStatus.PENDING,
      },
      include: { team: true, user: true },
    })
    if (!application) throw conflict('该申请已处理或不存在')

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.teamJoinApplication.updateMany({
        where: {
          id: application.id,
          organizationId: session.organizationId,
          teamId,
          status: TeamJoinApplicationStatus.PENDING,
          updatedAt: application.updatedAt,
        },
        data: {
          status: input.decision,
          reviewedByUserId: session.userId,
          reviewedAt: new Date(),
          decisionNote: input.note?.trim() || null,
        },
      })
      if (claimed.count !== 1) throw conflict('该申请刚刚已由其他管理者处理')
      if (input.decision === 'APPROVED') {
        const playerMembership = application.playerProfileId
          ? await tx.teamMembership.findUnique({
              where: {
                teamId_playerProfileId: {
                  teamId,
                  playerProfileId: application.playerProfileId,
                },
              },
            })
          : null
        if (playerMembership) {
          await tx.teamMembership.update({
            where: { id: playerMembership.id },
            data: {
              userId: application.userId,
              position: application.requestedPosition,
              status: TeamMembershipStatus.ACTIVE,
              removedAt: null,
            },
          })
        } else {
          await tx.teamMembership.upsert({
            where: { teamId_userId: { teamId, userId: application.userId } },
            create: {
              organizationId: session.organizationId,
              teamId,
              userId: application.userId,
              playerProfileId: application.playerProfileId,
              position: application.requestedPosition,
            },
            update: {
              playerProfileId: application.playerProfileId,
              position: application.requestedPosition,
              status: TeamMembershipStatus.ACTIVE,
              removedAt: null,
            },
          })
        }
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
          action: 'TEAM_APPLICATION_REVIEWED',
          targetType: 'TeamJoinApplication',
          targetId: application.id,
          afterSummary: { decision: input.decision, note: input.note ?? null },
          reason: '队长处理入队申请',
          requestId,
          source: 'API',
        },
      })
      await this.notify(
        {
          actorUserId: session.userId,
          body: input.note?.trim() || `${application.team.name} 已处理你的入队申请`,
          deduplicationKey: `team-application-decision:${application.id}:${input.decision}`,
          linkPath: `/pages/readonly-team-detail/index?teamId=${encodeURIComponent(teamId)}`,
          organizationId: session.organizationId,
          recipientUserId: application.userId,
          refreshOnDuplicate: true,
          title: input.decision === 'APPROVED' ? '入队申请已通过' : '入队申请未通过',
          type: NotificationType.TEAM_APPLICATION_DECIDED,
        },
        tx,
      )
    })
    return this.getCaptainWorkspace(authorization, teamId)
  }

  async updateTeamMember(
    authorization: string | undefined,
    teamId: string,
    membershipId: string,
    input: UpdateTeamMemberDto,
    requestId: string,
  ) {
    const session = await this.requireTeamManager(authorization, teamId)
    const membership = await this.prisma.teamMembership.findFirst({
      where: {
        id: membershipId,
        organizationId: session.organizationId,
        teamId,
        status: TeamMembershipStatus.ACTIVE,
      },
    })
    if (!membership) throw notFound('球队成员不存在')
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.teamMembership.updateMany({
        where: {
          id: membership.id,
          organizationId: session.organizationId,
          teamId,
          status: TeamMembershipStatus.ACTIVE,
          updatedAt: membership.updatedAt,
        },
        data: { position: input.position as PlayerPosition },
      })
      if (claimed.count !== 1) throw conflict('该成员信息刚刚已被修改，请刷新后重试')
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
          action: 'TEAM_MEMBER_POSITION_UPDATED',
          targetType: 'TeamMembership',
          targetId: membership.id,
          beforeSummary: { position: membership.position },
          afterSummary: { position: input.position },
          reason: '队长调整球队成员位置',
          requestId,
          source: 'API',
        },
      })
    })
    return this.getCaptainWorkspace(authorization, teamId)
  }

  async removeTeamMember(
    authorization: string | undefined,
    teamId: string,
    membershipId: string,
    requestId: string,
  ) {
    const session = await this.requireTeamManager(authorization, teamId)
    const membership = await this.prisma.teamMembership.findFirst({
      where: {
        id: membershipId,
        organizationId: session.organizationId,
        teamId,
        status: TeamMembershipStatus.ACTIVE,
      },
    })
    if (!membership) throw notFound('球队成员不存在')
    if (membership.userId) {
      const captainRole = await this.prisma.roleAssignment.findFirst({
        where: {
          userId: membership.userId,
          role: 'TEAM_CAPTAIN',
          scopeType: 'TEAM',
          scopeId: teamId,
          revokedAt: null,
        },
      })
      if (captainRole) throw conflict('不能从球队中移除现任队长')
    }
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.teamMembership.updateMany({
        where: {
          id: membership.id,
          organizationId: session.organizationId,
          teamId,
          status: TeamMembershipStatus.ACTIVE,
          updatedAt: membership.updatedAt,
        },
        data: { status: TeamMembershipStatus.REMOVED, removedAt: new Date() },
      })
      if (claimed.count !== 1) throw conflict('该成员刚刚已被其他管理者修改，请刷新后重试')
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
          action: 'TEAM_MEMBER_REMOVED',
          targetType: 'TeamMembership',
          targetId: membership.id,
          reason: '队长移除球队成员',
          requestId,
          source: 'API',
        },
      })
    })
    return this.getCaptainWorkspace(authorization, teamId)
  }

  async listNotifications(authorization: string | undefined) {
    const session = await this.authService.requireSession(authorization)
    const where = { organizationId: session.organizationId, recipientUserId: session.userId }
    const [items, unreadCount] = await Promise.all([
      this.prisma.userNotification.findMany({
        where,
        include: { actor: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.userNotification.count({ where: { ...where, readAt: null } }),
    ])
    return {
      unreadCount,
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        body: item.body,
        linkPath: item.linkPath,
        readAt: item.readAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        actor: item.actor
          ? {
              id: item.actor.id,
              displayName: item.actor.displayName,
              avatarUrl: item.actor.avatarUrl,
            }
          : null,
      })),
    }
  }

  async markNotificationRead(authorization: string | undefined, notificationId: string) {
    const session = await this.authService.requireSession(authorization)
    await this.prisma.userNotification.updateMany({
      where: {
        id: notificationId,
        organizationId: session.organizationId,
        recipientUserId: session.userId,
      },
      data: { readAt: new Date() },
    })
    return this.listNotifications(authorization)
  }

  async markAllNotificationsRead(authorization: string | undefined) {
    const session = await this.authService.requireSession(authorization)
    await this.prisma.userNotification.updateMany({
      where: {
        organizationId: session.organizationId,
        recipientUserId: session.userId,
        readAt: null,
      },
      data: { readAt: new Date() },
    })
    return this.listNotifications(authorization)
  }

  async createReport(authorization: string | undefined, input: CreateReportDto) {
    const session = await this.authService.requireSession(authorization)
    await this.validateReportTarget(session, input.targetType, input.targetId)
    const targetId = input.targetType === 'FEEDBACK' ? null : (input.targetId ?? null)
    const reason = input.reason.trim()
    const details = input.details?.trim() || null
    const administrators = await this.prisma.roleAssignment.findMany({
      where: {
        revokedAt: null,
        OR: [
          {
            role: 'PLATFORM_ADMIN',
            OR: [{ organizationId: session.organizationId }, { organizationId: null }],
          },
          {
            organizationId: session.organizationId,
            role: 'ORGANIZATION_ADMIN',
            scopeType: 'ORGANIZATION',
            scopeId: session.organizationId,
          },
        ],
      },
      select: { userId: true },
      distinct: ['userId'],
    })
    const report = await this.prisma.$transaction(async (tx) => {
      const stored = await tx.contentReport.upsert({
        where: {
          reporterUserId_clientReportId: {
            reporterUserId: session.userId,
            clientReportId: input.clientReportId,
          },
        },
        create: {
          organizationId: session.organizationId,
          reporterUserId: session.userId,
          clientReportId: input.clientReportId,
          targetType: input.targetType as ReportTargetType,
          targetId,
          reason,
          details,
        },
        update: {},
      })
      if (
        stored.organizationId !== session.organizationId ||
        stored.targetType !== input.targetType ||
        stored.targetId !== targetId ||
        stored.reason !== reason ||
        stored.details !== details
      ) {
        throw conflict('同一提交编号已用于其他投诉内容，请重新提交')
      }
      for (const { userId } of administrators) {
        await this.notify(
          {
            actorUserId: session.userId,
            body: `${input.targetType === 'FEEDBACK' ? '问题反馈' : '内容投诉'}：${reason}`,
            deduplicationKey: `report-created:${stored.id}`,
            linkPath: '/pages/me/index?panel=reports',
            organizationId: session.organizationId,
            recipientUserId: userId,
            title: '收到新的投诉或反馈',
            type: NotificationType.REPORT_CREATED,
          },
          tx,
        )
      }
      return stored
    })
    return mapReport(report)
  }

  async listMyReports(authorization: string | undefined) {
    const session = await this.authService.requireSession(authorization)
    const reports = await this.prisma.contentReport.findMany({
      where: { organizationId: session.organizationId, reporterUserId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return { items: reports.map(mapReport) }
  }

  async listAdminReports(authorization: string | undefined) {
    const session = await this.requireAdministrator(authorization)
    const reports = await this.prisma.contentReport.findMany({
      where: { organizationId: session.organizationId },
      include: { reporter: true, handledBy: true },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    })
    const postIds = reports
      .filter((item) => item.targetType === 'POST')
      .flatMap((item) => (item.targetId ? [item.targetId] : []))
    const commentIds = reports
      .filter((item) => item.targetType === 'COMMENT')
      .flatMap((item) => (item.targetId ? [item.targetId] : []))
    const reviewIds = reports
      .filter((item) => item.targetType === 'MATCH_REVIEW')
      .flatMap((item) => (item.targetId ? [item.targetId] : []))
    const messageIds = reports
      .filter((item) => item.targetType === 'DIRECT_MESSAGE')
      .flatMap((item) => (item.targetId ? [item.targetId] : []))
    const userIds = reports
      .filter((item) => item.targetType === 'USER')
      .flatMap((item) => (item.targetId ? [item.targetId] : []))
    const [posts, comments, reviews, messages, users] = await Promise.all([
      this.prisma.post.findMany({
        where: { organizationId: session.organizationId, id: { in: postIds } },
        select: { id: true, title: true, body: true },
      }),
      this.prisma.postComment.findMany({
        where: { organizationId: session.organizationId, id: { in: commentIds } },
        select: { id: true, postId: true, body: true },
      }),
      this.prisma.matchReview.findMany({
        where: { organizationId: session.organizationId, id: { in: reviewIds } },
        select: { id: true, matchId: true, rating: true, body: true },
      }),
      this.prisma.directMessage.findMany({
        where: { organizationId: session.organizationId, id: { in: messageIds } },
        select: {
          id: true,
          body: true,
          senderUserId: true,
          sender: { select: { displayName: true } },
          conversation: {
            select: {
              userOne: { select: { id: true, displayName: true } },
              userTwo: { select: { id: true, displayName: true } },
            },
          },
        },
      }),
      this.prisma.user.findMany({
        where: {
          id: { in: userIds },
          memberships: { some: { organizationId: session.organizationId, status: 'ACTIVE' } },
        },
        select: { id: true, displayName: true },
      }),
    ])
    const targetPreviews = new Map<
      string,
      { body: string | null; linkPath: string | null; title: string }
    >()
    for (const post of posts) {
      targetPreviews.set(`POST:${post.id}`, {
        title: post.title ?? '社区动态',
        body: post.body,
        linkPath: `/pages/post-detail/index?postId=${encodeURIComponent(post.id)}`,
      })
    }
    for (const comment of comments) {
      targetPreviews.set(`COMMENT:${comment.id}`, {
        title: '动态评论',
        body: comment.body,
        linkPath: `/pages/post-detail/index?postId=${encodeURIComponent(comment.postId)}`,
      })
    }
    for (const review of reviews) {
      targetPreviews.set(`MATCH_REVIEW:${review.id}`, {
        title: `比赛评分 ${review.rating} 分`,
        body: review.body,
        linkPath: `/pages/readonly-match-detail/index?matchId=${encodeURIComponent(review.matchId)}`,
      })
    }
    for (const message of messages) {
      const counterpart =
        message.conversation.userOne.id === message.senderUserId
          ? message.conversation.userTwo
          : message.conversation.userOne
      targetPreviews.set(`DIRECT_MESSAGE:${message.id}`, {
        title: `${message.sender.displayName} 发给 ${counterpart.displayName} 的私信`,
        body: message.body,
        linkPath: null,
      })
    }
    for (const user of users) {
      targetPreviews.set(`USER:${user.id}`, {
        title: `用户：${user.displayName}`,
        body: null,
        linkPath: null,
      })
    }
    return {
      items: reports.map((report) => ({
        ...mapReport(report),
        targetPreview: report.targetId
          ? (targetPreviews.get(`${report.targetType}:${report.targetId}`) ?? {
              title: '目标内容已不存在',
              body: null,
              linkPath: null,
            })
          : null,
        reporter: {
          id: report.reporter.id,
          displayName: report.reporter.displayName,
          avatarUrl: report.reporter.avatarUrl,
        },
        handledBy: report.handledBy
          ? { id: report.handledBy.id, displayName: report.handledBy.displayName }
          : null,
      })),
    }
  }

  async reviewReport(
    authorization: string | undefined,
    reportId: string,
    input: ReviewReportDto,
    requestId: string,
  ) {
    const session = await this.requireAdministrator(authorization)
    const report = await this.prisma.contentReport.findFirst({
      where: { id: reportId, organizationId: session.organizationId },
    })
    if (!report) throw notFound('投诉或反馈不存在')
    if (input.hideContent && !['POST', 'COMMENT'].includes(report.targetType)) {
      throw badRequest('当前类型不支持直接隐藏内容')
    }
    const actionTaken = input.hideContent ? `HIDDEN_${report.targetType}` : null
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.contentReport.updateMany({
        where: {
          id: report.id,
          organizationId: session.organizationId,
          updatedAt: report.updatedAt,
        },
        data: {
          status: input.status as ReportStatus,
          resolution: input.resolution.trim(),
          actionTaken,
          handledAt: new Date(),
          handledByUserId: session.userId,
        },
      })
      if (claimed.count !== 1) throw conflict('该投诉刚刚已由其他管理员更新，请刷新后重试')
      if (input.hideContent && report.targetId && report.targetType === 'POST') {
        await tx.post.updateMany({
          where: { id: report.targetId, organizationId: session.organizationId },
          data: { status: PostStatus.HIDDEN },
        })
      }
      if (input.hideContent && report.targetId && report.targetType === 'COMMENT') {
        await tx.postComment.updateMany({
          where: { id: report.targetId, organizationId: session.organizationId },
          data: { hiddenAt: new Date() },
        })
      }
      await tx.userNotification.upsert({
        where: {
          recipientUserId_deduplicationKey: {
            recipientUserId: report.reporterUserId,
            deduplicationKey: `report-updated:${report.id}:${input.status}`,
          },
        },
        create: {
          organizationId: session.organizationId,
          recipientUserId: report.reporterUserId,
          actorUserId: session.userId,
          type: NotificationType.REPORT_UPDATED,
          title: '你的投诉或反馈已有处理结果',
          body: input.resolution.trim(),
          linkPath: '/pages/me/index',
          deduplicationKey: `report-updated:${report.id}:${input.status}`,
        },
        update: { body: input.resolution.trim(), readAt: null },
      })
      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          actorType: AuditActorType.ADMIN,
          actorUserId: session.userId,
          actorRoleSnapshot: session.user.roles.map(({ role, scopeType, scopeId }) => ({
            role,
            scopeType,
            scopeId,
          })),
          action: 'CONTENT_REPORT_REVIEWED',
          targetType: 'ContentReport',
          targetId: report.id,
          beforeSummary: { status: report.status },
          afterSummary: { status: input.status, actionTaken, resolution: input.resolution },
          reason: '管理员处理投诉或反馈',
          requestId,
          source: 'API',
        },
      })
    })
    return this.listAdminReports(authorization)
  }

  async notify(input: NotificationInput, client: NotificationClient = this.prisma): Promise<void> {
    if (input.actorUserId && input.actorUserId === input.recipientUserId) return
    if (input.deduplicationKey) {
      await client.userNotification.upsert({
        where: {
          recipientUserId_deduplicationKey: {
            recipientUserId: input.recipientUserId,
            deduplicationKey: input.deduplicationKey,
          },
        },
        create: {
          organizationId: input.organizationId,
          recipientUserId: input.recipientUserId,
          actorUserId: input.actorUserId ?? null,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          linkPath: input.linkPath ?? null,
          ...(input.metadata ? { metadata: input.metadata } : {}),
          deduplicationKey: input.deduplicationKey,
        },
        update: input.refreshOnDuplicate
          ? {
              title: input.title,
              body: input.body ?? null,
              linkPath: input.linkPath ?? null,
              ...(input.metadata ? { metadata: input.metadata } : {}),
              readAt: null,
            }
          : {},
      })
      return
    }
    await client.userNotification.create({
      data: {
        organizationId: input.organizationId,
        recipientUserId: input.recipientUserId,
        actorUserId: input.actorUserId ?? null,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        linkPath: input.linkPath ?? null,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
    })
  }

  private async requireTeamManager(authorization: string | undefined, teamId: string) {
    const session = await this.authService.requireSession(authorization)
    if (!canManageTeam(session, teamId)) {
      throw new ApiHttpException(HttpStatus.FORBIDDEN, {
        code: ERROR_CODES.FORBIDDEN,
        message: '仅球队队长或组织管理员可管理该球队',
      })
    }
    return session
  }

  private async requireAdministrator(authorization: string | undefined) {
    const session = await this.authService.requireSession(authorization)
    const allowed = session.user.roles.some(
      (role) =>
        role.role === 'PLATFORM_ADMIN' ||
        (role.role === 'ORGANIZATION_ADMIN' &&
          role.scopeType === 'ORGANIZATION' &&
          role.scopeId === session.organizationId),
    )
    if (!allowed) {
      throw new ApiHttpException(HttpStatus.FORBIDDEN, {
        code: ERROR_CODES.FORBIDDEN,
        message: '仅组织管理员可处理投诉',
      })
    }
    return session
  }

  private async validateReportTarget(
    session: AuthenticatedSession,
    targetType: CreateReportDto['targetType'],
    targetId: string | undefined,
  ): Promise<void> {
    if (targetType === 'FEEDBACK') {
      if (targetId) throw badRequest('意见反馈不需要目标内容')
      return
    }
    if (!targetId) throw badRequest('请选择要投诉的内容')
    const exists =
      targetType === 'POST'
        ? await this.prisma.post.findFirst({
            where: { id: targetId, organizationId: session.organizationId },
            select: { id: true },
          })
        : targetType === 'COMMENT'
          ? await this.prisma.postComment.findFirst({
              where: { id: targetId, organizationId: session.organizationId },
              select: { id: true },
            })
          : targetType === 'MATCH_REVIEW'
            ? await this.prisma.matchReview.findFirst({
                where: { id: targetId, organizationId: session.organizationId },
                select: { id: true },
              })
            : targetType === 'DIRECT_MESSAGE'
              ? await this.prisma.directMessage.findFirst({
                  where: {
                    id: targetId,
                    organizationId: session.organizationId,
                    senderUserId: { not: session.userId },
                    conversation: {
                      OR: [{ userOneId: session.userId }, { userTwoId: session.userId }],
                    },
                  },
                  select: { id: true },
                })
              : await this.prisma.organizationMembership.findFirst({
                  where: {
                    organizationId: session.organizationId,
                    userId: targetId,
                    status: 'ACTIVE',
                  },
                  select: { id: true },
                })
    if (!exists) throw notFound('要投诉的内容不存在')
  }
}

function canManageTeam(session: AuthenticatedSession, teamId: string): boolean {
  return session.user.roles.some(
    (role) =>
      role.role === 'PLATFORM_ADMIN' ||
      (role.role === 'ORGANIZATION_ADMIN' &&
        role.scopeType === 'ORGANIZATION' &&
        role.scopeId === session.organizationId) ||
      (role.role === 'TEAM_CAPTAIN' && role.scopeType === 'TEAM' && role.scopeId === teamId),
  )
}

function mapTeam(team: {
  id: string
  teamCode: string
  name: string
  shortName: string | null
  collegeName: string | null
  primaryColor: string | null
  secondaryColor: string | null
}) {
  return {
    id: team.id,
    teamCode: team.teamCode,
    name: team.name,
    shortName: team.shortName ?? team.name,
    collegeName: team.collegeName,
    primaryColor: team.primaryColor,
    secondaryColor: team.secondaryColor,
  }
}

function mapReport(report: {
  id: string
  targetType: ReportTargetType
  targetId: string | null
  reason: string
  details: string | null
  status: ReportStatus
  resolution: string | null
  actionTaken: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: report.id,
    targetType: report.targetType,
    targetId: report.targetId,
    reason: report.reason,
    details: report.details,
    status: report.status,
    resolution: report.resolution,
    actionTaken: report.actionTaken,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  }
}

function badRequest(message: string): ApiHttpException {
  return new ApiHttpException(HttpStatus.BAD_REQUEST, {
    code: ERROR_CODES.BAD_REQUEST,
    message,
  })
}

function conflict(message: string): ApiHttpException {
  return new ApiHttpException(HttpStatus.CONFLICT, {
    code: ERROR_CODES.CONFLICT,
    message,
  })
}

function notFound(message: string): ApiHttpException {
  return new ApiHttpException(HttpStatus.NOT_FOUND, {
    code: ERROR_CODES.NOT_FOUND,
    message,
  })
}
