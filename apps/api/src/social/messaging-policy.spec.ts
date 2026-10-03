import 'reflect-metadata'
import assert from 'node:assert/strict'
import test from 'node:test'
import { MessagingService, canSendDirectMessages } from './messaging.service'
import type { AuthenticatedSession, AuthService } from '../auth/auth.service'
import type { PrismaService } from '../database/prisma.service'
import type { SocialService } from './social.service'
import { ApiHttpException } from '../common/api-http.exception'

function session(role?: string, scopeType = 'ORGANIZATION') {
  return {
    userId: 'sender',
    organizationId: 'org',
    user: { roles: role ? [{ role, scopeType, scopeId: 'org' }] : [] },
  } as AuthenticatedSession
}
test('only global platform administrator can send, all other roles and scopes are denied before mutation', async () => {
  for (const role of [
    undefined,
    'ORGANIZATION_ADMIN',
    'TOURNAMENT_ADMIN',
    'MATCH_REPORTER',
    'TEAM_CAPTAIN',
  ]) {
    let transactions = 0
    const current = session(role)
    const prisma = {
      $transaction: () => {
        transactions++
        throw Error('must not write')
      },
    } as unknown as PrismaService
    const service = new MessagingService(
      prisma,
      { requireSession: async () => current } as unknown as AuthService,
      {} as SocialService,
    )
    assert.equal(canSendDirectMessages(current), false)
    await assert.rejects(
      service.sendMessage('token', 'recipient', { body: '内容', clientMessageId: 'policy-test' }),
      (error: unknown) => error instanceof ApiHttpException && error.getStatus() === 403,
    )
    assert.equal(transactions, 0)
  }
  assert.equal(canSendDirectMessages(session('PLATFORM_ADMIN', 'PLATFORM')), true)
  assert.equal(canSendDirectMessages(session('PLATFORM_ADMIN', 'ORGANIZATION')), false)
})
