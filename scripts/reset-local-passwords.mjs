import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import console from 'node:console'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { PrismaClient } = require('../apps/api/dist/generated/prisma/client.js')
const { hashPassword } = require('../apps/api/dist/auth/password.js')
const {
  localDemoShortPasswordsEnabled,
} = require('../apps/api/dist/auth/local-demo-password-policy.js')
if (!process.argv.includes('--confirm-all-local-accounts') || !localDemoShortPasswordsEnabled()) {
  throw new Error(
    'Requires explicit confirmation and the local xiaoqiu database; production is refused.',
  )
}

const prisma = new PrismaClient()
try {
  const users = await prisma.user.findMany({ select: { id: true } })
  const backupDirectory = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../private-data/password-backups',
  )
  mkdirSync(backupDirectory, { recursive: true })
  const backupPath = path.join(backupDirectory, `${Date.now()}-${randomUUID()}.json`)
  writeFileSync(
    backupPath,
    JSON.stringify({
      createdAt: new Date().toISOString(),
      credentials: await prisma.passwordCredential.findMany(),
    }),
    { mode: 0o600 },
  )
  const changed = await prisma.$transaction(
    async (tx) => {
      for (const user of users) {
        const digest = hashPassword('123')
        const fields = {
          passwordHash: digest.hash,
          passwordSalt: digest.salt,
          algorithm: digest.algorithm,
        }
        await tx.passwordCredential.upsert({
          where: { userId: user.id },
          create: { userId: user.id, ...fields },
          update: fields,
        })
      }
      const revoked = await tx.userSession.updateMany({
        where: { userId: { in: users.map((user) => user.id) }, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      const organizations = await tx.organizationMembership.findMany({
        where: { userId: { in: users.map((user) => user.id) } },
        select: { organizationId: true },
        distinct: ['organizationId'],
      })
      const requestId = randomUUID()
      for (const organization of organizations) {
        await tx.auditLog.create({
          data: {
            organizationId: organization.organizationId,
            actorType: 'SYSTEM',
            action: 'LOCAL_ACCOUNT_PASSWORD_RESET',
            targetType: 'LocalAccounts',
            targetId: 'local-xiaoqiu',
            reason: '用户明确授权本机全部账号简化密码；正式环境禁用',
            requestId,
            source: 'LOCAL_DEMO_TOOL',
            afterSummary: { accountCount: users.length, revokedSessionCount: revoked.count },
          },
        })
      }
      return { accountCount: users.length, revokedSessionCount: revoked.count }
    },
    { timeout: 120000 },
  )
  console.log(JSON.stringify({ ...changed, credentialBackupSaved: true }))
} finally {
  await prisma.$disconnect()
}
