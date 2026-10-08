import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import process from 'node:process'

const root = resolve(process.env.XIAOQIU_RUNTIME_ROOT || process.cwd())
const requireApi = createRequire(resolve(root, 'apps/api/package.json'))
requireApi('reflect-metadata')
const { PrismaService } = requireApi(resolve(root, 'apps/api/dist/database/prisma.service.js'))
const { SharedEventsSetupService } = requireApi(
  resolve(root, 'apps/api/dist/schedule/shared-events.setup.service.js'),
)
if (!process.env.SHARED_ORGANIZATION_ID || !process.env.SHARED_OWNER_ID)
  throw new Error('Shared organization and owner IDs are required.')
const prisma = new PrismaService()
try {
  const result = await new SharedEventsSetupService(prisma).configure(
    process.env.SHARED_ORGANIZATION_ID,
    process.env.SHARED_OWNER_ID,
  )
  process.stdout.write(JSON.stringify(result) + '\n')
} finally {
  await prisma.$disconnect()
}
