import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import { type SqlExecutor, type TransactionalSqlClient } from './outbox-store'

interface PrismaSql {
  $queryRawUnsafe<T>(sql: string, ...parameters: unknown[]): Promise<T>
  $executeRawUnsafe(sql: string, ...parameters: unknown[]): Promise<number>
}
interface TestPrismaClient extends PrismaSql {
  $transaction<T>(
    work: (tx: PrismaSql) => Promise<T>,
    options: { timeout: number; maxWait: number },
  ): Promise<T>
  $disconnect(): Promise<void>
}

const databaseUrl = process.env.TEST_DATABASE_URL
assert.ok(databaseUrl, 'TEST_DATABASE_URL must identify a disposable results-worker database')
const parsed = new URL(databaseUrl)
assert.match(decodeURIComponent(parsed.pathname.slice(1)), /^xiaoqiu_results_test_[a-z0-9_]+$/)
assert.notEqual(
  databaseUrl,
  process.env.DATABASE_URL,
  'Do not use the application database as TEST_DATABASE_URL',
)
// Reuse the integrator-generated client only for tests; no Worker runtime dependency.
export const clientLoader = createRequire(resolve(process.cwd(), 'package.json'))
const clientModule =
  process.env.WORKER_TEST_PRISMA_CLIENT ??
  resolve(process.cwd(), '../api/dist/test/generated/prisma/client.js')
const { PrismaClient } = clientLoader(clientModule) as {
  PrismaClient: new (options: unknown) => TestPrismaClient
}
export const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
const executor = (client: PrismaSql): SqlExecutor => ({
  query: <T>(sql: string, parameters: unknown[]) => client.$queryRawUnsafe<T[]>(sql, ...parameters),
})
export const db: TransactionalSqlClient = {
  ...executor(prisma),
  transaction: (work, timeoutMs) =>
    prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          "SELECT set_config('statement_timeout', $1, true)",
          String(timeoutMs),
        )
        return work(executor(tx))
      },
      { timeout: timeoutMs, maxWait: timeoutMs },
    ),
}
