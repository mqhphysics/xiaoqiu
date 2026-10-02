import Taro from '@tarojs/taro'
import { useEffect, type PropsWithChildren } from 'react'

import { mountCursorSkin } from './components/auth-cursor'
import { readSession, subscribeToExternalSessionChanges } from './features/product/session'
import { PostOverlayHost } from './components/post-overlay'

import './app.scss'

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
    <>
      {children}
      <PostOverlayHost />
    </>
  )
}
