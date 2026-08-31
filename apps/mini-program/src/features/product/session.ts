import Taro from '@tarojs/taro'

import type { AuthSession } from './product.types'

const SESSION_KEY = 'xiaoqiu.demo.session.v1'

export function readSession(): AuthSession | null {
  try {
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
  Taro.setStorageSync(SESSION_KEY, session)
}

export function clearSession(): void {
  Taro.removeStorageSync(SESSION_KEY)
}
