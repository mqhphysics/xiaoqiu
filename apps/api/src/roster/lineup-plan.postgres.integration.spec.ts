import 'reflect-metadata'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { configureApp } from '../app.setup'
import { AuthModule } from '../auth/auth.module'
import { hashPassword } from '../auth/password'
import { DatabaseModule } from '../database/database.module'
import { PrismaService } from '../database/prisma.service'
import { PrismaClient } from '../generated/prisma/client'
import { RosterModule } from './roster.module'

test('cloud lineups: real HTTP saves, revisions, CAS, team isolation and locked match eligibility', async () => {
  const databaseUrl = process.env.TEST_DATABASE_URL
  assert.ok(databaseUrl, 'TEST_DATABASE_URL required: real PostgreSQL acceptance cannot skip')
  assert.match(new URL(databaseUrl).pathname, /^\/roster_v2_test(?:_[a-z0-9]+)?$/)
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  const suffix = randomUUID().slice(0, 8)
  const org = await prisma.organization.create({
    data: { slug: `lineup-v2-${suffix}`, name: 'DEMO_FIXTURE 云端战术验收' },
  })
  const season = await prisma.season.create({
    data: { organizationId: org.id, seasonCode: `DEMO-${suffix}`, name: 'DEMO_FIXTURE 赛季' },
  })
  const tournament = await prisma.tournament.create({
    data: {
      organizationId: org.id,
      seasonId: season.id,
      tournamentCode: `DEMO-${suffix}`,
      name: 'DEMO_FIXTURE 八人制赛事',
      status: 'PUBLISHED',
    },
  })
  const team = await prisma.team.create({
    data: { organizationId: org.id, teamCode: `DEMO-${suffix}`, name: 'DEMO_FIXTURE 主队' },
  })
  const other = await prisma.team.create({
    data: { organizationId: org.id, teamCode: `DEMO-OTHER-${suffix}`, name: 'DEMO_FIXTURE 另一队' },
  })
  const players = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      prisma.playerProfile.create({
        data: {
          organizationId: org.id,
          displayName: `DEMO_FIXTURE 同名球员${index}`,
          sourceType: 'DEMO_FIXTURE',
          sourceKey: `lineup-${suffix}-${index}`,
        },
      }),
    ),
  )
  await prisma.teamMembership.createMany({
    data: players.map((player) => ({
      organizationId: org.id,
      teamId: team.id,
      playerProfileId: player.id,
    })),
  })
  const registration = await prisma.teamRegistration.create({
    data: {
      organizationId: org.id,
      tournamentId: tournament.id,
      teamId: team.id,
      status: 'APPROVED',
    },
  })
  await prisma.competitionRuleVersion.create({
    data: {
      organizationId: org.id,
      tournamentId: tournament.id,
      version: 1,
      name: 'DEMO_FIXTURE 八人制规程',
      rules: {
        roster: {
          minPlayers: 8,
          maxPlayers: 18,
          playersOnPitch: 8,
          submissionDeadline: '2099-01-01T00:00:00Z',
          eligiblePlayerIds: players.map((player) => player.id),
        },
      },
    },
  })
  const submission = await prisma.rosterSubmission.create({
    data: {
      organizationId: org.id,
      teamRegistrationId: registration.id,
      submissionVersion: 1,
      status: 'LOCKED',
      sourceFileHash: 'a'.repeat(64),
      lockedAt: new Date(),
    },
  })
  const snapshot = await prisma.rosterSnapshot.create({
    data: {
      organizationId: org.id,
      teamId: team.id,
      tournamentId: tournament.id,
      teamRegistrationId: registration.id,
      rosterSubmissionId: submission.id,
      snapshotVersion: 1,
      sourceFileHash: submission.sourceFileHash,
    },
  })
  await prisma.rosterSnapshotEntry.createMany({
    data: players.slice(0, 9).map((player, sortOrder) => ({
      organizationId: org.id,
      rosterSnapshotId: snapshot.id,
      playerProfileId: player.id,
      displayName: player.displayName,
      shirtNumber: String(sortOrder + 1),
      sortOrder,
    })),
  })
  await prisma.rosterSnapshot.update({ where: { id: snapshot.id }, data: { lockedAt: new Date() } })
  const match = await prisma.match.create({
    data: {
      organizationId: org.id,
      tournamentId: tournament.id,
      homeTeamId: team.id,
      awayTeamId: other.id,
      matchCode: `DEMO-MATCH-${suffix}`,
      title: 'DEMO_FIXTURE 赛前阵容',
      status: 'SCHEDULED',
    },
  })
  const digest = hashPassword('RosterFixture2026!')
  const user = await prisma.user.create({
    data: {
      displayName: 'DEMO_FIXTURE 战术队长',
      loginNameNormalized: `lineup-captain-${suffix}`,
      passwordCredential: { create: { passwordHash: digest.hash, passwordSalt: digest.salt } },
      memberships: { create: { organizationId: org.id, status: 'ACTIVE' } },
      roleAssignments: {
        create: {
          organizationId: org.id,
          role: 'TEAM_CAPTAIN',
          scopeType: 'TEAM',
          scopeId: team.id,
        },
      },
    },
  })
  const module = await Test.createTestingModule({
    imports: [DatabaseModule, AuthModule, RosterModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile()
  const app = module.createNestApplication({ logger: false })
  configureApp(app)
  await app.init()
  const server = app.getHttpServer(),
    path = `/api/captain/teams/${team.id}/lineup-plans`
  try {
    const session = await request(server)
      .post('/api/auth/login')
      .set('x-dev-organization-id', org.id)
      .send({ username: user.loginNameNormalized, password: 'RosterFixture2026!' })
      .expect(200)
    const authorization = `Bearer ${session.body.accessToken}`
    const payload = {
      formation: '3-3-1',
      format: 8,
      slots: players.slice(0, 8).map((player, index) => ({
        slotId: `position-${index}`,
        label: index === 0 ? 'GK' : `P${index}`,
        x: 50,
        y: 10 + index * 10,
        playerId: player.id,
      })),
      benchPlayerIds: [players[8]!.id],
    }
    const tactic = { name: 'DEMO_FIXTURE 边路推进', kind: 'TACTIC', expectedVersion: 0, payload }
    const post = (input: unknown, key = randomUUID()) =>
      request(server)
        .post(path)
        .set('Authorization', authorization)
        .set('Idempotency-Key', key)
        .send(input)
    await request(server).get(path).expect(401)
    await request(server)
      .get(`/api/captain/teams/${other.id}/lineup-plans`)
      .set('Authorization', authorization)
      .expect(403)
    const key = randomUUID()
    const saved = await Promise.all([post(tactic, key), post(tactic, key)])
    assert.deepEqual(
      saved.map((result) => result.status),
      [200, 200],
    )
    assert.deepEqual(saved[0]!.body, saved[1]!.body)
    const plan = saved[0]!.body
    assert.equal(plan.version, 1)
    assert.equal(await prisma.teamLineupRevision.count({ where: { planId: plan.id } }), 1)
    await post({ ...tactic, name: '不同名称' }, key).expect(409)
    await post(tactic).expect(409)
    const update = {
      ...tactic,
      planId: plan.id,
      expectedVersion: 1,
      payload: { ...payload, slots: payload.slots.map((slot) => ({ ...slot, x: 55 })) },
    }
    const concurrent = await Promise.all([post(update), post(update)])
    assert.deepEqual(concurrent.map((result) => result.status).sort(), [200, 409])
    await post(update).expect(409)
    const history = await request(server)
      .get(`${path}/${plan.id}/revisions`)
      .set('Authorization', authorization)
      .expect(200)
    assert.deepEqual(
      history.body.items.map((item: { version: number }) => item.version),
      [2, 1],
    )
    assert.equal(history.body.items[1].payload.lineup.slots[0].x, 50)
    await assert.rejects(
      prisma.teamLineupRevision.updateMany({
        where: { planId: plan.id, version: 1 },
        data: { payload: {} },
      }),
    )
    const list = await request(server).get(path).set('Authorization', authorization).expect(200)
    assert.equal(list.body.items[0].version, 2)
    const lineup = {
      name: 'DEMO_FIXTURE 比赛首发',
      kind: 'MATCH_LINEUP',
      expectedVersion: 0,
      tournamentId: tournament.id,
      matchId: match.id,
      rosterSnapshotId: snapshot.id,
      payload,
    }
    const locked = await post(lineup).expect(200)
    assert.equal(locked.body.rosterSnapshotId, snapshot.id)
    await post({
      ...lineup,
      name: '重复球员',
      payload: { ...payload, benchPlayerIds: [players[0]!.id] },
    }).expect(400)
    await post({
      ...lineup,
      name: '名单外球员',
      payload: { ...payload, benchPlayerIds: [players[9]!.id] },
    }).expect(400)
    await post({
      ...lineup,
      name: '错误坐标',
      payload: { ...payload, slots: payload.slots.map((slot) => ({ ...slot, x: 101 })) },
    }).expect(400)
    await post({ ...lineup, name: '错误球队快照', rosterSnapshotId: randomUUID() }).expect(400)
    await post({ ...lineup, name: '不属于球队的比赛', matchId: randomUUID() }).expect(404)
    await post({
      ...lineup,
      name: '错误人数制',
      payload: { ...payload, format: 5, slots: payload.slots.slice(0, 5), benchPlayerIds: [] },
    }).expect(400)
    await prisma.match.update({ where: { id: match.id }, data: { status: 'LIVE' } })
    await post({ ...lineup, planId: locked.body.id, expectedVersion: 1 }).expect(409)
    await prisma.roleAssignment.updateMany({
      where: { userId: user.id },
      data: { revokedAt: new Date() },
    })
    await post({ ...tactic, planId: plan.id, expectedVersion: 2 }).expect(403)
    assert.equal(await prisma.matchAppearance.count({ where: { matchId: match.id } }), 0)
  } finally {
    await app.close()
    await prisma.$disconnect()
  }
})
