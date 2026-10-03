import Taro from '@tarojs/taro'
import { useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from 'react'

import { isAccountEntryRoute } from '../../features/product/account-access'
import { productRepository } from '../../features/product/product.repository'
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
  const [token, setToken] = useState(() => readSession()?.accessToken ?? null)
  const [attempt, setAttempt] = useState(0)
  const [verification, setVerification] = useState<Verification>({ token: null, state: 'checking' })
  const routesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const synchronizeRoute = () => {
      setEntry(atAccountEntry())
      setToken(readSession()?.accessToken ?? null)
    }
    window.addEventListener('hashchange', synchronizeRoute)
    window.addEventListener('popstate', synchronizeRoute)
    const synchronizeTaroRoute = (event: { toLocation?: { path?: string } }) => {
      const route = event.toLocation?.path
      if (route) setEntry(isAccountEntryRoute(route))
      else synchronizeRoute()
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
    if (entry || token) return
    void Taro.reLaunch({ url: '/pages/login/index' }).catch(() => {
      window.location.hash = '#/pages/login/index'
    })
  }, [entry, token])

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
  const accessible = entry || verified

  useEffect(() => {
    routesRef.current?.toggleAttribute('inert', !accessible)
  }, [accessible])

  const error = token && verification.token === token && verification.state === 'error'
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
      {!accessible ? (
        <main className="account-boundary" aria-busy={!error}>
          <section className="account-boundary__panel" role={error ? 'alert' : 'status'}>
            <div className="account-boundary__brand">晓球</div>
            <h1 className="account-boundary__title">
              {error ? '暂时无法验证账号' : token ? '正在验证登录状态…' : '请先登录账号'}
            </h1>
            <p className="account-boundary__message">
              {error
                ? verification.message
                : token
                  ? '连接晓球 API 后进入球队与赛事。'
                  : '当前仅向已登录账号开放，正在返回登录页。'}
            </p>
            {error ? (
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
                  onClick={() => clearSession()}
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
