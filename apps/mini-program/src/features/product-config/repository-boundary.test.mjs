import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { URL } from 'node:url'

import * as accessBoundary from './access-boundary.logic.ts'
import { parseProductConfiguration } from './product-config.logic.ts'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const configuration = (enabled) =>
  parseProductConfiguration({
    schemaVersion: 1,
    revision: 'test',
    accountRequired: !enabled,
    serverGuestAccess: enabled,
    guest: { enabled },
    sport: { format: 'EIGHT_A_SIDE', playersPerSide: 8 },
    modules: { home: { enabled: true }, schedule: { enabled: true }, teams: { enabled: true } },
  })
const fictionalSession = (token = 'fictional-test-session', organizationId = 'test-org') => ({
  accessToken: token,
  user: { id: 'test-user', organizationId },
})

// Execute the real request implementations. Only the network/platform and account storage are fake.
function fixture({ web = true, enabled = true, session = null, needsAccount = false } = {}) {
  const state = {
    session,
    needsAccount,
    config: configuration(enabled),
    configFailure: false,
    configurationReads: 0,
    requests: [],
    invalidations: 0,
    respond: () => ({ statusCode: 200, data: { items: [] } }),
  }
  const sessionApi = {
    readSession: () => state.session,
    clearSession: () => {
      state.session = null
    },
    saveSession: (value) => {
      state.session = value
      state.needsAccount = true
    },
    leaveGuestMode: () => undefined,
  }
  const policy = {
    readAccountPresence: () => ({
      session: state.session,
      hasSession: Boolean(state.session),
      needsAccount: state.needsAccount || Boolean(state.session),
    }),
    getConfiguration: async () => {
      state.configurationReads++
      if (state.configFailure) throw new Error('offline')
      return state.config
    },
    markAccountInvalid: () => {
      state.invalidations++
      state.needsAccount = true
      state.session = null
    },
    clearAccountByUser: () => {
      state.session = null
      state.needsAccount = false
    },
  }
  const taro = {
    ENV_TYPE: { WEB: 'WEB', WEAPP: 'WEAPP' },
    getEnv: () => (web ? 'WEB' : 'WEAPP'),
    request: async (request) => {
      state.requests.push(request)
      return state.respond(request)
    },
  }
  function loadRepository(relativePath) {
    const compiled = ts.transpileModule(
      readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
      },
    ).outputText
    const module = { exports: {} }
    const load = (name) => {
      if (name === '@tarojs/taro') return taro
      if (name.endsWith('/session')) return sessionApi
      if (name.endsWith('/policy-state') || name === './policy-state') return policy
      if (name.endsWith('/access-boundary.logic')) return accessBoundary
      if (name === './product-config.logic') return { parseProductConfiguration }
      if (name === './mock-fixture') return { readonlyScheduleMockFixture: { tournaments: [] } }
      if (name === './readonly-schedule.logic')
        return { sortMatchesByStartAt: (matches) => matches }
      throw new Error(`Unexpected repository dependency: ${name}`)
    }
    new Function('require', 'exports', 'module', 'process', compiled)(
      load,
      module.exports,
      module,
      { env: { TARO_APP_API_BASE_URL: 'https://fictional-api.test/api' } },
    )
    return module.exports
  }
  return {
    state,
    product: loadRepository('../product/product.repository.ts').productRepository,
    readonly: loadRepository('../readonly-schedule/readonly-schedule.repository.ts')
      .readonlyScheduleRepository,
    capabilities: loadRepository('./product-config.repository.ts').productConfigRepository,
  }
}

test('both actual H5 repositories allow only future-configured public GET without a bearer token', async () => {
  const { state, product, readonly } = fixture()
  assert.deepEqual(await product.getPublishedTournaments(), { items: [] })
  assert.deepEqual(await readonly.listTournaments(), { data: [], source: 'api' })
  assert.equal(state.requests.length, 2)
  assert.ok(
    state.requests.every(
      (request) => request.method === 'GET' && !('Authorization' in request.header),
    ),
  )
  assert.ok(
    state.requests.every(
      (request) => request.url === 'https://fictional-api.test/api/public/tournaments',
    ),
  )
})

test('closed, missing, inconsistent, failed or expired-account configuration blocks both H5 requests', async () => {
  for (const mode of ['closed', 'missing', 'inconsistent', 'offline', 'expired']) {
    const { state, product, readonly } = fixture({
      enabled: mode !== 'closed',
      needsAccount: mode === 'expired',
    })
    if (mode === 'missing') state.config = null
    if (mode === 'inconsistent') state.config = { ...state.config, accountRequired: true }
    if (mode === 'offline') state.configFailure = true
    await assert.rejects(product.getHome(), (error) => error.statusCode === 401)
    await assert.rejects(readonly.listTournaments(), (error) => error.statusCode === 401)
    assert.equal(state.requests.length, 0, mode)
  }
})

test('future guest configuration grants no me, admin, captain, messaging, unknown read or write request', async () => {
  const { state, product } = fixture()
  const privateRequests = [
    () => product.getMe(),
    () => product.getAdminIdentities(),
    () => product.getCaptainWorkspace('team'),
    () => product.getConversations(),
    () => product.getTeamPreferences(),
    () => product.getPerson('user'),
    () => product.reviewMatch('match', 5),
    () => product.createPost('test', 'action'),
  ]
  for (const request of privateRequests)
    await assert.rejects(request(), (error) => error.statusCode === 401)
  assert.equal(state.requests.length, 0)
})

test('explicit login remains usable after account expiry without a bearer header', async () => {
  const { state, product } = fixture({ enabled: false, needsAccount: true })
  state.respond = () => ({ statusCode: 200, data: fictionalSession() })
  await product.login('test-account', 'fictional-password')
  assert.equal(state.requests[0].method, 'POST')
  assert.equal(state.requests[0].header.Authorization, undefined)
  assert.equal(state.configurationReads, 0)
  assert.equal(state.session.accessToken, 'fictional-test-session')
})

test('a real account sends its bearer token and an actual 401 latches login instead of downgrading to guest', async () => {
  for (const repository of ['product', 'readonly']) {
    const current = fixture({ session: fictionalSession() })
    current.state.respond = () => ({ statusCode: 401, data: { message: 'actual unauthorized' } })
    const read =
      repository === 'product'
        ? () => current.product.getHome()
        : () => current.readonly.listTournaments()
    await assert.rejects(
      read(),
      (error) => error.statusCode === 401 && error.message === 'actual unauthorized',
    )
    assert.equal(current.state.requests[0].header.Authorization, 'Bearer fictional-test-session')
    assert.equal(current.state.requests[0].header['x-organization-id'], 'test-org')
    assert.equal(current.state.invalidations, 1)
    current.state.respond = () => ({ statusCode: 200, data: { items: [] } })
    await assert.rejects(read(), (error) => error.statusCode === 401)
    assert.equal(current.state.requests.length, 1)
  }
})

test('both actual future guest requests propagate server 400/401 and never return a mock success', async () => {
  for (const statusCode of [400, 401]) {
    const { state, product, readonly } = fixture()
    state.respond = () => ({ statusCode, data: { message: `actual ${statusCode}` } })
    await assert.rejects(
      product.getPublishedTournaments(),
      (error) => error.statusCode === statusCode && error.message === `actual ${statusCode}`,
    )
    await assert.rejects(
      readonly.listTournaments(),
      (error) => error.statusCode === statusCode && error.message === `actual ${statusCode}`,
    )
    assert.equal(state.invalidations, 0)
  }
})

test('an old response cannot clear a replacement account or return capabilities for a switched organization', async () => {
  for (const repository of ['product', 'readonly', 'capabilities']) {
    const current = fixture({ session: fictionalSession('fictional-old') })
    current.state.respond = () => {
      current.state.session = fictionalSession('fictional-new')
      return { statusCode: 401, data: { message: 'old account response' } }
    }
    const request =
      repository === 'product'
        ? current.product.getHome
        : repository === 'readonly'
          ? current.readonly.listTournaments
          : current.capabilities.getCapabilities
    await assert.rejects(request())
    assert.equal(current.state.session.accessToken, 'fictional-new')
    assert.equal(current.state.invalidations, 0)
  }
  const current = fixture({ session: fictionalSession() })
  current.state.respond = () => {
    current.state.session = fictionalSession('fictional-test-session', 'other-org')
    return { statusCode: 200, data: { schemaVersion: 1, organizationId: 'test-org' } }
  }
  await assert.rejects(current.capabilities.getCapabilities(), /重新验证会话/)
})

test('shared repository H5 guards leave the existing WeChat anonymous request branch unchanged', async () => {
  const { state, product, readonly } = fixture({ web: false, enabled: false, needsAccount: true })
  await product.getPublishedTournaments()
  assert.deepEqual(await readonly.listTournaments(), { data: [], source: 'api' })
  assert.equal(state.requests.length, 2)
  assert.equal(state.configurationReads, 0)
})
