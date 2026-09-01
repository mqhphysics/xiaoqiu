import Taro from '@tarojs/taro'

import type { AuthSession } from './product.types'

const SESSION_KEY = 'xiaoqiu.session.v1'
const GUEST_KEY = 'xiaoqiu.guest.v1'
const LEGACY_SESSION_KEY = 'xiaoqiu.demo.session.v1'

export function readSession(): AuthSession | null {
  try {
    Taro.removeStorageSync(LEGACY_SESSION_KEY)
    const value = Taro.getStorageSync<AuthSession | undefined>(SESSION_KEY)
    if (!value?.accessToken || new Date(value.expiresAt).getTime() <= Date.now()) {
      if (value) Taro.removeStorageSync(SESSION_KEY)
      return null
    }
    return value
  } catch {
    return null
  }
}
export function saveSession(session: AuthSession): void {
  Taro.removeStorageSync(GUEST_KEY)
  Taro.setStorageSync(SESSION_KEY, session)
}

export function clearSession(): void {
  Taro.removeStorageSync(SESSION_KEY)
}

export function enterGuestMode(): void {
  clearSession()
  Taro.setStorageSync(GUEST_KEY, true)
}

export function leaveGuestMode(): void {
  Taro.removeStorageSync(GUEST_KEY)
}

export function isGuestMode(): boolean {
  try {
    return Taro.getStorageSync<boolean | undefined>(GUEST_KEY) === true
  } catch {
    return false
  }
}
