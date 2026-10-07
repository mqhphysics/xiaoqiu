import { useEffect } from 'react'

export interface BrowserPreferences {
  reduceMotion: boolean
  hideDecoration: boolean
  largeText: boolean
}
export const defaultPreferences: BrowserPreferences = {
  reduceMotion: false,
  hideDecoration: false,
  largeText: false,
}
const key = 'xiaoqiu.browser-preferences.v1'
const changed = 'xiaoqiu:preferences-changed'
export function readPreferences(): BrowserPreferences {
  try {
    const data = JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<BrowserPreferences>
    return {
      reduceMotion: data?.reduceMotion === true,
      hideDecoration: data?.hideDecoration === true,
      largeText: data?.largeText === true,
    }
  } catch {
    return { ...defaultPreferences }
  }
}
export function savePreferences(value: BrowserPreferences) {
  localStorage.setItem(key, JSON.stringify(value))
  window.dispatchEvent(new Event(changed))
}
export function useBrowserPreferences() {
  useEffect(() => {
    const media = window.matchMedia('(min-width: 721px)')
    const apply = () => {
      const value = readPreferences()
      document.documentElement.dataset.xqMotion =
        media.matches && value.reduceMotion ? 'reduce' : 'system'
      document.documentElement.dataset.xqDecoration =
        media.matches && value.hideDecoration ? 'hidden' : 'visible'
      document.documentElement.dataset.xqText =
        media.matches && value.largeText ? 'large' : 'standard'
    }
    apply()
    window.addEventListener(changed, apply)
    window.addEventListener('storage', apply)
    media.addEventListener('change', apply)
    return () => {
      window.removeEventListener(changed, apply)
      window.removeEventListener('storage', apply)
      media.removeEventListener('change', apply)
    }
  }, [])
}
