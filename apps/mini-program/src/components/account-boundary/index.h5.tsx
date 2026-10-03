import Taro from '@tarojs/taro'
import { useEffect, useState, type PropsWithChildren } from 'react'

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

/** No product page or overlay mounts until the server accepts the stored token. */
export function AccountBoundary({ children }: PropsWithChildren) {
  const [entry, setEntry] = useState(atAccountEntry)
  const [token, setToken] = useState(() => readSession()?.accessToken ?? null)
  const [attempt, setAttempt] = useState(0)
  const [verification, setVerification] = useState<Verification>({ token: null, state: 'checking' })

  useEffect(() => {
    const synchronizeRoute = () => {
      setEntry(atAccountEntry())
      setToken(readSession()?.accessToken ?? null)
    }
    window.addEventListener('hashchange', synchronizeRoute)
    window.addEventListener('popstate', synchronizeRoute)
    const unsubscribe = subscribeToSessionChanges(() => {
      setToken(readSession()?.accessToken ?? null)
    })
    return () => {
      window.removeEventListener('hashchange', synchronizeRoute)
      window.removeEventListener('popstate', synchronizeRoute)
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

  if (entry) return <>{children}</>
  if (token && verification.token === token && verification.state === 'ready')
    return <>{children}</>

  const error = token && verification.token === token && verification.state === 'error'
  return (
    <main className="account-boundary" aria-busy={!error}>
      <section className="account-boundary__panel" role={error ? 'alert' : 'status'}>
        <div className="account-boundary__brand">晓球</div>
        <h1>{error ? '暂时无法验证账号' : token ? '正在验证登录状态…' : '请先登录账号'}</h1>
        <p>
          {error
            ? verification.message
            : token
              ? '连接晓球 API 后进入球队与赛事。'
              : '当前仅向已登录账号开放，正在返回登录页。'}
        </p>
        {error ? (
          <div className="account-boundary__actions">
            <button type="button" onClick={() => setAttempt((value) => value + 1)}>
              重试连接
            </button>
            <button type="button" onClick={() => clearSession()}>
              返回登录
            </button>
          </div>
        ) : null}
      </section>
    </main>
  )
}
