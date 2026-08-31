import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { ProductSection, UserAvatar } from '../../components/product-ui'
import {
  positionLabel,
  roleLabel,
  verificationLabel,
} from '../../features/product/product.format'
import { productRepository } from '../../features/product/product.repository'
import { clearSession, readSession } from '../../features/product/session'
import type { AuthUser, HomeResponse } from '../../features/product/product.types'

import './index.scss'

const DEMO_PASSWORD = 'Xiaoqiu2026!'
const demoAccounts = [
  { username: 'student', label: '普通学生', name: '林知夏', note: '浏览、关注与社区互动' },
  { username: 'player', label: '认证球员', name: '高星野', note: '完整球员档案' },
  { username: 'captain', label: '球队队长', name: '郑明澈', note: '球员与队长权限' },
  { username: 'reporter', label: '比赛信息员', name: '沈嘉言', note: '比赛数据录入入口' },
  { username: 'admin', label: '赛事管理员', name: '赛事管理员', note: '赛事管理入口' },
] as const

type PageState =
  | { phase: 'loading' }
  | { phase: 'ready'; home: HomeResponse; user: AuthUser | null }
  | { phase: 'failed'; message: string }

export default function MePage() {
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const [username, setUsername] = useState('student')
  const [password, setPassword] = useState(DEMO_PASSWORD)
  const [loggingIn, setLoggingIn] = useState(false)

  const load = useCallback(async () => {
    setState({ phase: 'loading' })
    try {
      const home = await productRepository.getHome()
      let user: AuthUser | null = readSession()?.user ?? null
      if (user) {
        try {
          user = await productRepository.getMe()
        } catch {
          clearSession()
          user = null
        }
      }
      setState({ phase: 'ready', home, user })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '账户页面加载失败。',
      })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const login = async () => {
    if (!username.trim() || !password || loggingIn || state.phase !== 'ready') return
    setLoggingIn(true)
    try {
      const session = await productRepository.login(username, password)
      setState({ ...state, user: session.user })
      await Taro.showToast({ title: '登录成功', icon: 'success' })
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '登录失败',
        icon: 'none',
      })
    } finally {
      setLoggingIn(false)
    }
  }

  const logout = async () => {
    await productRepository.logout()
    if (state.phase === 'ready') setState({ ...state, user: null })
    setUsername('student')
    setPassword(DEMO_PASSWORD)
    await Taro.showToast({ title: '已退出', icon: 'success' })
  }

  const tournamentId = state.phase === 'ready' ? state.home.tournament.id : undefined
  return (
    <PublicShell active="me" tournamentId={tournamentId}>
      {state.phase === 'loading' && <DataState kind="loading" title="正在读取账户" />}
      {state.phase === 'failed' && (
        <DataState kind="error" title="账户页面不可用" description={state.message} onRetry={() => void load()} />
      )}
      {state.phase === 'ready' && !state.user && (
        <LoginPanel
          loggingIn={loggingIn}
          password={password}
          username={username}
          onLogin={() => void login()}
          onPasswordChange={setPassword}
          onSelectAccount={(value) => {
            setUsername(value)
            setPassword(DEMO_PASSWORD)
          }}
          onUsernameChange={setUsername}
        />
      )}
      {state.phase === 'ready' && state.user && (
        <ProfilePanel
          tournamentId={state.home.tournament.id}
          user={state.user}
          onLogout={() => void logout()}
        />
      )}
    </PublicShell>
  )
}

function LoginPanel({
  loggingIn,
  password,
  username,
  onLogin,
  onPasswordChange,
  onSelectAccount,
  onUsernameChange,
}: {
  loggingIn: boolean
  password: string
  username: string
  onLogin: () => void
  onPasswordChange: (value: string) => void
  onSelectAccount: (username: string) => void
  onUsernameChange: (value: string) => void
}) {
  return (
    <View className="login-layout">
      <View className="login-copy">
        <Text className="login-copy__eyebrow">XIAOQIU ACCOUNT</Text>
        <Text className="login-copy__title">进入你的校园足球身份</Text>
        <Text className="login-copy__body">选择演示账户，体验不同角色下的主队、球员和赛事功能。</Text>
        <View className="demo-password">
          <Text>所有演示账户密码</Text>
          <Text>{DEMO_PASSWORD}</Text>
        </View>
      </View>

      <View className="login-form">
        <Text className="login-form__title">账户登录</Text>
        <Text className="login-form__label">用户名</Text>
        <Input
          className="login-form__input"
          value={username}
          onInput={(event) => onUsernameChange(event.detail.value)}
        />
        <Text className="login-form__label">密码</Text>
        <Input
          className="login-form__input"
          password
          value={password}
          onInput={(event) => onPasswordChange(event.detail.value)}
        />
        <Button
          className="button button--primary login-form__submit"
          disabled={!username.trim() || !password || loggingIn}
          loading={loggingIn}
          onClick={onLogin}
        >
          登录
        </Button>
      </View>

      <View className="demo-account-section">
        <ProductSection kicker="DEMO IDENTITIES" title="选择体验身份" note="一键填入" />
        <View className="demo-account-grid">
          {demoAccounts.map((account) => (
            <Button
              className={'demo-account ' + (username === account.username ? 'demo-account--active' : '')}
              key={account.username}
              onClick={() => onSelectAccount(account.username)}
            >
              <Text className="demo-account__role">{account.label}</Text>
              <Text className="demo-account__name">{account.name}</Text>
              <Text className="demo-account__username">@{account.username}</Text>
              <Text className="demo-account__note">{account.note}</Text>
            </Button>
          ))}
        </View>
      </View>
    </View>
  )
}

function ProfilePanel({
  tournamentId,
  user,
  onLogout,
}: {
  tournamentId: string
  user: AuthUser
  onLogout: () => void
}) {
  const roleNames = user.roles.map((item) => roleLabel(item.role))
  const isReporter = user.roles.some((item) => item.role === 'MATCH_REPORTER')
  const isAdmin = user.roles.some((item) => ['TOURNAMENT_ADMIN', 'ORGANIZATION_ADMIN'].includes(item.role))
  return (
    <View>
      <View className="profile-header">
        <UserAvatar name={user.displayName} size="large" />
        <View className="profile-header__copy">
          <View className="profile-header__name-row">
            <Text className="profile-header__name">{user.displayName}</Text>
            <Text className="profile-header__verified">{verificationLabel(user.verificationLevel)}</Text>
          </View>
          <Text className="profile-header__username">@{user.username}</Text>
          <Text className="profile-header__bio">{user.bio ?? '这位用户暂时没有填写简介。'}</Text>
          <View className="profile-header__roles">
            {(roleNames.length > 0 ? roleNames : ['普通用户']).map((role) => <Text key={role}>{role}</Text>)}
          </View>
        </View>
        <Button className="profile-header__logout" onClick={onLogout}>退出登录</Button>
      </View>

      {user.linkedPlayer && (
        <View
          className="linked-player"
          onClick={() => void Taro.navigateTo({ url: '/pages/player-detail/index?playerId=' + encodeURIComponent(user.linkedPlayer!.id) + '&tournamentId=' + encodeURIComponent(tournamentId) })}
        >
          <View>
            <Text className="linked-player__eyebrow">已认领球员</Text>
            <Text className="linked-player__name">{user.linkedPlayer.displayName}</Text>
            <Text className="linked-player__position">{positionLabel(user.linkedPlayer.position)}</Text>
          </View>
          <Text className="linked-player__open">查看完整档案</Text>
        </View>
      )}

      <View className="profile-section">
        <ProductSection kicker="ACCOUNT" title="个人服务" />
        <View className="service-grid">
          <ServiceItem title="我的主队" note="战绩、赛程与阵容" action={() => void Taro.reLaunch({ url: '/pages/my-team/index?tournamentId=' + encodeURIComponent(tournamentId) })} />
          <ServiceItem
            title={user.linkedPlayer ? '球员档案' : '认领球员'}
            note={user.linkedPlayer ? '数据与出场记录' : '关联校园球员身份'}
            action={() => user.linkedPlayer
              ? void Taro.navigateTo({ url: '/pages/player-detail/index?playerId=' + encodeURIComponent(user.linkedPlayer!.id) + '&tournamentId=' + encodeURIComponent(tournamentId) })
              : void showUnavailable('该演示身份暂无待认领球员')}
          />
          <ServiceItem title="加入球队" note="查看球队与关注关系" action={() => void Taro.reLaunch({ url: '/pages/my-team/index?tournamentId=' + encodeURIComponent(tournamentId) })} />
          <ServiceItem title="意见反馈" note="向赛事组提交建议" action={() => void showUnavailable('反馈工单将在下一版本接入')} />
        </View>
      </View>

      {(isReporter || isAdmin) && (
        <View className="profile-section">
          <ProductSection kicker="WORKSPACE" title="赛事工作台" note="按权限显示" />
          <View className="workspace-list surface">
            {isReporter && (
              <View className="workspace-item" onClick={() => void Taro.navigateTo({ url: '/pages/quick-report/index' })}>
                <Text>快速比赛报告</Text><Text>录入比分与比赛事件</Text><Text>进入</Text>
              </View>
            )}
            {isAdmin && (
              <View className="workspace-item" onClick={() => void showUnavailable('赛事后台请在桌面管理端打开')}>
                <Text>赛事管理</Text><Text>赛程、名单与数据修正</Text><Text>管理端</Text>
              </View>
            )}
          </View>
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

async function showUnavailable(message: string) {
  await Taro.showToast({ title: message, icon: 'none', duration: 2200 })
}
