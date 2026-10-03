import { createHash } from 'node:crypto'
import console from 'node:console'
import process from 'node:process'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { parseArgs } from 'node:util'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(resolve(root, 'apps/api/package.json'))
const { values } = parseArgs({
  options: {
    apply: { type: 'boolean' },
    'expected-hash': { type: 'string' },
    backup: { type: 'string' },
    'plan-out': { type: 'string' },
    help: { type: 'boolean' },
  },
})
if (values.help) {
  console.log(
    'Build apps/api first. Set DATABASE_URL and DEMO_MAINTENANCE_TOKEN (real administrator Bearer token). Inspect: --plan-out <private file>. Apply: --apply --expected-hash <inspection hash> --backup <verified pg_dump file>. No deletion or full Seed is performed.',
  )
  process.exit(0)
}
const database = new URL(process.env.DATABASE_URL ?? '')
if (
  !['localhost', '127.0.0.1'].includes(database.hostname) ||
  database.pathname !== '/xiaoqiu' ||
  process.env.NODE_ENV === 'production'
)
  throw new Error('This command only supports the local non-production xiaoqiu demo database.')
const token = process.env.DEMO_MAINTENANCE_TOKEN
if (!token) throw new Error('A real administrator session is required.')
require('reflect-metadata')
const { PrismaService } = require(resolve(root, 'apps/api/dist/database/prisma.service.js'))
const { AuthService } = require(resolve(root, 'apps/api/dist/auth/auth.service.js'))
const { AccessPolicyService } = require(
  resolve(root, 'apps/api/dist/auth/access-policy.service.js'),
)
const { DemoEightTeamService } = require(
  resolve(root, 'apps/api/dist/database/demo-eight-team.service.js'),
)
const prisma = new PrismaService()
const service = new DemoEightTeamService(
  prisma,
  new AuthService(prisma),
  new AccessPolicyService(prisma),
)
try {
  if (values.apply) {
    if (!values['expected-hash'] || !values.backup)
      throw new Error('Inspection hash and backup file required.')
    const backup = await readFile(values.backup)
    if (backup.subarray(0, 5).toString() !== 'PGDMP')
      throw new Error('Expected a PostgreSQL custom archive.')
    const hash = createHash('sha256').update(backup).digest('hex')
    console.log(
      JSON.stringify(await service.apply(`Bearer ${token}`, values['expected-hash'], hash)),
    )
  } else {
    const plan = await service.inspect(`Bearer ${token}`)
    if (values['plan-out']) await writeFile(values['plan-out'], JSON.stringify(plan, null, 2))
    console.log(
      JSON.stringify({
        hash: plan.hash,
        originalActiveTeams:
          plan.activeTeams + plan.registrations.filter((row) => row.status === 'APPROVED').length,
        extraRegistrations: plan.registrations.length,
        priorRoundMatches: plan.matches.length,
      }),
    )
  }
} finally {
  await prisma.$disconnect()
}
