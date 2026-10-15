// Headless browser regression against the real local API. --built serves this checkout's
// production artifacts through browser routing on the existing fixed website origin.
/* global document, getComputedStyle, Image, innerWidth */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import process from 'node:process'
import { URL } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.CURSOR_PLAYWRIGHT_MODULE || 'playwright')
const output = resolve(process.argv[2] || '.cursor-review')
await mkdir(output, { recursive: true })
const before = process.argv.includes('--before')
const built = process.argv.includes('--built')
const dist = resolve('apps/mini-program/dist')
const browser = await chromium.launch({
  headless: true,
  channel: 'msedge',
  // Browser-fulfilled build files lack the loopback address classification of
  // a network response. This flag is confined to the isolated artifact test.
  args: built ? ['--disable-features=LocalNetworkAccessChecks'] : [],
})
const checks = []
const failures = []
const httpErrors = []
const types = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

async function openContext(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options })
  if (built)
    await context.route('http://127.0.0.1:3000/**', async (route) => {
      const pathname = decodeURIComponent(new URL(route.request().url()).pathname)
      const file = resolve(dist, pathname === '/' ? 'index.html' : `.${pathname}`)
      if (!file.startsWith(dist + sep)) return route.abort()
      try {
        if ((await stat(file)).isFile())
          return route.fulfill({
            body: await readFile(file),
            contentType: types[extname(file)] || 'application/octet-stream',
          })
      } catch {
        /* Leave non-artifact URLs to the existing website. */
      }
      return route.continue()
    })
  return context
}

async function loginPage(context) {
  const page = await context.newPage()
  page.on('pageerror', (error) => failures.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400)
      httpErrors.push({ url: response.url(), status: response.status() })
  })
  page.on('console', (message) => {
    if (message.type() === 'error') process.stderr.write(`browser console: ${message.text()}\n`)
  })
  page.on('requestfailed', (request) =>
    process.stderr.write(`request failed: ${request.url()} ${request.failure()?.errorText}\n`),
  )
  await page.goto('http://127.0.0.1:3000/#/pages/login/index')
  await page.waitForLoadState('networkidle')
  await page.locator('.art-login').waitFor()
  return page
}

try {
  const context = await openContext()
  const page = await loginPage(context)
  await page.screenshot({
    path: resolve(output, before ? 'desktop-before.png' : 'desktop-1440x900.png'),
  })
  await page.getByRole('button', { name: '以游客身份浏览', exact: true }).click()
  await page.waitForTimeout(350)
  if (!before && !page.url().includes('/pages/index/index'))
    process.stdout.write(`guest click: ${(await page.locator('body').innerText()).slice(-350)}\n`)
  await page.getByRole('button', { name: '账户菜单', exact: true }).waitFor({ timeout: 10000 })
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: '账户菜单', exact: true }).click()
  await page.getByRole('button', { name: '登录或注册', exact: true }).click()
  if (before) {
    await page.waitForTimeout(350)
    assert.ok(!page.url().includes('/pages/login/index'))
    assert.ok((await page.locator('body').innerText()).includes('功能暂未开放'))
    checks.push('Reproduced: guest login/register incorrectly blocked as unavailable')
    await page.screenshot({ path: resolve(output, 'guest-login-before.png') })
  } else {
    await page.locator('.art-login').waitFor()
    assert.ok(page.url().includes('/pages/login/index'))
    checks.push('Real API: login -> guest home -> account menu -> login/register returns to login')
    await page.waitForLoadState('networkidle')
    assert.equal(await page.locator('#xq-cursor-morph').count(), 1)
    assert.equal(await page.locator('#xq-cursor-loading').count(), 1)
    await page.mouse.move(300, 440)
    assert.equal(
      await page.evaluate(() =>
        document.elementFromPoint(300, 440)?.getAttribute('data-xq-cursor'),
      ),
      'football',
    )
    await page.waitForTimeout(350)
    await page.mouse.move(1100, 820)
    await page.waitForTimeout(60)
    assert.equal(
      await page.locator('#xq-cursor-morph').evaluate((e) => getComputedStyle(e).display),
      'block',
    )
    await page.screenshot({ path: resolve(output, 'login-football-morph.png') })
    for (let index = 0; index < 8; index++) await page.mouse.move(index % 2 ? 1100 : 300, 820)
    await page.waitForTimeout(350)
    assert.equal(
      await page.locator('html').evaluate((e) => e.classList.contains('xq-cursor-morphing')),
      false,
    )
    checks.push(
      'Original login football and divider morph restored; rapid reversal settles visibly',
    )

    await page.evaluate(() => {
      const host = document.createElement('div')
      host.id = 'cursor-fixture'
      host.style.cssText =
        'position:fixed;left:20px;top:20px;width:640px;padding:16px;z-index:9999;background:#f7f7f0;display:flex;flex-wrap:wrap;gap:8px;font:13px/1.4 sans-serif'
      for (const [name, cursor] of Object.entries({
        default: 'default',
        hand: 'pointer',
        text: 'text',
        disabled: 'not-allowed',
        busy: 'wait',
        progress: 'progress',
        move: 'move',
        grab: 'grab',
        grabbing: 'grabbing',
        precision: 'crosshair',
        'resize-ew': 'ew-resize',
        'resize-ns': 'ns-resize',
        'resize-nwse': 'nwse-resize',
        'resize-nesw': 'nesw-resize',
        help: 'help',
        'zoom-in': 'zoom-in',
        'zoom-out': 'zoom-out',
      })) {
        const element = document.createElement('div')
        element.dataset.testCursor = name
        element.style.cssText = `cursor:${cursor};padding:8px;width:110px;height:36px;border:1px solid #b3c8ba;color:#173f35;font:13px/1.4 sans-serif;box-sizing:border-box;white-space:nowrap`
        element.textContent = name
        host.append(element)
      }
      document.body.append(host)
    })
    for (const name of [
      'default',
      'hand',
      'text',
      'disabled',
      'busy',
      'progress',
      'move',
      'grab',
      'grabbing',
      'precision',
      'resize-ew',
      'resize-ns',
      'resize-nwse',
      'resize-nesw',
      'help',
      'zoom-in',
      'zoom-out',
    ]) {
      const cell = page.locator(`[data-test-cursor="${name}"]`)
      await cell.hover()
      assert.equal(await cell.getAttribute('data-xq-cursor'), name)
      if (name === 'busy' || name === 'progress') {
        await page.waitForFunction(() =>
          document.documentElement.classList.contains('xq-cursor-loading'),
        )
        const first = await page
          .locator('.xq-loading-rotor')
          .evaluate((e) => getComputedStyle(e).transform)
        await page.waitForTimeout(100)
        const second = await page
          .locator('.xq-loading-rotor')
          .evaluate((e) => getComputedStyle(e).transform)
        assert.notEqual(first, second)
        assert.equal(
          await page
            .locator('#xq-cursor-loading')
            .evaluate((e) => getComputedStyle(e).pointerEvents),
          'none',
        )
        await page.screenshot({ path: resolve(output, `cursor-${name}.png`) })
      } else {
        assert.equal(
          await page.locator('html').evaluate((e) => e.classList.contains('xq-cursor-loading')),
          false,
        )
        const cursor = await cell.evaluate((e) => getComputedStyle(e).cursor)
        assert.ok(cursor.includes('url('), `${name} must use a visible native image cursor`)
        const url = cursor.match(/url\("?([^")]+)"?\)/)[1]
        assert.equal(
          await page.evaluate(
            (src) =>
              new Promise((done) => {
                const image = new Image()
                image.onload = () => done(image.naturalWidth > 0)
                image.onerror = () => done(false)
                image.src = src
              }),
            url,
          ),
          true,
        )
      }
    }
    checks.push(
      'All 18 cursor skins: visible native PNGs, semantic states, busy/progress rotation, pointer-transparent overlays',
    )

    const cell = page.locator('[data-test-cursor="hand"]')
    await cell.hover()
    await cell.evaluate((e) => e.setAttribute('aria-busy', 'true'))
    await page.waitForFunction(
      () =>
        document.querySelector('[data-test-cursor="hand"]').getAttribute('data-xq-cursor') ===
        'progress',
    )
    await cell.evaluate((e) => {
      e.removeAttribute('aria-busy')
      e.setAttribute('aria-disabled', 'true')
    })
    await page.waitForFunction(
      () =>
        document.querySelector('[data-test-cursor="hand"]').getAttribute('data-xq-cursor') ===
        'disabled',
    )
    await cell.evaluate((e) => e.removeAttribute('aria-disabled'))
    await page.waitForFunction(
      () =>
        document.querySelector('[data-test-cursor="hand"]').getAttribute('data-xq-cursor') ===
        'hand',
    )
    checks.push('Stationary pointer updates busy -> disabled -> available without mouse movement')
    await page.locator('[data-test-cursor="busy"]').hover()
    await page.locator('#cursor-fixture').evaluate((e) => e.remove())
    await page.waitForFunction(
      () => !document.documentElement.classList.contains('xq-cursor-loading'),
    )
    checks.push('Removing the hovered loading element restores a native cursor')

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.locator('.art-login__primary').evaluate((e) => e.setAttribute('aria-busy', 'true'))
    await page.locator('.art-login__primary').hover()
    assert.equal(
      await page.locator('.art-login__primary').getAttribute('data-xq-cursor'),
      'progress',
    )
    assert.equal(
      await page.locator('html').evaluate((e) => e.classList.contains('xq-cursor-loading')),
      false,
    )
    assert.match(
      await page.locator('.art-login__primary').evaluate((e) => getComputedStyle(e).cursor),
      /,\s*progress$/,
    )
    await page.locator('.art-login__primary').evaluate((e) => e.removeAttribute('aria-busy'))
    checks.push('Reduced motion retains visible static loading cursor')
    await page.emulateMedia({ reducedMotion: 'no-preference' })

    // A failed animated image must never leave cursor:none without a visible replacement.
    await page.locator('#xq-cursor-loading .xq-loading-rotor img').evaluate((e) => {
      e.src = 'data:image/png,invalid'
    })
    await page.locator('.art-login__primary').evaluate((e) => e.setAttribute('aria-busy', 'true'))
    await page.locator('.art-login__primary').hover()
    await page.waitForFunction(
      () => !document.documentElement.classList.contains('xq-cursor-loading'),
    )
    assert.equal(
      await page.locator('.art-login__primary').getAttribute('data-xq-cursor'),
      'progress',
    )
    assert.ok(
      (
        await page.locator('.art-login__primary').evaluate((e) => getComputedStyle(e).cursor)
      ).includes('url('),
    )
    await page.locator('.art-login__primary').evaluate((e) => e.removeAttribute('aria-busy'))
    checks.push('Failed animation image falls back to a visible native cursor')

    // Return-to-login remains reachable even if the configuration endpoint becomes unreadable.
    await page.getByRole('button', { name: '以游客身份浏览', exact: true }).click()
    await page.getByRole('button', { name: '账户菜单', exact: true }).waitFor()
    await page.route('**/api/product/config', (route) => route.abort())
    await page.getByRole('button', { name: '账户菜单', exact: true }).click()
    await page.getByRole('button', { name: '登录或注册', exact: true }).click()
    await page.locator('.art-login').waitFor()
    checks.push('Guest login entry remains reachable when product configuration is unavailable')

    const hidpi = await openContext({ deviceScaleFactor: 2 })
    const high = await loginPage(hidpi)
    await high.locator('.art-login__tab').first().hover()
    const hiCursor = await high
      .locator('.art-login__tab')
      .first()
      .evaluate((e) => getComputedStyle(e).cursor)
    assert.ok(hiCursor.includes('2dppx') || hiCursor.includes('2x'))
    await high.screenshot({ path: resolve(output, 'desktop-hidpi-2x.png') })
    checks.push('HiDPI browser resolves 1x/2x native cursor images')
    await hidpi.close()
  }
  await context.close()

  if (!before) {
    const mobile = await openContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    })
    const page = await mobile.newPage()
    await page.goto('http://127.0.0.1:3000/#/pages/login/index')
    await page.waitForLoadState('networkidle')
    assert.equal(
      await page.locator('html').evaluate((e) => e.classList.contains('xq-cursor-skin')),
      false,
    )
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    )
    await page.screenshot({ path: resolve(output, 'mobile-390x844.png') })
    checks.push('390x844 touch browser: custom cursor inactive; no horizontal overflow')
    await mobile.close()
  }
  assert.deepEqual(failures, [])
  await writeFile(
    resolve(output, before ? 'before-checks.json' : 'browser-checks.json'),
    JSON.stringify({ built, checks, pageErrors: failures, httpErrors }, null, 2),
  )
  process.stdout.write(JSON.stringify({ checks, pageErrors: failures, httpErrors }, null, 2) + '\n')
} catch (error) {
  for (const context of browser.contexts())
    for (const page of context.pages()) {
      await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {})
      process.stderr.write(
        JSON.stringify({
          url: page.url(),
          pageErrors: failures,
          body: (await page.locator('body').innerText()).slice(0, 1800),
        }) + '\n',
      )
    }
  throw error
} finally {
  await browser.close()
}
