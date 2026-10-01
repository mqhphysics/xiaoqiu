import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { FormEvent } from 'react'

import { AdminScheduleWorkspace } from '../adminSchedule/AdminScheduleWorkspace'
import type { OrganizationContext } from '../adminSchedule/types'
import { AdminApiError, currentAdminUser, loginAdmin, revokeAdminSession } from './request'
import { adminSession, validCredential } from './session'
import { adminKind, isUuid } from './types'
import type { AdminCredential } from './types'
import './admin-auth.css'

export function AdminUnavailable() {
  return (
    <main className="admin-auth-shell">
      <section className="admin-auth-panel panel" role="alert">
        <p className="eyebrow">XIAOQIU ADMIN</p>
        <h1>管理后台暂不可用</h1>
        <p>管理服务尚未配置，请联系部署管理员。</p>
      </section>
    </main>
  )
}

export function AdminAccess({ api }: { api: string }) {
  const state = useSyncExternalStore(adminSession.subscribe, adminSession.getSnapshot)
  const [validationError, setValidationError] = useState('')
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [pendingLogout, setPendingLogout] = useState<AdminCredential | null>(null)
  const [retryingLogout, setRetryingLogout] = useState(false)
  const pendingLogoutToken = useRef<string | null>(null)
  const validation = useRef<AbortController | null>(null)

  const verify = useCallback(async () => {
    const credential = adminSession.getSnapshot().credential
    if (!credential) return
    const token = credential.accessToken
    if (!validCredential(credential)) {
      adminSession.clear(token)
      return
    }
    validation.current?.abort()
    const controller = new AbortController()
    validation.current = controller
    setValidationError('')
    try {
      const user = await currentAdminUser(api, credential.accessToken, controller.signal)
      if (controller.signal.aborted) return
      if (!adminKind(user)) {
        // A successful ordinary login is still not a management session.
        await revokeAdminSession(api, credential.accessToken).catch(() => undefined)
        if (!controller.signal.aborted)
          adminSession.clear(
            credential.accessToken,
            '当前账号没有后台管理权限，请使用获授权的管理员账号。',
          )
        return
      }
      adminSession.verify(credential.accessToken, user)
    } catch (error: unknown) {
      if (
        controller.signal.aborted ||
        adminSession.getSnapshot().credential?.accessToken !== credential.accessToken
      )
        return
      if (error instanceof AdminApiError && (error.status === 401 || error.status === 403))
        adminSession.clear(credential.accessToken)
      else
        setValidationError(
          error instanceof AdminApiError
            ? error.message
            : '无法验证当前登录，请确认管理服务可用后重试。',
        )
    }
  }, [api])

  const accessToken = state.credential?.accessToken
  const expiresAt = state.credential?.expiresAt
  useEffect(() => {
    void verify()
    const onFocus = () => {
      void verify()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void verify()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      validation.current?.abort()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [verify, accessToken])

  useEffect(() => {
    if (!accessToken || !expiresAt) return
    const timer = window.setTimeout(
      () => adminSession.clear(accessToken),
      Math.min(2_147_483_647, Math.max(0, Date.parse(expiresAt) - Date.now())),
    )
    return () => window.clearTimeout(timer)
  }, [accessToken, expiresAt])

  const context = useMemo<OrganizationContext | null>(() => {
    const role = state.user ? adminKind(state.user) : null
    if (!state.user || !state.credential || !role) return null
    return {
      organizationId: state.user.organizationId,
      organizationName: '当前组织',
      userId: state.user.id,
      role,
      accessToken: state.credential.accessToken,
      canManageOrganization: role !== 'TOURNAMENT_ADMIN',
    }
  }, [state.user, state.credential])

  const logout = async () => {
    const credential = adminSession.getSnapshot().credential
    if (!credential) return
    validation.current?.abort()
    setIsLoggingOut(true)
    adminSession.clear(credential.accessToken, '已退出当前后台账号。')
    try {
      await revokeAdminSession(api, credential.accessToken)
    } catch {
      pendingLogoutToken.current = credential.accessToken
      setPendingLogout(credential)
      adminSession.notifySignedOut('本页面已退出，但服务器会话撤销暂未确认。请确认网络和服务状态。')
    } finally {
      setIsLoggingOut(false)
    }
  }

  const retryLogout = async () => {
    if (!pendingLogout || retryingLogout) return
    const credential = pendingLogout
    const revision = adminSession.getRevision()
    setRetryingLogout(true)
    try {
      await revokeAdminSession(api, credential.accessToken)
      if (pendingLogoutToken.current !== credential.accessToken) return
      pendingLogoutToken.current = null
      setPendingLogout(null)
      if (adminSession.getRevision() === revision)
        adminSession.notifySignedOut('服务器会话已撤销。')
    } catch {
      if (adminSession.getRevision() === revision)
        adminSession.notifySignedOut('服务器会话撤销仍未确认，可以再次重试。')
    } finally {
      setRetryingLogout(false)
    }
  }
  const logoutNotice = pendingLogout ? (
    <div className="admin-auth-status" role="status">
      上一会话的服务器撤销尚未确认。
      <button
        type="button"
        className="secondary-button"
        disabled={retryingLogout}
        onClick={() => {
          void retryLogout()
        }}
      >
        {retryingLogout ? '正在重试…' : '重试撤销会话'}
      </button>
    </div>
  ) : null

  if (isLoggingOut) return <SessionCheck message="正在退出当前账号…" />
  if (!state.credential)
    return (
      <>
        {logoutNotice}
        <AdminLogin api={api} message={state.message} />
      </>
    )
  if (!context)
    return (
      <SessionCheck
        message={validationError || '正在验证管理员身份…'}
        onRetry={
          validationError
            ? () => {
                void verify()
              }
            : undefined
        }
        onLogout={() => {
          void logout()
        }}
      />
    )
  return (
    <>
      {logoutNotice}
      {validationError ? (
        <div className="admin-auth-status" role="alert">
          {validationError}
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              void verify()
            }}
          >
            重试验证
          </button>
        </div>
      ) : null}
      <AdminScheduleWorkspace
        key={context.accessToken}
        context={context}
        displayName={state.user!.displayName}
        onLogout={() => {
          void logout()
        }}
      />
    </>
  )
}

function SessionCheck({
  message,
  onRetry,
  onLogout,
}: {
  message: string
  onRetry?: (() => void) | undefined
  onLogout?: () => void
}) {
  return (
    <main className="admin-auth-shell">
      <section className="admin-auth-panel panel" aria-live="polite">
        <p className="eyebrow">XIAOQIU ADMIN</p>
        <h1>管理员身份验证</h1>
        <p>{message}</p>
        <div className="admin-auth-actions">
          {onRetry ? (
            <button type="button" onClick={onRetry}>
              重试验证
            </button>
          ) : null}
          {onLogout ? (
            <button type="button" className="secondary-button" onClick={onLogout}>
              退出登录
            </button>
          ) : null}
        </div>
      </section>
    </main>
  )
}

function AdminLogin({ api, message }: { api: string; message: string }) {
  const [organizationId, setOrganizationId] = useState(
    import.meta.env.VITE_ORGANIZATION_ID?.trim() ?? '',
  )
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    if (!isUuid(organizationId.trim())) {
      setError('请输入管理员分配的有效组织编号。')
      return
    }
    setBusy(true)
    setError('')
    try {
      const credential = await loginAdmin(api, organizationId.trim(), username.trim(), password)
      if (!mounted.current) return
      setPassword('')
      adminSession.start(credential)
    } catch (caught: unknown) {
      if (mounted.current) {
        setPassword('')
        setError(caught instanceof Error ? caught.message : '无法连接管理服务，请稍后重试。')
      }
    } finally {
      if (mounted.current) setBusy(false)
    }
  }
  return (
    <main className="admin-auth-shell">
      <section className="admin-auth-panel panel">
        <p className="eyebrow">XIAOQIU ADMIN</p>
        <h1>管理后台登录</h1>
        <p>使用已获授权的账号管理赛事和名单。</p>
        <form
          className="admin-auth-form"
          onSubmit={(event) => {
            void submit(event)
          }}
        >
          <div className="field">
            <label htmlFor="admin-organization-id">
              <span>组织编号</span>
            </label>
            <input
              id="admin-organization-id"
              aria-describedby="admin-organization-hint"
              required
              name="organization"
              autoComplete="off"
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
              disabled={busy}
            />
            <small id="admin-organization-hint">由本组织管理员提供。</small>
          </div>
          <label className="field">
            <span>账号</span>
            <input
              required
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>密码</span>
            <input
              required
              type="password"
              name="password"
              autoComplete="current-password"
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
            />
          </label>
          {error || message ? (
            <p className="error-text" role="alert">
              {error || message}
            </p>
          ) : null}
          <button type="submit" disabled={busy}>
            {busy ? '正在登录…' : '登录管理后台'}
          </button>
        </form>
      </section>
    </main>
  )
}
