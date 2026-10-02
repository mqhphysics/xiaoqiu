import assert from 'node:assert/strict'
import test from 'node:test'
import { localDemoShortPasswordsEnabled } from './local-demo-password-policy'

test('short login passwords require an explicit local-only configuration', () => {
  const local = {
    DATABASE_URL: 'postgresql://localhost:5432/xiaoqiu',
    LOCAL_DEMO_SHORT_PASSWORDS: '1',
  }
  assert.equal(localDemoShortPasswordsEnabled(local), true)
  assert.equal(localDemoShortPasswordsEnabled({ ...local, NODE_ENV: 'production' }), false)
  assert.equal(localDemoShortPasswordsEnabled({ ...local, LOCAL_DEMO_SHORT_PASSWORDS: '0' }), false)
  assert.equal(
    localDemoShortPasswordsEnabled({ ...local, DATABASE_URL: 'postgresql://server:5432/xiaoqiu' }),
    false,
  )
  assert.equal(
    localDemoShortPasswordsEnabled({
      ...local,
      DATABASE_URL: 'postgresql://localhost:5432/production',
    }),
    false,
  )
  assert.equal(
    localDemoShortPasswordsEnabled({
      ...local,
      DATABASE_URL: 'postgresql://localhost:5433/xiaoqiu',
    }),
    false,
  )
  assert.equal(localDemoShortPasswordsEnabled({ ...local, DATABASE_URL: 'invalid' }), false)
  assert.equal(localDemoShortPasswordsEnabled({}), false)
})
