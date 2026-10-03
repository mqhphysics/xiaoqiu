import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { URL } from 'node:url'

import { isAccountEntryRoute } from '../../features/product/account-access.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const ts = require('typescript')
let storedSession = null

// Render the actual H5 component before effects run. Taro must be able to find
// the initial page instance even while account verification hides its UI.
const source = readFileSync(new URL('./index.h5.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText
const componentModule = { exports: {} }
const load = (name) => {
  if (name === '@tarojs/taro') return {}
  if (name.endsWith('/account-access')) return { isAccountEntryRoute }
  if (name.endsWith('/product.repository'))
    return {
      productRepository: {
        getMe() {
          throw new Error('Render must not authenticate before effects')
        },
      },
    }
  if (name.endsWith('/session.h5')) return { readSession: () => storedSession }
  if (name.endsWith('.scss')) return {}
  return require(name)
}
new Function('require', 'exports', 'module', compiled)(
  load,
  componentModule.exports,
  componentModule,
)
const { AccountBoundary } = componentModule.exports

function renderAt(route, session = null) {
  const previousWindow = globalThis.window
  globalThis.window = { location: { hash: route, pathname: '/' } }
  storedSession = session
  try {
    return renderToStaticMarkup(
      React.createElement(
        AccountBoundary,
        {
          overlays: React.createElement('aside', { 'data-overlay-test': true }, 'private overlay'),
        },
        React.createElement('div', { 'data-router-test': true }, 'Taro page instance'),
      ),
    )
  } finally {
    storedSession = null
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
}

test('unverified deep links retain the Taro route child while hiding it and excluding portal hosts', () => {
  for (const session of [null, { accessToken: 'fictional-unverified-token' }]) {
    const html = renderAt('#/pages/readonly-match-detail/index', session)
    assert.match(html, /data-router-test="true"/)
    assert.match(html, /style="display:none" aria-hidden="true"/)
    assert.ok(!html.includes('data-overlay-test'))
  }
})

test('the login route remains mounted and visible while private portal hosts stay closed', () => {
  const html = renderAt('#/pages/login/index')
  assert.match(html, /data-router-test="true"/)
  assert.match(html, /style="display:contents" aria-hidden="false"/)
  assert.ok(!html.includes('data-overlay-test'))
})
