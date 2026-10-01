import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { configureApp } from '../app.setup'
import { AuthService } from '../auth/auth.service'
import { hashPassword } from '../auth/password'
import { PrismaService } from '../database/prisma.service'
import { PrismaClient } from '../generated/prisma/client'
import { SocialModule } from '../social/social.module'
import type { ReportFieldsDto, WriteMatchReportDto } from './match-report.dto'
import { MatchReportModule } from './match-report.module'

function testDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL
  assert.ok(
    value,
    'Match report HTTP integration requires a dedicated TEST_DATABASE_URL; it never silently skips',
  )
  const parsed = new URL(value)
  const database = decodeURIComponent(parsed.pathname.slice(1))
  assert.match(database, /(?:^|_)(?:test|ci)(?:_|$)/, 'Never use the daily application database')
  if (process.env.DATABASE_URL) {
    const daily = new URL(process.env.DATABASE_URL)
    assert.ok(
      daily.hostname !== parsed.hostname ||
        (daily.port || '5432') !== (parsed.port || '5432') ||
        daily.pathname !== parsed.pathname ||
        (process.env.CI === 'true' && database === 'xiaoqiu_ci'),
      'Test and application databases must be different',
    )
  }
  return value
}

test(
  'PostgreSQL match reporting: real HTTP roles, frozen versions, concurrent retries and atomic confirmation',
  { timeout: 120_000 },
  async (t) => {
    const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } })
    let app: INestApplication | undefined
    const suffix = randomUUID().slice(0, 8)
    const password = 'Fictional-report-test-2026!'
    const digest = hashPassword(password)
    try {
      const organization = await prisma.organization.create({
        data: { slug: `report-test-${suffix}`, name: 'FICTIONAL_TEST 比赛报告组织' },
      })
      const otherOrganization = await prisma.organization.create({
        data: { slug: `report-other-${suffix}`, name: 'FICTIONAL_TEST 另一组织' },
      })
      const season = await prisma.season.create({
        data: {
          organizationId: organization.id,
          seasonCode: `TEST-${suffix}`,
          name: 'FICTIONAL_TEST 赛季',
        },
      })
      const tournament = await prisma.tournament.create({
        data: {
          organizationId: organization.id,
          seasonId: season.id,
          tournamentCode: `TEST-${suffix}`,
          name: 'FICTIONAL_TEST 赛事',
          status: 'PUBLISHED',
        },
      })
      const stage = await prisma.stage.create({
        data: {
          organizationId: organization.id,
          tournamentId: tournament.id,
          stageCode: `GROUP-${suffix}`,
          name: '测试小组赛',
          type: 'GROUP',
        },
      })
      const rule = await prisma.competitionRuleVersion.create({
        data: {
          organizationId: organization.id,
          tournamentId: tournament.id,
          version: 1,
          name: 'FICTIONAL_TEST 规程',
          rules: {
            fixture: 'FICTIONAL_TEST',
            results: {
              points: { win: 3, draw: 1, loss: 0 },
              tieBreakers: ['GOAL_DIFFERENCE', 'GOALS_FOR'],
              headToHead: { criteria: [], reapplyToRemainingTeams: false },
              groupShootout: 'REJECT',
              knockoutShootout: 'ALLOWED',
              forfeit: { winnerGoals: 3, loserGoals: 0, loserPoints: 0, both: null },
            },
          },
        },
      })
      const home = await prisma.team.create({
        data: {
          organizationId: organization.id,
          teamCode: `HOME-${suffix}`,
          name: 'FICTIONAL_TEST 主队',
        },
      })
      const away = await prisma.team.create({
        data: {
          organizationId: organization.id,
          teamCode: `AWAY-${suffix}`,
          name: 'FICTIONAL_TEST 客队',
        },
      })
      const match = await prisma.match.create({
        data: {
          organizationId: organization.id,
          tournamentId: tournament.id,
          stageId: stage.id,
          homeTeamId: home.id,
          awayTeamId: away.id,
          matchCode: `MATCH-${suffix}`,
          title: 'FICTIONAL_TEST 真实程序往返',
          status: 'SCHEDULED',
        },
      })
      const homePlayers = await Promise.all(
        [1, 2].map((number) =>
          prisma.playerProfile.create({
            data: {
              organizationId: organization.id,
              displayName: `FICTIONAL_TEST 主队球员${number}`,
              sourceType: 'FICTIONAL_TEST',
              sourceKey: `${suffix}-home-${number}`,
            },
          }),
        ),
      )
      const awayPlayer = await prisma.playerProfile.create({
        data: {
          organizationId: organization.id,
          displayName: 'FICTIONAL_TEST 客队球员',
          sourceType: 'FICTIONAL_TEST',
          sourceKey: `${suffix}-away`,
        },
      })

      const createRoster = async (teamId: string, players: typeof homePlayers, name: string) => {
        const registration = await prisma.teamRegistration.create({
          data: {
            organizationId: organization.id,
            tournamentId: tournament.id,
            teamId,
            status: 'APPROVED',
          },
        })
        const submission = await prisma.rosterSubmission.create({
          data: {
            organizationId: organization.id,
            teamRegistrationId: registration.id,
            submissionVersion: 1,
            status: 'DRAFT',
            sourceFileHash: name.padEnd(64, '0'),
          },
        })
        const snapshot = await prisma.rosterSnapshot.create({
          data: {
            organizationId: organization.id,
            tournamentId: tournament.id,
            teamId,
            teamRegistrationId: registration.id,
            rosterSubmissionId: submission.id,
            snapshotVersion: 1,
            sourceFileHash: name.padEnd(64, '0'),
          },
        })
        await prisma.rosterSnapshotEntry.createMany({
          data: players.map((player, index) => ({
            organizationId: organization.id,
            rosterSnapshotId: snapshot.id,
            playerProfileId: player.id,
            displayName: player.displayName,
            shirtNumber: index === 0 ? '09' : '7',
            sortOrder: index,
          })),
        })
        await prisma.rosterSubmission.update({
          where: { id: submission.id },
          data: { status: 'LOCKED', lockedAt: new Date() },
        })
        await prisma.rosterSnapshot.update({
          where: { id: snapshot.id },
          data: { lockedAt: new Date() },
        })
        return snapshot
      }
      const homeRoster = await createRoster(home.id, homePlayers, 'a')
      const awayRoster = await createRoster(away.id, [awayPlayer], 'b')
      const createUser = (label: string, organizationId = organization.id) =>
        prisma.user.create({
          data: {
            loginNameNormalized: `report-test-${suffix}-${label}`,
            displayName: `FICTIONAL_TEST ${label}`,
            memberships: { create: { organizationId, status: 'ACTIVE' } },
            passwordCredential: {
              create: {
                passwordHash: digest.hash,
                passwordSalt: digest.salt,
                algorithm: digest.algorithm,
              },
            },
          },
        })
      const reporter = await createUser('reporter')
      const reporter2 = await createUser('reporter2')
      const admin = await createUser('admin')
      const student = await createUser('student')
      const wrongAdmin = await createUser('wrong-admin')
      const outsider = await createUser('outsider', otherOrganization.id)
      const reporterRole = await prisma.roleAssignment.create({
        data: {
          organizationId: organization.id,
          userId: reporter.id,
          role: 'MATCH_REPORTER',
          scopeType: 'MATCH',
          scopeId: match.id,
        },
      })
      await prisma.roleAssignment.createMany({
        data: [
          {
            organizationId: organization.id,
            userId: reporter2.id,
            role: 'MATCH_REPORTER',
            scopeType: 'MATCH',
            scopeId: match.id,
          },
          {
            organizationId: organization.id,
            userId: admin.id,
            role: 'TOURNAMENT_ADMIN',
            scopeType: 'TOURNAMENT',
            scopeId: tournament.id,
          },
          {
            organizationId: organization.id,
            userId: wrongAdmin.id,
            role: 'TOURNAMENT_ADMIN',
            scopeType: 'TOURNAMENT',
            scopeId: randomUUID(),
          },
          {
            organizationId: organization.id,
            userId: student.id,
            role: 'TEAM_CAPTAIN',
            scopeType: 'TEAM',
            scopeId: home.id,
          },
          {
            organizationId: otherOrganization.id,
            userId: outsider.id,
            role: 'MATCH_REPORTER',
            scopeType: 'MATCH',
            scopeId: match.id,
          },
        ],
      })

      const module = await Test.createTestingModule({ imports: [MatchReportModule, SocialModule] })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile()
      app = module.createNestApplication({ logger: false })
      configureApp(app)
      await app.init()
      const auth = app.get(AuthService)
      const tokens = new Map<string, string>()
      for (const account of [reporter, reporter2, admin, student, wrongAdmin, outsider]) {
        const session = await auth.login(
          account.loginNameNormalized!,
          password,
          account.id === outsider.id ? otherOrganization.id : organization.id,
          {},
        )
        tokens.set(account.id, session.accessToken)
      }
      const server = app.getHttpServer()
      const path = `/api/matches/${match.id}/report`
      const bearer = (id: string) => `Bearer ${tokens.get(id)!}`
      const post = (userId: string, body: WriteMatchReportDto) =>
        request(server).post(path).set('authorization', bearer(userId)).send(body)
      const report: ReportFieldsDto = {
        homeScore: '2',
        awayScore: '1',
        homePenaltyScore: '',
        awayPenaltyScore: '',
        outcome: 'FINISHED',
        notes: 'FICTIONAL_TEST 初始报告',
        events: [
          {
            clientEventId: 'client-home-one',
            kind: 'GOAL',
            side: 'HOME',
            minute: '15',
            addedMinute: '',
            playerId: homePlayers[0]!.id,
            relatedPlayerId: homePlayers[1]!.id,
          },
          {
            clientEventId: 'client-home-two',
            kind: 'GOAL',
            side: 'HOME',
            minute: '40',
            addedMinute: '1',
            playerId: homePlayers[1]!.id,
            relatedPlayerId: '',
          },
          {
            clientEventId: 'client-away-one',
            kind: 'GOAL',
            side: 'AWAY',
            minute: '65',
            addedMinute: '',
            playerId: awayPlayer.id,
            relatedPlayerId: '',
          },
        ],
      }
      const content = (
        version: number,
        fields = report,
        action: WriteMatchReportDto['action'] = 'SAVE',
        id = randomUUID(),
      ): WriteMatchReportDto => ({
        clientActionId: id,
        expectedVersion: version,
        action,
        reason: version ? 'FICTIONAL_TEST 核对记录' : '',
        homeRosterSnapshotId: homeRoster.id,
        awayRosterSnapshotId: awayRoster.id,
        ruleVersionId: rule.id,
        fields,
      })
      const review = (
        version: number,
        action: 'RETURN' | 'CONFIRM',
        reason = '',
      ): WriteMatchReportDto => ({
        clientActionId: randomUUID(),
        expectedVersion: version,
        action,
        reason,
      })
      const official = () => prisma.match.findUniqueOrThrow({ where: { id: match.id } })
      let currentVersion = 0

      await t.test('读取真实锁定名单且不泄露受限资料；未登录和错误对象权限拒绝', async () => {
        await request(server).get(path).set('x-dev-role', 'ORGANIZATION_ADMIN').expect(401)
        for (const user of [student, wrongAdmin])
          await request(server).get(path).set('authorization', bearer(user.id)).expect(403)
        await request(server).get(path).set('authorization', bearer(outsider.id)).expect(404)
        const result = await request(server)
          .get(path)
          .set('authorization', bearer(reporter.id))
          .expect(200)
        assert.equal(result.body.homeTeam.players[0].shirtNumber, '09')
        assert.equal(result.body.ruleVersionId, rule.id)
        assert.equal(result.headers['cache-control'], 'private, no-store')
        assert.ok(!JSON.stringify(result.body).includes('studentId'))
        await request(server)
          .get(path + '/history')
          .set('authorization', bearer(student.id))
          .expect(403)
      })
      await t.test('同一保存并发重试只创建一个版本、一个审计和一个幂等结果', async () => {
        const command = content(0)
        const outcomes = await Promise.all([post(reporter.id, command), post(reporter.id, command)])
        assert.deepEqual(
          outcomes.map((response) => response.status),
          [200, 200],
        )
        assert.deepEqual(outcomes[0]!.body, outcomes[1]!.body)
        currentVersion = 1
        assert.equal(await prisma.matchReportRevision.count({ where: { matchId: match.id } }), 1)
        assert.equal(await prisma.auditLog.count({ where: { targetId: match.id } }), 1)
        assert.equal((await official()).homeScore, null)
        assert.equal(await prisma.matchEvent.count({ where: { matchId: match.id } }), 0)
        const changed = await post(reporter.id, {
          ...command,
          fields: { ...report, notes: 'changed' },
        })
        assert.equal(changed.status, 409)
        assert.equal(changed.body.error?.code ?? changed.body.code, 'COMMON.IDEMPOTENCY_KEY_REUSED')
      })
      await t.test('错误名单、跨队球员、事件重复、过时版本均不写入', async () => {
        await post(reporter.id, content(0)).expect(409)
        await post(reporter.id, {
          ...content(currentVersion),
          homeRosterSnapshotId: awayRoster.id,
        }).expect(409)
        await post(
          reporter.id,
          content(currentVersion, {
            ...report,
            events: [{ ...report.events[0]!, playerId: awayPlayer.id }],
          }),
        ).expect(400)
        await post(
          reporter.id,
          content(currentVersion, { ...report, events: [report.events[0]!, report.events[0]!] }),
        ).expect(400)
        assert.equal((await official()).reportVersion, currentVersion)
      })
      await t.test('两个信息员从同一版本保存，只有一方成功，失败方不能覆盖', async () => {
        const outcomes = await Promise.all([
          post(reporter.id, content(currentVersion, { ...report, notes: 'FICTIONAL_TEST 并发一' })),
          post(
            reporter2.id,
            content(currentVersion, { ...report, notes: 'FICTIONAL_TEST 并发二' }),
          ),
        ])
        assert.deepEqual(outcomes.map((result) => result.status).sort(), [200, 409])
        currentVersion += 1
        assert.equal((await official()).reportVersion, currentVersion)
        assert.equal((await official()).homeScore, null)
      })
      await t.test('提交只创建待审版本；审核不能偷换内容；退回保留历史', async () => {
        const submitCommand = content(currentVersion, report, 'SUBMIT')
        await post(reporter.id, submitCommand).expect(200)
        currentVersion += 1
        const inbox = await request(server)
          .get('/api/me/notifications')
          .set('authorization', bearer(admin.id))
          .expect(200)
        const notice = inbox.body.items.find(
          (item: { type: string; body: string }) =>
            item.type === 'MATCH_REPORT_SUBMITTED' && item.body.includes(match.title),
        )
        assert.ok(notice)
        await request(server)
          .put(`/api/me/notifications/${notice.id}/read`)
          .set('authorization', bearer(admin.id))
          .expect(200)
        const firstRead = await prisma.userNotification.findUniqueOrThrow({
          where: { id: notice.id },
        })
        await post(reporter.id, submitCommand).expect(200)
        assert.equal(
          (
            await prisma.userNotification.findUniqueOrThrow({ where: { id: notice.id } })
          ).readAt?.toISOString(),
          firstRead.readAt?.toISOString(),
        )
        const wrongInbox = await request(server)
          .get('/api/me/notifications')
          .set('authorization', bearer(wrongAdmin.id))
          .expect(200)
        assert.ok(
          !wrongInbox.body.items.some(
            (item: { type: string }) => item.type === 'MATCH_REPORT_SUBMITTED',
          ),
        )
        assert.equal((await official()).confirmedReportVersion, null)
        assert.equal((await official()).homeScore, null)
        await post(reporter.id, review(currentVersion, 'CONFIRM')).expect(403)
        await post(admin.id, { ...review(currentVersion, 'CONFIRM'), fields: report }).expect(400)
        await post(admin.id, review(currentVersion, 'RETURN')).expect(400)
        const before = await prisma.matchReportRevision.findFirstOrThrow({
          where: { matchId: match.id, version: currentVersion },
        })
        await post(
          admin.id,
          review(currentVersion, 'RETURN', 'FICTIONAL_TEST 请核对第二球'),
        ).expect(200)
        currentVersion += 1
        const returned = await prisma.matchReportRevision.findFirstOrThrow({
          where: { matchId: match.id, version: currentVersion },
        })
        assert.deepEqual(returned.fields, before.fields)
        assert.equal(returned.status, 'RETURNED')
        const reporterInbox = await request(server)
          .get('/api/me/notifications')
          .set('authorization', bearer(reporter.id))
          .expect(200)
        assert.ok(
          reporterInbox.body.items.some((item: { body: string }) =>
            item.body.includes('请核对第二球'),
          ),
        )
        assert.equal((await official()).homeScore, null)
      })
      await t.test('确认同事务投影比分和服务器 UUID 事件，审计和 Outbox 只有一次', async () => {
        await post(reporter.id, content(currentVersion, report, 'SUBMIT')).expect(200)
        currentVersion += 1
        const command = review(currentVersion, 'CONFIRM')
        const confirmed = await post(admin.id, command).expect(200)
        currentVersion += 1
        const retry = await post(admin.id, command).expect(200)
        assert.deepEqual(retry.body, confirmed.body)
        const actual = await official()
        assert.equal(actual.confirmedReportVersion, currentVersion)
        assert.equal(actual.homeScore, 2)
        assert.equal(actual.awayScore, 1)
        const events = await prisma.matchEvent.findMany({ where: { matchId: match.id } })
        assert.equal(events.length, 3)
        for (const event of events)
          assert.match(event.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
        assert.equal(
          await prisma.outboxJob.count({
            where: { aggregateId: match.id, eventType: 'MatchReportConfirmed' },
          }),
          1,
        )
        await post(reporter.id, content(currentVersion)).expect(409)
      })
      await t.test('2:1 更正为 1:1 时旧官方赛果仍保留，故障回滚整个确认事务', async () => {
        const corrected = {
          ...report,
          homeScore: '1',
          events: report.events.filter((event) => event.clientEventId !== 'client-home-two'),
        }
        await post(admin.id, {
          ...content(currentVersion, corrected, 'CORRECT'),
          reason: '',
        }).expect(400)
        await post(admin.id, {
          ...content(currentVersion, corrected, 'CORRECT'),
          reason: 'FICTIONAL_TEST 第二球无效',
        }).expect(200)
        currentVersion += 1
        assert.equal((await official()).homeScore, 2)
        assert.equal(await prisma.matchEvent.count({ where: { matchId: match.id } }), 3)
        await post(reporter.id, content(currentVersion, corrected, 'SUBMIT')).expect(200)
        currentVersion += 1
        const auditCount = await prisma.auditLog.count({ where: { targetId: match.id } })
        const originalEventIds = (
          await prisma.matchEvent.findMany({ where: { matchId: match.id }, orderBy: { id: 'asc' } })
        ).map((event) => event.id)
        const injected = await prisma.outboxJob.create({
          data: {
            organizationId: organization.id,
            topic: 'FICTIONAL_TEST',
            aggregateType: 'Match',
            aggregateId: match.id,
            eventType: 'FICTIONAL_TEST_COLLISION',
            deduplicationKey: `match-report-confirmed:${match.id}:${currentVersion + 1}`,
            payload: {},
          },
        })
        const command = review(currentVersion, 'CONFIRM')
        const failed = await post(admin.id, command)
        assert.ok(failed.status >= 500)
        assert.equal((await official()).reportVersion, currentVersion)
        assert.equal((await official()).homeScore, 2)
        assert.deepEqual(
          (
            await prisma.matchEvent.findMany({
              where: { matchId: match.id },
              orderBy: { id: 'asc' },
            })
          ).map((event) => event.id),
          originalEventIds,
        )
        assert.equal(await prisma.auditLog.count({ where: { targetId: match.id } }), auditCount)
        await prisma.outboxJob.delete({ where: { id: injected.id } })
        await post(admin.id, command).expect(200)
        currentVersion += 1
        assert.equal((await official()).homeScore, 1)
        assert.equal((await official()).awayScore, 1)
        assert.equal(await prisma.matchEvent.count({ where: { matchId: match.id } }), 2)
        assert.equal(
          await prisma.outboxJob.count({
            where: { aggregateId: match.id, eventType: 'MatchReportConfirmed' },
          }),
          2,
        )
      })
      await t.test('历史分页包含双方固定名单与规则，不可变版本拒绝 SQL/ORM 覆盖', async () => {
        const page = await request(server)
          .get(path + '/history?limit=2')
          .set('authorization', bearer(reporter.id))
          .expect(200)
        assert.equal(page.body.items.length, 2)
        assert.equal(page.body.items[0].homeRosterSnapshotId, homeRoster.id)
        assert.equal(page.body.items[0].ruleVersionId, rule.id)
        assert.equal(page.body.items[0].homePlayers[0].shirtNumber, '09')
        const older = await request(server)
          .get(path + `/history?beforeVersion=${page.body.nextBeforeVersion}`)
          .set('authorization', bearer(reporter.id))
          .expect(200)
        assert.ok(
          older.body.items.every(
            (item: { version: number }) => item.version < page.body.nextBeforeVersion,
          ),
        )
        const original = await prisma.matchReportRevision.findFirstOrThrow({
          where: { matchId: match.id, version: 1 },
        })
        assert.equal((original.fields as unknown as ReportFieldsDto).homeScore, '2')
        await assert.rejects(() =>
          prisma.matchReportRevision.update({
            where: { id: original.id },
            data: { reason: 'FICTIONAL_TEST illegal overwrite' },
          }),
        )
        assert.equal((await official()).reportVersion, currentVersion)
      })
      await t.test('已保存后的阶段或对阵改变不能把旧报告投影到新上下文', async () => {
        const otherStage = await prisma.stage.create({
          data: {
            organizationId: organization.id,
            tournamentId: tournament.id,
            stageCode: `OTHER-${suffix}`,
            name: 'FICTIONAL_TEST 其他阶段',
            type: 'GROUP',
          },
        })
        await prisma.match.update({ where: { id: match.id }, data: { stageId: otherStage.id } })
        await post(admin.id, content(currentVersion, report, 'CORRECT')).expect(409)
        await request(server).get(path).set('authorization', bearer(admin.id)).expect(409)
        await prisma.match.update({
          where: { id: match.id },
          data: { stageId: stage.id, homeTeamId: away.id },
        })
        await post(admin.id, content(currentVersion, report, 'CORRECT')).expect(409)
        const frozenHistory = await request(server)
          .get(path + '/history')
          .set('authorization', bearer(admin.id))
          .expect(200)
        assert.equal(frozenHistory.body.items[0].homePlayers.length, homePlayers.length)
        assert.equal(frozenHistory.body.items[0].homePlayers[0].id, homePlayers[0]!.id)
        await prisma.match.update({ where: { id: match.id }, data: { homeTeamId: home.id } })
        assert.equal((await official()).reportVersion, currentVersion)
        assert.equal((await official()).homeScore, 1)
      })
      const createExtraMatch = (label: string) =>
        prisma.match.create({
          data: {
            organizationId: organization.id,
            tournamentId: tournament.id,
            stageId: stage.id,
            homeTeamId: home.id,
            awayTeamId: away.id,
            matchCode: `${label}-${suffix}`,
            title: `FICTIONAL_TEST ${label}`,
            status: 'SCHEDULED',
          },
        })
      const postExtra = (target: { id: string }, userId: string, command: WriteMatchReportDto) =>
        request(server)
          .post(`/api/matches/${target.id}/report`)
          .set('authorization', bearer(userId))
          .send(command)

      await t.test(
        '比赛中止确认投影 CANCELLED 和空比分，保留 appearance 历史但不保留正式事件',
        async () => {
          const target = await createExtraMatch('ABANDONED')
          await prisma.matchAppearance.create({
            data: {
              organizationId: organization.id,
              matchId: target.id,
              teamId: home.id,
              playerId: homePlayers[0]!.id,
              shirtNumber: '09',
              starter: true,
              minutesPlayed: 30,
            },
          })
          await prisma.matchEvent.create({
            data: {
              organizationId: organization.id,
              matchId: target.id,
              teamId: home.id,
              playerId: homePlayers[0]!.id,
              type: 'GOAL',
              minute: 15,
            },
          })
          const abandoned = { ...report, outcome: 'ABANDONED' as const }
          await postExtra(target, admin.id, {
            ...content(0, abandoned, 'SUBMIT'),
            reason: 'FICTIONAL_TEST 天气中止',
          }).expect(200)
          await postExtra(target, admin.id, review(1, 'CONFIRM')).expect(200)
          const actual = await prisma.match.findUniqueOrThrow({ where: { id: target.id } })
          assert.equal(actual.status, 'CANCELLED')
          assert.equal(actual.homeScore, null)
          assert.equal(actual.awayScore, null)
          assert.equal(actual.confirmedReportVersion, 2)
          assert.equal(await prisma.matchEvent.count({ where: { matchId: target.id } }), 0)
          assert.equal(await prisma.matchAppearance.count({ where: { matchId: target.id } }), 1)
        },
      )
      await t.test('缺少阶段或完整规程禁止保存；合法弃权必须与绑定规程判定比分一致', async () => {
        const noStage = await createExtraMatch('NO_STAGE')
        await prisma.match.update({ where: { id: noStage.id }, data: { stageId: null } })
        const blocked = await request(server)
          .get(`/api/matches/${noStage.id}/report`)
          .set('authorization', bearer(admin.id))
          .expect(200)
        assert.equal(blocked.body.permissions.canEdit, false)
        assert.ok(blocked.body.blockingReasons.some((reason: string) => reason.includes('阶段')))
        await postExtra(noStage, admin.id, content(0, report, 'SAVE')).expect(409)
        assert.equal(await prisma.matchReportRevision.count({ where: { matchId: noStage.id } }), 0)
        const incompleteRule = await prisma.competitionRuleVersion.create({
          data: {
            organizationId: organization.id,
            tournamentId: tournament.id,
            version: 2,
            name: 'FICTIONAL_TEST 未配置完整赛果规程',
            rules: { fixture: 'FICTIONAL_TEST' },
          },
        })
        const unknown = await createExtraMatch('UNKNOWN_FORFEIT')
        const forfeit = {
          ...report,
          outcome: 'AWAY_FORFEIT' as const,
          homeScore: '3',
          awayScore: '0',
          events: [],
        }
        await postExtra(unknown, admin.id, {
          ...content(0, forfeit, 'SUBMIT'),
          ruleVersionId: incompleteRule.id,
          reason: 'FICTIONAL_TEST 客队弃权',
        }).expect(409)
        assert.equal(await prisma.matchReportRevision.count({ where: { matchId: unknown.id } }), 0)
        assert.equal(
          (await prisma.match.findUniqueOrThrow({ where: { id: unknown.id } }))
            .confirmedReportVersion,
          null,
        )
        const forfeitRule = await prisma.competitionRuleVersion.create({
          data: {
            organizationId: organization.id,
            tournamentId: tournament.id,
            version: 3,
            name: 'FICTIONAL_TEST 明示3比0弃权判罚',
            rules: {
              results: {
                points: { win: 3, draw: 1, loss: 0 },
                tieBreakers: ['GOAL_DIFFERENCE', 'GOALS_FOR'],
                headToHead: { criteria: [], reapplyToRemainingTeams: false },
                groupShootout: 'REJECT',
                knockoutShootout: 'ALLOWED',
                forfeit: { winnerGoals: 3, loserGoals: 0, loserPoints: 0, both: null },
              },
            },
          },
        })
        const target = await createExtraMatch('RULE_FORFEIT')
        await postExtra(target, admin.id, {
          ...content(0, { ...forfeit, homeScore: '2', awayScore: '1' }, 'SUBMIT'),
          ruleVersionId: forfeitRule.id,
          reason: 'FICTIONAL_TEST 弃权但错误填写2比1',
        }).expect(200)
        await postExtra(target, admin.id, review(1, 'CONFIRM')).expect(400)
        await postExtra(target, admin.id, review(1, 'RETURN', 'FICTIONAL_TEST 按3比0核对')).expect(
          200,
        )
        await postExtra(target, admin.id, {
          ...content(2, forfeit, 'SUBMIT'),
          ruleVersionId: forfeitRule.id,
          reason: 'FICTIONAL_TEST 依绑定规程修正',
        }).expect(200)
        await postExtra(target, admin.id, review(3, 'CONFIRM')).expect(200)
        const actual = await prisma.match.findUniqueOrThrow({ where: { id: target.id } })
        assert.equal(actual.homeScore, 3)
        assert.equal(actual.awayScore, 0)
        assert.equal(actual.status, 'FINISHED')
        assert.equal(await prisma.matchEvent.count({ where: { matchId: target.id } }), 0)
      })
      await t.test('两个不同管理员同时退回/确认，只有一个审核动作和一个版本成功', async () => {
        const secondAdmin = await createUser('admin2')
        await prisma.roleAssignment.create({
          data: {
            organizationId: organization.id,
            userId: secondAdmin.id,
            role: 'TOURNAMENT_ADMIN',
            scopeType: 'TOURNAMENT',
            scopeId: tournament.id,
          },
        })
        tokens.set(
          secondAdmin.id,
          (await auth.login(secondAdmin.loginNameNormalized!, password, organization.id, {}))
            .accessToken,
        )
        const target = await createExtraMatch('REVIEW_RACE')
        await postExtra(target, admin.id, content(0, report, 'SUBMIT')).expect(200)
        const outcomes = await Promise.all([
          postExtra(target, admin.id, review(1, 'CONFIRM')),
          postExtra(target, secondAdmin.id, review(1, 'RETURN', 'FICTIONAL_TEST 退回核对')),
        ])
        assert.deepEqual(outcomes.map((result) => result.status).sort(), [200, 409])
        assert.equal(
          (await prisma.match.findUniqueOrThrow({ where: { id: target.id } })).reportVersion,
          2,
        )
        assert.equal(await prisma.matchReportRevision.count({ where: { matchId: target.id } }), 2)
        assert.equal(await prisma.auditLog.count({ where: { targetId: target.id } }), 2)
      })
      await t.test('通知回执 Outbox 失败回滚确认的比分、事件、版本、幂等与站内通知', async () => {
        const target = await createExtraMatch('NOTIFICATION_ROLLBACK')
        await postExtra(target, admin.id, content(0, report, 'SUBMIT')).expect(200)
        const noticesBefore = await prisma.userNotification.count({
          where: { organizationId: organization.id },
        })
        const auditBefore = await prisma.auditLog.count({ where: { targetId: target.id } })
        const functionName = `report_notification_fault_${suffix}`
        assert.match(functionName, /^report_notification_fault_[a-f0-9]{8}$/)
        // SQL fault injection is confined to the URL-validated dedicated test database.
        await prisma.$executeRawUnsafe(
          `CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.topic = 'match.report.notification' AND NEW.payload->>'action' = 'CONFIRM' THEN RAISE EXCEPTION 'FICTIONAL_TEST notification outbox failure'; END IF; RETURN NEW; END; $$`,
        )
        await prisma.$executeRawUnsafe(
          `CREATE TRIGGER ${functionName} BEFORE INSERT ON outbox_jobs FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
        )
        const command = review(1, 'CONFIRM')
        try {
          assert.ok((await postExtra(target, admin.id, command)).status >= 500)
          const actual = await prisma.match.findUniqueOrThrow({ where: { id: target.id } })
          assert.equal(actual.reportVersion, 1)
          assert.equal(actual.confirmedReportVersion, null)
          assert.equal(actual.homeScore, null)
          assert.equal(await prisma.matchEvent.count({ where: { matchId: target.id } }), 0)
          assert.equal(await prisma.matchReportRevision.count({ where: { matchId: target.id } }), 1)
          assert.equal(await prisma.auditLog.count({ where: { targetId: target.id } }), auditBefore)
          assert.equal(
            await prisma.userNotification.count({ where: { organizationId: organization.id } }),
            noticesBefore,
          )
          assert.equal(
            await prisma.idempotencyRecord.count({
              where: { idempotencyKey: command.clientActionId },
            }),
            0,
          )
        } finally {
          await prisma.$executeRawUnsafe(`DROP TRIGGER ${functionName} ON outbox_jobs`)
          await prisma.$executeRawUnsafe(`DROP FUNCTION ${functionName}()`)
        }
        await postExtra(target, admin.id, command).expect(200)
        assert.equal(
          (await prisma.match.findUniqueOrThrow({ where: { id: target.id } })).homeScore,
          2,
        )
      })
      await t.test('已撤销角色和被冻结账户不能使用旧 token 继续访问', async () => {
        await prisma.roleAssignment.update({
          where: { id: reporterRole.id },
          data: { revokedAt: new Date() },
        })
        await request(server).get(path).set('authorization', bearer(reporter.id)).expect(403)
        await post(reporter.id, content(currentVersion)).expect(403)
        await prisma.userSession.updateMany({
          where: { userId: reporter2.id, revokedAt: null },
          data: { expiresAt: new Date(Date.now() - 60_000) },
        })
        await request(server).get(path).set('authorization', bearer(reporter2.id)).expect(401)
        const renewed = await auth.login(
          reporter2.loginNameNormalized!,
          password,
          organization.id,
          {},
        )
        tokens.set(reporter2.id, renewed.accessToken)
        await prisma.user.update({ where: { id: reporter2.id }, data: { status: 'FROZEN' } })
        await request(server).get(path).set('authorization', bearer(reporter2.id)).expect(401)
        assert.equal((await official()).reportVersion, currentVersion)
      })
    } finally {
      await app?.close()
      await prisma.$disconnect()
      // Immutable revisions/rosters are intentionally retained. The runner drops only
      // its dedicated test database, instead of bypassing immutability for cleanup.
    }
  },
)
