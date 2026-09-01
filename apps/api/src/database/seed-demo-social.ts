import { createHash } from 'node:crypto'

import { MembershipStatus, PostStatus, RoleScopeType, UserStatus } from '../generated/prisma/client'
import type { Prisma } from '../generated/prisma/client'
import { hashPassword } from '../auth/password'
import { DEMO_ACCOUNTS, DEMO_PASSWORD, DEMO_PLAYERS, DEMO_POSTS, fixtureId } from './demo-fixture'

export async function seedDemoAccountsAndCommunity(
  tx: Prisma.TransactionClient,
  organizationId: string,
  tournamentId: string,
  teams: Array<{ id: string }>,
): Promise<void> {
  const usersByUsername = new Map<string, string>()

  for (const account of DEMO_ACCOUNTS) {
    const userId = fixtureId(`user:${account.username}`)
    const linkedPlayer =
      account.linkedTeamIndex === undefined || account.linkedPlayerIndex === undefined
        ? undefined
        : DEMO_PLAYERS[account.linkedTeamIndex * 14 + account.linkedPlayerIndex]

    await tx.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        loginNameNormalized: account.username,
        displayName: account.displayName,
        realName: account.realName,
        realNameNormalized: account.realName.trim().toLowerCase(),
        studentId: account.studentId,
        email: account.email,
        emailNormalized: account.email.toLowerCase(),
        bio: account.bio,
        verificationLevel: account.verificationLevel,
        playerProfileId: linkedPlayer?.id ?? null,
        status: UserStatus.ACTIVE,
      },
      update: {
        loginNameNormalized: account.username,
        displayName: account.displayName,
        realName: account.realName,
        realNameNormalized: account.realName.trim().toLowerCase(),
        studentId: account.studentId,
        email: account.email,
        emailNormalized: account.email.toLowerCase(),
        bio: account.bio,
        verificationLevel: account.verificationLevel,
        playerProfileId: linkedPlayer?.id ?? null,
        status: UserStatus.ACTIVE,
      },
    })

    const salt = createHash('sha256')
      .update(`xiaoqiu-demo:${account.username}`)
      .digest('hex')
      .slice(0, 32)
    const password = hashPassword(DEMO_PASSWORD, salt)
    await tx.passwordCredential.upsert({
      where: { userId },
      create: {
        id: fixtureId(`credential:${account.username}`),
        userId,
        passwordHash: password.hash,
        passwordSalt: password.salt,
        algorithm: password.algorithm,
      },
      update: {
        passwordHash: password.hash,
        passwordSalt: password.salt,
        algorithm: password.algorithm,
      },
    })

    await tx.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId, userId } },
      create: {
        id: fixtureId(`membership:${account.username}`),
        organizationId,
        userId,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date('2026-08-20T08:00:00+08:00'),
      },
      update: { status: MembershipStatus.ACTIVE },
    })

    await tx.roleAssignment.deleteMany({ where: { userId } })
    for (const [roleIndex, assignment] of account.roles.entries()) {
      const scopeType =
        assignment.scope === 'TEAM'
          ? RoleScopeType.TEAM
          : assignment.scope === 'TOURNAMENT'
            ? RoleScopeType.TOURNAMENT
            : RoleScopeType.ORGANIZATION
      const scopeId =
        assignment.scope === 'TEAM'
          ? teams[account.linkedTeamIndex ?? account.primaryTeamIndex]!.id
          : assignment.scope === 'TOURNAMENT'
            ? tournamentId
            : organizationId
      await tx.roleAssignment.create({
        data: {
          id: fixtureId(`role:${account.username}:${roleIndex}`),
          organizationId,
          userId,
          role: assignment.role,
          scopeType,
          scopeId,
          grantedByUserId: userId,
        },
      })
    }

    await tx.userTeamPreference.deleteMany({ where: { userId } })
    await tx.userTeamPreference.create({
      data: {
        id: fixtureId(`preference:${account.username}:primary`),
        organizationId,
        userId,
        teamId: teams[account.primaryTeamIndex]!.id,
        isPrimary: true,
      },
    })
    for (const teamIndex of account.followedTeamIndexes) {
      if (teamIndex === account.primaryTeamIndex) continue
      await tx.userTeamPreference.create({
        data: {
          id: fixtureId(`preference:${account.username}:${teamIndex}`),
          organizationId,
          userId,
          teamId: teams[teamIndex]!.id,
          isPrimary: false,
        },
      })
    }

    usersByUsername.set(account.username, userId)
  }

  const postIds = DEMO_POSTS.map((post) => fixtureId(`post:${post.key}`))
  await tx.post.deleteMany({ where: { id: { in: postIds } } })

  for (const [postIndex, post] of DEMO_POSTS.entries()) {
    const postId = fixtureId(`post:${post.key}`)
    const authorUserId = post.authorUsername
      ? usersByUsername.get(post.authorUsername)
      : usersByUsername.get('admin')
    await tx.post.create({
      data: {
        id: postId,
        organizationId,
        tournamentId,
        authorUserId: authorUserId ?? null,
        type: post.type,
        status: PostStatus.PUBLISHED,
        title: post.title ?? null,
        body: post.body,
        publishedAt: new Date(post.publishedAt),
      },
    })

    const likerUsernames = DEMO_ACCOUNTS.slice(0, Math.min(5, postIndex + 2)).map(
      (account) => account.username,
    )
    await tx.postLike.createMany({
      data: likerUsernames.map((username) => ({
        id: fixtureId(`like:${post.key}:${username}`),
        organizationId,
        postId,
        userId: usersByUsername.get(username)!,
      })),
    })

    const commenter = DEMO_ACCOUNTS[(postIndex + 1) % DEMO_ACCOUNTS.length]!.username
    await tx.postComment.create({
      data: {
        id: fixtureId(`comment:${post.key}:${commenter}`),
        organizationId,
        postId,
        userId: usersByUsername.get(commenter)!,
        body:
          post.type === 'OFFICIAL'
            ? '收到，赛程和数据页都已经同步更新。'
            : '现场确实很有气氛，下一场继续加油！',
        createdAt: new Date(new Date(post.publishedAt).getTime() + 45 * 60 * 1000),
      },
    })
  }

  const reviewFixtures = [
    {
      matchCode: 'GC26-SF-01',
      username: 'student',
      rating: 5,
      body: '淘汰赛强度一下就上来了，双方最后二十分钟都踢得很有内容。',
    },
    {
      matchCode: 'GC26-SF-01',
      username: 'player',
      rating: 4,
      body: '攻防转换很快，一队对第二落点的控制是胜负关键。',
    },
    {
      matchCode: 'GC26-SF-01',
      username: 'reporter',
      rating: 5,
      body: '现场节奏和看台氛围都很好，比赛事件已经完成复核。',
    },
    {
      matchCode: 'GC26-A-R1-01',
      username: 'captain',
      rating: 4,
      body: '德比踢得很艰苦，感谢两边同学在赛后互相致意。',
    },
  ] as const
  const reviewMatches = await tx.match.findMany({
    where: {
      organizationId,
      tournamentId,
      matchCode: { in: [...new Set(reviewFixtures.map((review) => review.matchCode))] },
    },
    select: { id: true, matchCode: true },
  })
  const matchesByCode = new Map(reviewMatches.map((match) => [match.matchCode, match.id]))

  for (const [index, review] of reviewFixtures.entries()) {
    const matchId = matchesByCode.get(review.matchCode)
    const userId = usersByUsername.get(review.username)
    if (!matchId || !userId) continue
    await tx.matchReview.upsert({
      where: { matchId_userId: { matchId, userId } },
      create: {
        id: fixtureId(`match-review:${review.matchCode}:${review.username}`),
        organizationId,
        matchId,
        userId,
        rating: review.rating,
        body: review.body,
        createdAt: new Date(`2026-08-31T${18 + index}:15:00+08:00`),
      },
      update: { rating: review.rating, body: review.body },
    })
  }
}
