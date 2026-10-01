import type { AdminCredential, AdminSessionState, AdminUser } from './types'

export const ADMIN_SESSION_KEY = 'xiaoqiu:admin-session:v1'
type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function validCredential(value: unknown): value is AdminCredential {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AdminCredential>
  return (
    typeof candidate.accessToken === 'string' &&
    /^[A-Za-z0-9_-]{32,256}$/.test(candidate.accessToken) &&
    typeof candidate.expiresAt === 'string' &&
    Number.isFinite(Date.parse(candidate.expiresAt)) &&
    Date.parse(candidate.expiresAt) > Date.now()
  )
}

export function createAdminSessionStore(storage?: SessionStorage) {
  let state: AdminSessionState = { credential: null, user: null, message: '' }
  let revision = 0
  const listeners = new Set<() => void>()
  try {
    const raw = storage?.getItem(ADMIN_SESSION_KEY)
    const stored: unknown = raw ? JSON.parse(raw) : null
    if (validCredential(stored))
      state = {
        ...state,
        credential: { accessToken: stored.accessToken, expiresAt: stored.expiresAt },
      }
    else storage?.removeItem(ADMIN_SESSION_KEY)
  } catch {
    /* A blocked/corrupt storage never authorizes a user. */
  }
  const emit = () => {
    revision += 1
    listeners.forEach((listener) => listener())
  }
  return {
    getSnapshot: () => state,
    getRevision: () => revision,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    start(credential: AdminCredential) {
      if (!validCredential(credential)) throw new Error('登录有效期无效，请重新登录。')
      const minimal = { accessToken: credential.accessToken, expiresAt: credential.expiresAt }
      state = { credential: minimal, user: null, message: '' }
      try {
        storage?.setItem(ADMIN_SESSION_KEY, JSON.stringify(minimal))
      } catch {
        /* In-memory session still works. */
      }
      emit()
    },
    verify(accessToken: string, user: AdminUser): boolean {
      if (state.credential?.accessToken !== accessToken || !validCredential(state.credential))
        return false
      if (JSON.stringify(state.user) === JSON.stringify(user)) return true
      state = { ...state, user, message: '' }
      emit()
      return true
    },
    clear(accessToken: string, message = '登录状态已失效，请重新登录。'): boolean {
      if (state.credential?.accessToken !== accessToken) return false
      state = { credential: null, user: null, message }
      try {
        storage?.removeItem(ADMIN_SESSION_KEY)
      } catch {
        /* The next boot revalidates any residual credential. */
      }
      emit()
      return true
    },
    notifySignedOut(message: string) {
      if (state.credential) return
      state = { ...state, message }
      emit()
    },
  }
}

function browserStorage(): SessionStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage
  } catch {
    return undefined
  }
}

export const adminSession = createAdminSessionStore(browserStorage())
