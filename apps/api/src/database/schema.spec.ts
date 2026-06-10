import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const migrationPath = resolve(
  process.cwd(),
  '../../prisma/migrations/20260610150000_initial_api_foundation/migration.sql',
)

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
