import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import console from 'node:console'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const organizationId = process.env.DEFAULT_ORGANIZATION_ID
const createCount = Number(
  process.argv.find((a) => a.startsWith('--create='))?.split('=')[1] ?? '0',
)
if (!organizationId || !process.env.DATABASE_URL)
  throw new Error('需要明确的DATABASE_URL和DEFAULT_ORGANIZATION_ID')
if (!Number.isInteger(createCount) || createCount < 0 || createCount > 60)
  throw new Error('一次创建数量需为0–60')
if (process.env.NODE_ENV === 'production')
  throw new Error('请从本机管理工具运行，不能作为生产API的启动步骤')
const { NestFactory } = require('../apps/api/node_modules/@nestjs/core')
const { AdminCenterModule } = require('../apps/api/dist/admin-center/admin-center.module.js')
const { PrismaService } = require('../apps/api/dist/database/prisma.service.js')
const {
  LocalOwnerAccessService,
} = require('../apps/api/dist/admin-center/local-owner-access.service.js')
const {
  AdminLoginAccessService,
} = require('../apps/api/dist/admin-center/admin-login-access.service.js')
const { AdminCenterService } = require('../apps/api/dist/admin-center/admin-center.service.js')
const { AuthService } = require('../apps/api/dist/auth/auth.service.js')
const app = await NestFactory.createApplicationContext(AdminCenterModule, { logger: false })
let authorization
try {
  const prisma = app.get(PrismaService)
  const original = await prisma.user.findMany({
    where: { memberships: { some: { organizationId } } },
    select: { id: true, updatedAt: true, passwordCredential: true },
  })
  if (!process.argv.includes('--apply')) {
    console.log(
      JSON.stringify({
        existingAccounts: original.length,
        requestedNewAccounts: createCount,
        dryRun: true,
      }),
    )
  } else {
    const backupDirectory = resolve(root, 'private-data/password-backups')
    await mkdir(backupDirectory, { recursive: true })
    await writeFile(
      resolve(backupDirectory, `before-six-digit-${Date.now()}-${randomUUID()}.json`),
      JSON.stringify({ organizationId, createdAt: new Date().toISOString(), users: original }),
      { flag: 'wx', mode: 0o600 },
    )
    const administrator = await prisma.user.findFirst({
      where: {
        status: 'ACTIVE',
        memberships: { some: { organizationId, status: 'ACTIVE' } },
        roleAssignments: {
          some: {
            organizationId,
            role: 'ORGANIZATION_ADMIN',
            scopeType: 'ORGANIZATION',
            scopeId: organizationId,
            revokedAt: null,
            grantedAt: { lte: new Date() },
          },
        },
      },
      select: { loginNameNormalized: true },
    })
    if (!administrator?.loginNameNormalized) throw new Error('当前组织缺少可用的本机管理员身份')
    const origin = 'http://127.0.0.1:5173'
    const access = await app
      .get(LocalOwnerAccessService)
      .enter(
        {
          enabled: true,
          development: true,
          organizationId,
          ownerLoginName: administrator.loginNameNormalized,
          origin,
        },
        { address: '127.0.0.1', host: '127.0.0.1:5173', origin, fetchSite: 'same-origin' },
      )
    authorization = `Bearer ${access.accessToken}`
    const service = app.get(AdminLoginAccessService)
    let resetCount = 0
    for (const user of original) {
      await service.reset(
        authorization,
        user.id,
        {
          expectedUpdatedAt: user.updatedAt.toISOString(),
          reason: '用户授权：当前账号分配独立六位随机登录密码',
        },
        randomUUID(),
        'owner-initialize-passwords',
      )
      resetCount++
    }
    const created = createCount
      ? await service.provision(
          authorization,
          { count: createCount, reason: '用户授权：先为60位未绑定账号的球员创建登录账号' },
          randomUUID(),
          'owner-provision-player-accounts',
        )
      : { createdCount: 0 }
    const directory = await app
      .get(AdminCenterService)
      .users(authorization, { page: 1, pageSize: 100 })
    let assignedPasswords = 0
    for (const user of directory.items) {
      const login = await service.view(authorization, user.id)
      if (login.available && /^\d{6}$/.test(login.password)) assignedPasswords++
    }
    console.log(
      JSON.stringify({
        resetExistingAccounts: resetCount,
        createdAccounts: created.createdCount,
        totalAccounts: directory.total,
        assignedPasswords,
        backupSaved: true,
      }),
    )
  }
} finally {
  if (authorization) await app.get(AuthService).logout(authorization)
  await app.close()
}
