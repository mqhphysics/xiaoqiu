import Taro from '@tarojs/taro'
import { IdentityCenterHost } from '../identity-center/index.h5'
import { useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from 'react'

import { isAccountEntryRoute } from '../../features/product/account-access'
import { productRepository } from '../../features/product/product.repository'
import { guestPageAllowed } from '../../features/product-config/access-boundary.logic'
import {
  clearAccountByUser,
  readAccountPresence,
} from '../../features/product-config/policy-state.h5'
import { useProductConfiguration } from '../../features/product-config/use-product-config.h5'
import {
  clearSession,
  readSession,
  saveSession,
  subscribeToSessionChanges,
} from '../../features/product/session.h5'

import './index.h5.scss'

type Verification =
  | { token: string | null; state: 'checking' | 'ready' }
  | { token: string; state: 'error'; message: string }

function atAccountEntry() {
  return isAccountEntryRoute(window.location.hash || window.location.pathname)
}

/** Taro needs stable page instances; their UI stays hidden until account verification. */
export function AccountBoundary({
  children,
  overlays,
}: PropsWithChildren<{ overlays?: ReactNode }>) {
  const [entry, setEntry] = useState(atAccountEntry)
  const [token, setToken] = useState(() => readAccountPresence().session?.accessToken ?? null)
  const { configuration, phase, error: configurationError } = useProductConfiguration()
  const [route, setRoute] = useState(() => window.location.hash || window.location.pathname)
  const [attempt, setAttempt] = useState(0)
  const [verification, setVerification] = useState<Verification>({ token: null, state: 'checking' })
  const routesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const synchronizeRoute = () => {
      setEntry(atAccountEntry())
      setRoute(window.location.hash || window.location.pathname)
      setToken(readSession()?.accessToken ?? null)
    }
    window.addEventListener('hashchange', synchronizeRoute)
    window.addEventListener('popstate', synchronizeRoute)
    const synchronizeTaroRoute = (event: { toLocation?: { path?: string } }) => {
      const route = event.toLocation?.path
      if (route) {
        setEntry(isAccountEntryRoute(route))
        setRoute(route)
      } else synchronizeRoute()
      setToken(readSession()?.accessToken ?? null)
    }
    // Taro's history.replace/push do not emit native hashchange/popstate.
    Taro.eventCenter.on('__taroRouterChange', synchronizeTaroRoute)
    Taro.eventCenter.on('__afterTaroRouterChange', synchronizeTaroRoute)
    const unsubscribe = subscribeToSessionChanges(() => {
      setToken(readSession()?.accessToken ?? null)
    })
    return () => {
      window.removeEventListener('hashchange', synchronizeRoute)
      window.removeEventListener('popstate', synchronizeRoute)
      Taro.eventCenter.off('__taroRouterChange', synchronizeTaroRoute)
      Taro.eventCenter.off('__afterTaroRouterChange', synchronizeTaroRoute)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const account = readAccountPresence()
    if (
      entry ||
      token ||
      account.needsAccount ||
      phase === 'unknown' ||
      phase === 'loading' ||
      guestPageAllowed(route, configuration, account)
    )
      return
    void Taro.reLaunch({ url: '/pages/login/index' }).catch(() => {
      window.location.hash = '#/pages/login/index'
    })
  }, [entry, token, route, configuration, phase])

  useEffect(() => {
    const recheck = () => {
      if (readAccountPresence().session) setAttempt((value) => value + 1)
    }
    window.addEventListener('focus', recheck)
    return () => window.removeEventListener('focus', recheck)
  }, [])

  useEffect(() => {
    if (!token) return
    let disposed = false
    setVerification({ token, state: 'checking' })
    const session = readSession()
    const expiryTimer = window.setTimeout(
      () => clearSession(),
      Math.min(Math.max(0, Date.parse(session?.expiresAt ?? '') - Date.now()), 2_147_483_647),
    )
    void productRepository
      .getMe()
      .then((user) => {
        if (disposed || readSession()?.accessToken !== token) return
        const current = readSession()
        if (!current) return
        saveSession({ ...current, user })
        setVerification({ token, state: 'ready' })
      })
      .catch((error: unknown) => {
        if (disposed || readSession()?.accessToken !== token) return
        setVerification({
          token,
          state: 'error',
          message: error instanceof Error ? error.message : '无法验证账号，请检查 API 连接后重试。',
        })
      })
    return () => {
      disposed = true
      window.clearTimeout(expiryTimer)
    }
  }, [token, attempt])

  const verified = Boolean(token && verification.token === token && verification.state === 'ready')
  const account = readAccountPresence()
  const accessible = entry || verified || guestPageAllowed(route, configuration, account)

  useEffect(() => {
    routesRef.current?.toggleAttribute('inert', !accessible)
  }, [accessible])

  const error = token && verification.token === token && verification.state === 'error'
  const expiredAccount = !token && account.needsAccount
  return (
    <>
      <div
        ref={routesRef}
        className="account-boundary__routes"
        style={{ display: accessible ? 'contents' : 'none' }}
        aria-hidden={!accessible}
      >
        {children}
      </div>
      {verified ? overlays : null}
      {verified && !entry ? <IdentityCenterHost /> : null}
      {!accessible ? (
        <main className="account-boundary" aria-busy={!error && !expiredAccount}>
          <section
            className="account-boundary__panel"
            role={error || expiredAccount ? 'alert' : 'status'}
          >
            <div className="account-boundary__brand">晓球</div>
            <h1 className="account-boundary__title">
              {expiredAccount
                ? '登录状态已失效'
                : error
                  ? '暂时无法验证账号'
                  : token
                    ? '正在验证登录状态…'
                    : phase === 'loading' || phase === 'unknown'
                      ? '正在读取访问配置…'
                      : '请先登录账号'}
            </h1>
            <p className="account-boundary__message">
              {expiredAccount
                ? '请重新登录，或明确退出账号后选择已开放的浏览入口。'
                : error
                  ? verification.message
                  : token
                    ? '连接晓球 API 后进入球队与赛事。'
                    : (configurationError ?? '当前入口需要登录，正在返回登录页。')}
            </p>
            {error || expiredAccount ? (
              <div className="account-boundary__actions">
                <button
                  className="account-boundary__button"
                  type="button"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  重试连接
                </button>
                <button
                  className="account-boundary__button"
                  type="button"
                  onClick={() => {
                    clearAccountByUser()
                    void Taro.reLaunch({ url: '/pages/login/index' })
                  }}
                >
                  返回登录
                </button>
              </div>
            ) : null}
          </section>
        </main>
      ) : null}
    </>
  )
}
