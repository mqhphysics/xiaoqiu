import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import test from 'node:test'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../app.module'
import { configureApp } from '../app.setup'
import { PrismaService } from '../database/prisma.service'
import { PrismaClient } from '../generated/prisma/client'
import { hashPassword } from '../auth/password'

test(
  'identity approval, scope, collision, persistence and revocation on isolated PostgreSQL',
  { timeout: 60000 },
  async (t) => {
    const url = process.env.TEST_DATABASE_URL
    assert.ok(url, 'TEST_DATABASE_URL is required; identity integration tests never silently skip')
    assert.match(
      new URL(url).pathname,
      /(?:_|\/)(?:test|ci)(?:_|$)/,
      'Use an isolated test database',
    )
    assert.notEqual(
      url,
      process.env.DATABASE_URL,
      'Do not connect tests to the application database',
    )
    const prisma = new PrismaClient({ datasources: { db: { url } } })
    const suffix = randomUUID().slice(0, 8)
    const org = await prisma.organization.create({
      data: { slug: `identity-test-${suffix}`, name: 'FICTIONAL_TEST 身份' },
    })
    const otherOrg = await prisma.organization.create({
      data: { slug: `identity-other-${suffix}`, name: 'FICTIONAL_TEST 其他组织' },
    })
    const team = await prisma.team.create({
      data: { organizationId: org.id, teamCode: 'A', name: 'FICTIONAL_TEST 甲队' },
    })
    const otherTeam = await prisma.team.create({
      data: { organizationId: org.id, teamCode: 'B', name: 'FICTIONAL_TEST 乙队' },
    })
    const password = 'Fictional-identity-test-2026!'
    const digest = hashPassword(password)
    const account = async (label: string, organizationId = org.id) => {
      const user = await prisma.user.create({
        data: {
          displayName: `虚构-${label}`,
          realName: '虚构同名',
          realNameNormalized: '虚构同名',
          loginNameNormalized: `identity-${suffix}-${label}`,
          memberships: { create: { organizationId, status: 'ACTIVE' } },
          passwordCredential: { create: { passwordHash: digest.hash, passwordSalt: digest.salt } },
        },
      })
      const token = randomUUID()
      await prisma.userSession.create({
        data: {
          userId: user.id,
          organizationId,
          refreshTokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(Date.now() + 3600000),
        },
      })
      return { user, token }
    }
    const admin = await account('admin'),
      coach = await account('coach'),
      sameName = await account('same'),
      outsider = await account('outsider', otherOrg.id)
    await prisma.roleAssignment.create({
      data: {
        organizationId: org.id,
        userId: admin.user.id,
        role: 'ORGANIZATION_ADMIN',
        scopeType: 'ORGANIZATION',
        scopeId: org.id,
      },
    })
    const player = await prisma.playerProfile.create({
      data: {
        organizationId: org.id,
        displayName: '虚构同名',
        studentId: `TEST-PRIVATE-${suffix}`,
      },
    })
    const secondPlayer = await prisma.playerProfile.create({
      data: { organizationId: org.id, displayName: '虚构同名' },
    })
    await prisma.teamMembership.create({
      data: { organizationId: org.id, teamId: team.id, playerProfileId: player.id },
    })
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile()
    const app = module.createNestApplication()
    configureApp(app)
    await app.init()
    t.after(async () => {
      await app.close()
      await prisma.$disconnect()
    })
    const http = request(app.getHttpServer())
    const get = (path: string, token: string) =>
      http.get(`/api/${path}`).set('authorization', `Bearer ${token}`)
    const post = (path: string, token: string, body: object, key = randomUUID()) =>
      http
        .post(`/api/${path}`)
        .set('authorization', `Bearer ${token}`)
        .set('idempotency-key', key)
        .send(body)
    const record = await post('admin/identity/records', admin.token, {
      kind: 'TEAM_COACH',
      displayName: '虚构同名',
      teamId: team.id,
      reason: '管理员核验虚构任职名单',
    }).expect(201)
    const candidateId = `record:${record.body.id}`
    let applicationId = ''

    await t.test('same names produce privacy limited candidates and never roles', async () => {
      const response = await get('me/identity', coach.token).expect(200)
      assert.equal(response.body.candidates.length, 3)
      for (const candidate of response.body.candidates)
        assert.deepEqual(Object.keys(candidate).sort(), [
          'displayName',
          'id',
          'kind',
          'teamId',
          'teamName',
        ])
      assert.ok(!JSON.stringify(response.body).includes(`TEST-PRIVATE-${suffix}`))
      const me = await get('auth/me', coach.token).expect(200)
      assert.deepEqual(me.body.roles, [])
      assert.equal(me.body.linkedPlayer, null)
      assert.equal(me.body.verificationLevel, 'UNVERIFIED')
      await get('admin/identity/applications', coach.token).expect(403)
      await post('admin/identity/records', coach.token, {
        kind: 'TEAM_COACH',
        displayName: '虚构同名',
        teamId: team.id,
        reason: '冒领球队教练角色的测试',
      }).expect(403)
      await http.get('/api/me/identity').expect(401)
      await get('me/identity', outsider.token)
        .expect(200)
        .then((r) => assert.deepEqual(r.body.candidates, []))
    })

    await t.test('application duplicate prevention, exact replay and pending status', async () => {
      const body = { kind: 'TEAM_COACH', candidateId, message: '请根据任职名单核实我的教练身份' }
      const key = randomUUID()
      const created = await post('me/identity/applications', coach.token, body, key).expect(201)
      applicationId = created.body.id
      assert.equal(created.body.status, 'PENDING')
      await post('me/identity/applications', coach.token, body, key)
        .expect(201)
        .then((r) => assert.equal(r.body.id, applicationId))
      await post('me/identity/applications', coach.token, body).expect(409)
      await get('auth/me', coach.token)
        .expect(200)
        .then((r) => assert.deepEqual(r.body.roles, []))
      await post(`admin/identity/applications/${applicationId}/review`, coach.token, {
        decision: 'APPROVED',
        expectedVersion: 1,
        note: '自行冒领教练权限的测试',
      }).expect(403)
      const adminList = await get('admin/identity/applications', admin.token).expect(200)
      assert.ok(adminList.body.items.some((a: { id: string }) => a.id === applicationId))
    })

    await t.test(
      'approval creates an independent coach assignment and refreshes current session',
      async () => {
        await post(`admin/identity/applications/${applicationId}/review`, admin.token, {
          decision: 'APPROVED',
          expectedVersion: 1,
          note: '已向球队负责人核实任职名单，核准教练',
        }).expect(201)
        const me = await get('auth/me', coach.token).expect(200)
        assert.equal(me.body.linkedPlayer, null)
        assert.ok(
          me.body.roles.some(
            (r: { role: string; scopeId: string }) =>
              r.role === 'TEAM_COACH' && r.scopeId === team.id,
          ),
        )
        assert.equal(await prisma.teamMembership.count({ where: { userId: coach.user.id } }), 0)
        await post(`admin/identity/applications/${applicationId}/review`, admin.token, {
          decision: 'REJECTED',
          expectedVersion: 1,
          note: '尝试覆盖已经审核完成的状态',
        }).expect(409)
        await get('me/identity', coach.token)
          .expect(200)
          .then((r) => assert.equal(r.body.applications[0].status, 'APPROVED'))
        await get(`captain/teams/${team.id}`, coach.token).expect(200)
        await get(`captain/teams/${otherTeam.id}`, coach.token).expect(403)
        await get(`captain/teams/${team.id}/lineup-plans`, coach.token).expect(200)
        await get(`captain/teams/${otherTeam.id}/lineup-plans`, coach.token).expect(403)
      },
    )

    await t.test(
      'coach can separately become a player; same-name claim cannot replace association',
      async () => {
        const created = await post('me/identity/applications', coach.token, {
          kind: 'PLAYER',
          candidateId: `player:${player.id}`,
          message: '我同时参加比赛，请管理员核验球员档案',
        }).expect(201)
        await post(`admin/identity/applications/${created.body.id}/review`, admin.token, {
          decision: 'APPROVED',
          expectedVersion: 1,
          note: '通过球队报名记录及本人核对，核准球员',
        }).expect(201)
        const me = await get('auth/me', coach.token).expect(200)
        assert.equal(me.body.linkedPlayer.id, player.id)
        assert.equal(me.body.verificationLevel, 'PLAYER_CONFIRMED')
        assert.ok(me.body.roles.some((r: { role: string }) => r.role === 'TEAM_COACH'))
        await post('me/identity/applications', sameName.token, {
          kind: 'PLAYER',
          candidateId: `player:${player.id}`,
          message: '试图认领另一个同名人员球员档案',
        }).expect(409)
        assert.equal(
          (await prisma.user.findUniqueOrThrow({ where: { id: sameName.user.id } }))
            .playerProfileId,
          null,
        )
        const login = await http
          .post('/api/auth/login')
          .set('x-organization-id', org.id)
          .send({ username: coach.user.loginNameNormalized, password })
          .expect(200)
        assert.equal(login.body.user.linkedPlayer.id, player.id)
        assert.ok(login.body.user.roles.some((r: { role: string }) => r.role === 'TEAM_COACH'))
        await post(`messages/direct/${admin.user.id}`, coach.token, {
          body: '教练不能发送私信',
          clientMessageId: randomUUID(),
        }).expect(403)
      },
    )

    await t.test('manual application, rejection, retry and concurrent duplicates', async () => {
      const body = {
        kind: 'TEAM_COACH',
        teamId: otherTeam.id,
        message: '没有匹配名单，请核实乙队教练任职',
      }
      const responses = await Promise.all([
        post('me/identity/applications', sameName.token, body),
        post('me/identity/applications', sameName.token, body),
      ])
      assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409])
      const pending = responses.find((r) => r.status === 201)!
      await post(`admin/identity/applications/${pending.body.id}/review`, admin.token, {
        decision: 'APPROVED',
        expectedVersion: 1,
        note: '不能没有核实的任职记录就直接赋权',
      }).expect(400)
      await post(`admin/identity/applications/${pending.body.id}/review`, admin.token, {
        decision: 'REJECTED',
        expectedVersion: 1,
        note: '已核查乙队任职名单，当前没有该任职',
      }).expect(201)
      await post('me/identity/applications', sameName.token, body).expect(201)
      await get('auth/me', sameName.token)
        .expect(200)
        .then((r) => assert.deepEqual(r.body.roles, []))
      await post('me/identity/applications', outsider.token, { ...body, candidateId }).expect(409)
      await post('me/identity/applications', sameName.token, {
        kind: 'PLATFORM_ADMIN',
        message: '请求自助获得平台总管理员权限',
      }).expect(400)
    })

    await t.test('future grants, invalid coach scope and self approval are rejected', async () => {
      const future = await prisma.roleAssignment.create({
        data: {
          organizationId: org.id,
          userId: sameName.user.id,
          role: 'TEAM_COACH',
          scopeType: 'TEAM',
          scopeId: otherTeam.id,
          grantedAt: new Date(Date.now() + 86400000),
        },
      })
      await get('auth/me', sameName.token)
        .expect(200)
        .then((r) => assert.deepEqual(r.body.roles, []))
      await get(`captain/teams/${otherTeam.id}`, sameName.token).expect(403)
      await get(`captain/teams/${otherTeam.id}/lineup-plans`, sameName.token).expect(403)
      await prisma.roleAssignment.update({
        where: { id: future.id },
        data: { revokedAt: new Date() },
      })
      await assert.rejects(
        prisma.roleAssignment.create({
          data: {
            organizationId: org.id,
            userId: sameName.user.id,
            role: 'TEAM_COACH',
            scopeType: 'ORGANIZATION',
            scopeId: org.id,
          },
        }),
      )
      const self = await post('me/identity/applications', admin.token, {
        kind: 'STUDENT',
        message: '管理员不能审核自己的认证身份申请',
      }).expect(201)
      await post(`admin/identity/applications/${self.body.id}/review`, admin.token, {
        decision: 'APPROVED',
        expectedVersion: 1,
        note: '不得自己批准自己的认证申请',
      }).expect(403)
    })

    await t.test('concurrent reviewers cannot publish contradictory decisions', async () => {
      const created = await post('me/identity/applications', sameName.token, {
        kind: 'PLAYER',
        candidateId: `player:${secondPlayer.id}`,
        message: '虚构并发审批测试，请核实我的球员身份',
      }).expect(201)
      const responses = await Promise.all([
        post(`admin/identity/applications/${created.body.id}/review`, admin.token, {
          decision: 'APPROVED',
          expectedVersion: 1,
          note: '依据虚构报名名单独立核实并批准球员',
        }),
        post(`admin/identity/applications/${created.body.id}/review`, admin.token, {
          decision: 'REJECTED',
          expectedVersion: 1,
          note: '并发测试另一位审阅人给出的拒绝结论',
        }),
      ])
      assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409])
      const saved = await prisma.identityApplication.findUniqueOrThrow({
        where: { id: created.body.id },
      })
      assert.equal(saved.version, 2)
      assert.equal(saved.status, responses.find((r) => r.status === 201)!.body.status)
    })

    await t.test(
      'a new record cannot revive an assignment owned by an active appointment',
      async () => {
        const assignment = await prisma.roleAssignment.findFirstOrThrow({
          where: { userId: coach.user.id, role: 'TEAM_COACH', scopeId: team.id },
        })
        await prisma.roleAssignment.update({
          where: { id: assignment.id },
          data: { revokedAt: new Date() },
        })
        const duplicateRecord = await post('admin/identity/records', admin.token, {
          kind: 'TEAM_COACH',
          displayName: '虚构同名',
          teamId: team.id,
          reason: '测试已有有效任职记录时重复建立的记录',
        }).expect(201)
        const duplicate = await post('me/identity/applications', coach.token, {
          kind: 'TEAM_COACH',
          candidateId: `record:${duplicateRecord.body.id}`,
          message: '测试外部撤销授权后不能通过另一个记录冒领',
        }).expect(201)
        await post(`admin/identity/applications/${duplicate.body.id}/review`, admin.token, {
          decision: 'APPROVED',
          expectedVersion: 1,
          note: '原任职记录仍有效，禁止重复恢复其权限',
        }).expect(409)
        assert.equal(
          (
            await prisma.identityRecord.findUniqueOrThrow({
              where: { id: duplicateRecord.body.id },
            })
          ).linkedUserId,
          null,
        )
        await post(`admin/identity/applications/${duplicate.body.id}/review`, admin.token, {
          decision: 'REJECTED',
          expectedVersion: 1,
          note: '请先核实并撤销原任职记录后再办理任职',
        }).expect(201)
        await prisma.roleAssignment.update({
          where: { id: assignment.id },
          data: { revokedAt: null },
        })
      },
    )

    await t.test(
      'revocation immediately removes team authority while retaining player identity and audit',
      async () => {
        await post(`admin/identity/records/${record.body.id}/revoke`, admin.token, {
          expectedVersion: 2,
          reason: '教练任职终止，撤销本队管理权限',
        }).expect(201)
        await get(`captain/teams/${team.id}`, coach.token).expect(403)
        await get(`captain/teams/${team.id}/lineup-plans`, coach.token).expect(403)
        await get('auth/me', coach.token)
          .expect(200)
          .then((r) => {
            assert.deepEqual(r.body.roles, [])
            assert.equal(r.body.linkedPlayer.id, player.id)
          })
        assert.ok(
          (await prisma.auditLog.count({
            where: { organizationId: org.id, action: { startsWith: 'IDENTITY_' } },
          })) >= 9,
        )
        const revokeAudit = await prisma.auditLog.findFirstOrThrow({
          where: {
            organizationId: org.id,
            action: 'IDENTITY_RECORD_REVOKED',
            targetId: record.body.id,
          },
        })
        assert.equal(revokeAudit.reason, '教练任职终止，撤销本队管理权限')
        assert.equal(revokeAudit.actorUserId, admin.user.id)
        assert.ok(revokeAudit.requestId)
        assert.ok(secondPlayer.id)
      },
    )
  },
)
