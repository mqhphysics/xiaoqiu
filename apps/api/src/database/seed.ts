import {
  MembershipStatus,
  PrismaClient,
  Role,
  RoleScopeType,
  UserStatus,
} from '../generated/prisma/client'

const prisma = new PrismaClient()

const DEFAULT_USER_ID = '00000000-0000-4000-8000-000000000002'

async function seed(): Promise<void> {
  const organization = await prisma.organization.upsert({
    where: { slug: 'xiaoqiu-dev' },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      slug: 'xiaoqiu-dev',
      name: '晓球开发组织',
    },
    update: {
      name: '晓球开发组织',
    },
  })

  const user = await prisma.user.upsert({
    where: { id: DEFAULT_USER_ID },
    create: {
      id: DEFAULT_USER_ID,
      loginNameNormalized: 'dev-admin',
      displayName: '开发管理员',
      status: UserStatus.ACTIVE,
    },
    update: {
      loginNameNormalized: 'dev-admin',
      displayName: '开发管理员',
      status: UserStatus.ACTIVE,
    },
  })

  await prisma.organizationMembership.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: user.id,
      },
    },
    create: {
      id: '00000000-0000-4000-8000-000000000003',
      organizationId: organization.id,
      userId: user.id,
      status: MembershipStatus.ACTIVE,
      joinedAt: new Date(),
    },
    update: {
      status: MembershipStatus.ACTIVE,
    },
  })

  await prisma.roleAssignment.upsert({
    where: {
      userId_role_scopeType_scopeId: {
        userId: user.id,
        role: Role.ORGANIZATION_ADMIN,
        scopeType: RoleScopeType.ORGANIZATION,
        scopeId: organization.id,
      },
    },
    create: {
      id: '00000000-0000-4000-8000-000000000004',
      organizationId: organization.id,
      userId: user.id,
      role: Role.ORGANIZATION_ADMIN,
      scopeType: RoleScopeType.ORGANIZATION,
      scopeId: organization.id,
      grantedByUserId: user.id,
    },
    update: {
      organizationId: organization.id,
      revokedAt: null,
    },
  })

  await prisma.roleAssignment.upsert({
    where: {
      userId_role_scopeType_scopeId: {
        userId: user.id,
        role: Role.TOURNAMENT_ADMIN,
        scopeType: RoleScopeType.ORGANIZATION,
        scopeId: organization.id,
      },
    },
    create: {
      id: '00000000-0000-4000-8000-000000000005',
      organizationId: organization.id,
      userId: user.id,
      role: Role.TOURNAMENT_ADMIN,
      scopeType: RoleScopeType.ORGANIZATION,
      scopeId: organization.id,
      grantedByUserId: user.id,
    },
    update: {
      organizationId: organization.id,
      revokedAt: null,
    },
  })
}

seed()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
