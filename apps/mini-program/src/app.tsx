import Taro from '@tarojs/taro'
import { useEffect, type PropsWithChildren } from 'react'

import { mountCursorSkin } from './components/auth-cursor'
import { mountSoftFocus } from './components/public-shell/focus-style'
import { AccountBoundary } from './components/account-boundary'
import { readSession, subscribeToExternalSessionChanges } from './features/product/session'
import { AppOverlays } from './components/app-overlays'

import './app.scss'
import './app-box-sizing'
import './components/viewport-page'

export default function App({ children }: PropsWithChildren) {
  useEffect(() => mountCursorSkin(), [])
  useEffect(() => mountSoftFocus(), [])

  useEffect(
    () =>
      subscribeToExternalSessionChanges(() => {
        void Taro.reLaunch({
          url: readSession() ? '/pages/index/index' : '/pages/login/index',
        }).catch(() => {
          void Taro.showToast({ title: '登录状态已变化，请刷新页面', icon: 'none' })
        })
      }),
    [],
  )

  return (
    <AccountBoundary
      overlays={<AppOverlays />}
    >
      {children}
    </AccountBoundary>
  )
}
