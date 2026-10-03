import assert from 'node:assert/strict'
import test from 'node:test'
import { identityBadgeKinds, identityLabels } from './identity-badges.ts'

test('badges distinguish captain, information manager and website operations using actual roles', () => {
  assert.deepEqual(
    identityBadgeKinds('PLAYER_CONFIRMED', [
      'TEAM_CAPTAIN',
      'MATCH_REPORTER',
      'ORGANIZATION_ADMIN',
    ]),
    ['operator', 'captain', 'reporter', 'player'],
  )
  assert.deepEqual(identityBadgeKinds('STAFF_VERIFIED', ['TOURNAMENT_ADMIN']), ['admin'])
  assert.deepEqual(identityBadgeKinds('STAFF_VERIFIED'), [])
  assert.deepEqual(identityBadgeKinds('STUDENT_VERIFIED'), ['student'])
  assert.deepEqual(identityBadgeKinds('UNVERIFIED'), [])
  assert.deepEqual(identityBadgeKinds('STAFF_VERIFIED', ['PLATFORM_ADMIN', 'ORGANIZATION_ADMIN']), [
    'operator',
  ])
  assert.equal(identityLabels.reporter, '信息管理员')
  assert.equal(identityLabels.captain, '认证队长')
  assert.equal(identityLabels.operator, '网站运营')
})
