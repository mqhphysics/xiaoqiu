import Taro from '@tarojs/taro'
import { clearSession, readSession } from '../product/session.h5'
import { ConfigurationCache, AccountRequirement } from './configuration-cache'
import { productConfigRepository } from './product-config.repository'

export const configurationCache = new ConfigurationCache(() =>
  productConfigRepository.getConfiguration(),
)
const accountRequirement = new AccountRequirement()

function storedAccountHint(): boolean {
  try {
    const value: unknown = Taro.getStorageSync('xiaoqiu.session.v1')
    return (
      typeof value === 'object' &&
      value !== null &&
      'accessToken' in value &&
      typeof value.accessToken === 'string' &&
      Boolean(value.accessToken)
    )
  } catch {
    return false
  }
}
// Capture account presence before legacy storage validation can remove an expired record.
accountRequirement.observe(storedAccountHint())

export function readAccountPresence() {
  accountRequirement.observe(storedAccountHint())
  const session = readSession()
  accountRequirement.observe(Boolean(session))
  return { session, hasSession: Boolean(session), needsAccount: accountRequirement.needsAccount() }
}

export function markAccountInvalid(): void {
  accountRequirement.observe(true)
  clearSession()
}

export function clearAccountByUser(): void {
  clearSession()
  accountRequirement.clearByUser()
  configurationCache.invalidate()
}

export function getConfiguration() {
  return configurationCache.refresh()
}

let hookUsers = 0
let expiryTimer: ReturnType<typeof setInterval> | undefined
const refresh = () => {
  configurationCache.invalidate()
  void configurationCache.refresh().catch(() => undefined)
}
const onVisibility = () => {
  if (document.visibilityState === 'visible') refresh()
}

export function startPolicyRefresh(): () => void {
  if (hookUsers++ === 0) {
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibility)
    expiryTimer = setInterval(() => {
      if (configurationCache.getSnapshot().phase === 'unknown')
        void configurationCache.refresh().catch(() => undefined)
    }, 5000)
  }
  void configurationCache.refresh().catch(() => undefined)
  return () => {
    if (--hookUsers !== 0) return
    window.removeEventListener('focus', refresh)
    document.removeEventListener('visibilitychange', onVisibility)
    clearInterval(expiryTimer)
    expiryTimer = undefined
  }
}
