import Taro from '@tarojs/taro'
import { useEffect, type PropsWithChildren } from 'react'

import { mountCursorSkin } from './components/auth-cursor'
import { AccountBoundary } from './components/account-boundary'
import { readSession, subscribeToExternalSessionChanges } from './features/product/session'
import { PostOverlayHost } from './components/post-overlay'
import { TeamOverlayHost } from './components/team-hub'
import { PlayerOverlayHost } from './components/player-overlay'
import { MessagingOverlayHost } from './components/messaging-drawer/host'

import './app.scss'
import './app-box-sizing'

export default function App({ children }: PropsWithChildren) {
  useEffect(() => mountCursorSkin(), [])

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
    <AccountBoundary>
      {children}
      <PostOverlayHost />
      <TeamOverlayHost />
      <PlayerOverlayHost />
      <MessagingOverlayHost />
    </AccountBoundary>
  )
}
