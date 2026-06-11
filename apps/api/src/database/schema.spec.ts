import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const migrationPath = resolve(
  process.cwd(),
  '../../prisma/migrations/20260610150000_initial_api_foundation/migration.sql',
)
const apiSourcePath = resolve(process.cwd(), 'src')

test('initial migration enforces organization and idempotency uniqueness', async () => {
  const migration = await readFile(migrationPath, 'utf8')

  assert.match(
    migration,
    /CREATE UNIQUE INDEX "organization_memberships_organization_id_user_id_key"/,
  )
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "idempotency_records_user_id_route_idempotency_key_key"/,
  )
  assert.match(migration, /CREATE UNIQUE INDEX "outbox_jobs_deduplication_key_key"/)
  assert.match(migration, /FOREIGN KEY \("organization_id"\) REFERENCES "organizations"\("id"\)/)
})

test('initial migration matches the Outbox V0.2 persistence contract', async () => {
  const migration = await readFile(migrationPath, 'utf8')

  for (const status of [
    'PENDING',
    'PROCESSING',
    'SUCCEEDED',
    'FAILED_RETRYABLE',
    'FAILED_PERMANENT',
    'CANCELLED',
  ]) {
    assert.match(migration, new RegExp(`'${status}'`))
  }

  assert.doesNotMatch(migration, /'RETRYABLE'|'COMPLETED'/)
  assert.match(migration, /"last_error_code" VARCHAR\(120\)/)
  assert.match(migration, /"last_error" TEXT/)
  assert.match(migration, /"correlation_id" VARCHAR\(128\)/)
  assert.match(migration, /CREATE INDEX "outbox_jobs_status_available_at_idx"/)
  assert.match(migration, /CREATE INDEX "outbox_jobs_locked_until_idx"/)
  assert.match(migration, /CREATE INDEX "outbox_jobs_correlation_id_idx"/)
})

test('API logging and error codes use the approved single sources', async () => {
  const requestLogger = await readFile(
    resolve(apiSourcePath, 'common/request-logging.interceptor.ts'),
    'utf8',
  )
  const exceptionFilter = await readFile(
    resolve(apiSourcePath, 'common/api-exception.filter.ts'),
    'utf8',
  )

  assert.doesNotMatch(requestLogger, /originalUrl|request\.url/)
  assert.doesNotMatch(exceptionFilter, /originalUrl|request\.url/)
  assert.match(requestLogger, /getSafeRequestPath/)
  assert.match(exceptionFilter, /getSafeRequestPath/)
  assert.match(exceptionFilter, /ERROR_CODES/)
})
