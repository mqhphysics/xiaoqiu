import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { ProductSection, UserAvatar } from '../../components/product-ui'
import { positionLabel, roleLabel, verificationLabel } from '../../features/product/product.format'
import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import type { AdminIdentity, AuthUser, HomeResponse } from '../../features/product/product.types'

import './index.scss'

type PageState =
  | { phase: 'loading' }
  | { phase: 'ready'; home: HomeResponse; user: AuthUser }
  | { phase: 'failed'; message: string }

export default function MePage() {
  const [state, setState] = useState<PageState>({ phase: 'loading' })

  const load = useCallback(async () => {
    setState({ phase: 'loading' })
    try {
      if (!readSession()) {
        await Taro.reLaunch({ url: '/pages/login/index' })
        return
      }
      const [home, user] = await Promise.all([
        productRepository.getHome(),
        productRepository.getMe(),
      ])
      setState({ phase: 'ready', home, user })
    } catch (error) {
      if (!readSession()) {
        await Taro.reLaunch({ url: '/pages/login/index' })
        return
      }
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '账户页面加载失败。',
      })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const tournamentId = state.phase === 'ready' ? state.home.tournament.id : undefined
  return (
    <PublicShell active="me" tournamentId={tournamentId}>
      {state.phase === 'loading' && <DataState kind="loading" title="正在读取账户" />}
      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="账户页面不可用"
          description={state.message}
          onRetry={() => void load()}
        />
      )}
      {state.phase === 'ready' && (
        <ProfilePanel tournamentId={state.home.tournament.id} user={state.user} />
      )}
    </PublicShell>
  )
}

function ProfilePanel({ tournamentId, user }: { tournamentId: string; user: AuthUser }) {
  const [loggingOut, setLoggingOut] = useState(false)
  const roleNames = user.roles.map((item) => roleLabel(item.role))
  const isReporter = user.roles.some((item) => item.role === 'MATCH_REPORTER')
  const isOrganizationAdmin = user.roles.some((item) => item.role === 'ORGANIZATION_ADMIN')

  const logout = async () => {
    if (loggingOut) return
    const confirmation = await Taro.showModal({
      title: '退出登录',
      content: '退出后仍可使用游客模式浏览公开赛事数据。',
      confirmText: '退出',
    })
    if (!confirmation.confirm) return
    setLoggingOut(true)
    try {
      await productRepository.logout()
      await Taro.reLaunch({ url: '/pages/login/index' })
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '退出失败',
        icon: 'none',
      })
      setLoggingOut(false)
    }
  }

  return (
    <View>
      <View className="profile-header">
        <View className="profile-header__main">
          <UserAvatar name={user.displayName} size="large" />
          <View className="profile-header__copy">
            <Text className="profile-header__eyebrow">ACCOUNT PROFILE</Text>
            <View className="profile-header__name-row">
              <Text className="profile-header__name">{user.displayName}</Text>
              <Text className="profile-header__verified">
                {verificationLabel(user.verificationLevel)}
              </Text>
            </View>
            <Text className="profile-header__username">@{user.username}</Text>
            <Text className="profile-header__bio">{user.bio ?? '这位用户暂时没有填写简介。'}</Text>
            <View className="profile-header__roles">
              {(roleNames.length > 0 ? roleNames : ['普通用户']).map((role) => (
                <Text key={role}>{role}</Text>
              ))}
            </View>
          </View>
        </View>
        <Button
          className="profile-header__logout"
          disabled={loggingOut}
          loading={loggingOut}
          onClick={() => void logout()}
        >
          退出登录
        </Button>
      </View>

      <View className="identity-summary__heading">
        <Text>仅本人可见的账户信息</Text>
        <Text>实名资料不会出现在公开球队与社区页面</Text>
      </View>
      <View className="identity-summary">
        <View>
          <Text className="identity-summary__label">真实姓名</Text>
          <Text className="identity-summary__value">{user.realName ?? '未登记'}</Text>
        </View>
        <View>
          <Text className="identity-summary__label">学号</Text>
          <Text className="identity-summary__value identity-summary__value--mono">
            {user.studentId ?? '未登记'}
          </Text>
        </View>
        <View>
          <Text className="identity-summary__label">绑定邮箱</Text>
          <Text className="identity-summary__value">{user.email ?? '未绑定'}</Text>
        </View>
      </View>

      {user.linkedPlayer && (
        <View
          className="linked-player"
          onClick={() =>
            void Taro.navigateTo({
              url:
                '/pages/player-detail/index?playerId=' +
                encodeURIComponent(user.linkedPlayer!.id) +
                '&tournamentId=' +
                encodeURIComponent(tournamentId),
            })
          }
        >
          <View>
            <Text className="linked-player__eyebrow">已认领球员</Text>
            <Text className="linked-player__name">{user.linkedPlayer.displayName}</Text>
            <Text className="linked-player__position">
              {positionLabel(user.linkedPlayer.position)}
            </Text>
          </View>
          <Text className="linked-player__open">查看完整档案</Text>
        </View>
      )}

      <View className="profile-section">
        <ProductSection kicker="ACCOUNT" title="个人服务" />
        <View className="service-grid">
          <ServiceItem
            title="我的主队"
            note="战绩、赛程与阵容"
            action={() =>
              void Taro.reLaunch({
                url: '/pages/my-team/index?tournamentId=' + encodeURIComponent(tournamentId),
              })
            }
          />
          {user.linkedPlayer && (
            <ServiceItem
              title="球员档案"
              note="数据与出场记录"
              action={() =>
                void Taro.navigateTo({
                  url:
                    '/pages/player-detail/index?playerId=' +
                    encodeURIComponent(user.linkedPlayer!.id) +
                    '&tournamentId=' +
                    encodeURIComponent(tournamentId),
                })
              }
            />
          )}
        </View>
      </View>

      {isReporter && (
        <View className="profile-section">
          <ProductSection kicker="WORKSPACE" title="赛事工作台" note="按权限显示" />
          <View className="workspace-list surface">
            <View
              className="workspace-item"
              onClick={() => void Taro.navigateTo({ url: '/pages/quick-report/index' })}
            >
              <Text>快速比赛报告</Text>
              <Text>录入比分与比赛事件</Text>
              <Text>进入</Text>
            </View>
          </View>
        </View>
      )}

      {isOrganizationAdmin && <AdminIdentityDirectory />}
    </View>
  )
}

function AdminIdentityDirectory() {
  const [state, setState] = useState<
    | { phase: 'loading' }
    | { phase: 'ready'; identities: AdminIdentity[] }
    | { phase: 'failed'; message: string }
  >({ phase: 'loading' })

  const load = useCallback(async () => {
    setState({ phase: 'loading' })
    try {
      setState({ phase: 'ready', identities: await productRepository.getAdminIdentities() })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '实名目录加载失败',
      })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <View className="profile-section">
      <ProductSection kicker="IDENTITY ADMIN" title="实名账号目录" note="组织管理员" />
      {state.phase === 'loading' && <DataState kind="loading" title="正在读取实名目录" />}
      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="实名目录不可用"
          description={state.message}
          onRetry={() => void load()}
        />
      )}
      {state.phase === 'ready' && (
        <View className="identity-directory">
          {state.identities.map((identity) => (
            <View className="identity-card" key={identity.id}>
              <View className="identity-card__heading">
                <View>
                  <Text className="identity-card__nickname">{identity.displayName}</Text>
                  <Text className="identity-card__username">@{identity.username}</Text>
                </View>
                <Text className="identity-card__verification">
                  {verificationLabel(identity.verificationLevel)}
                </Text>
              </View>
              <View className="identity-card__details">
                <Text>实名 {identity.realName ?? '未登记'}</Text>
                <Text>学号 {identity.studentId ?? '未登记'}</Text>
                <Text>邮箱 {identity.email ?? '未绑定'}</Text>
              </View>
              <View className="identity-card__roles">
                {(identity.roles.length > 0 ? identity.roles.map(roleLabel) : ['普通用户']).map(
                  (role) => (
                    <Text key={role}>{role}</Text>
                  ),
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

function ServiceItem({ title, note, action }: { title: string; note: string; action: () => void }) {
  return (
    <View className="service-item" onClick={action}>
      <Text className="service-item__title">{title}</Text>
      <Text className="service-item__note">{note}</Text>
      <Text className="service-item__open">进入</Text>
    </View>
  )
}
