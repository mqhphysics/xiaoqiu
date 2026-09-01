import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { ProductSection, UserAvatar } from '../../components/product-ui'
import { positionLabel, roleLabel, verificationLabel } from '../../features/product/product.format'
import { productRepository } from '../../features/product/product.repository'
import { clearSession, readSession } from '../../features/product/session'
import type { AdminIdentity, AuthUser, HomeResponse } from '../../features/product/product.types'

import './index.scss'

const DEMO_PASSWORD = 'Xiaoqiu2026!'
const demoAccounts = [
  {
    username: 'student',
    label: '普通学生',
    nickname: '知夏看球',
    realName: '林知夏',
    studentId: '20249990001',
    note: '浏览、关注与社区互动',
  },
  {
    username: 'player',
    label: '认证球员',
    nickname: '星野',
    realName: '高星野',
    studentId: '20248800011',
    note: '完整球员档案',
  },
  {
    username: 'captain',
    label: '球队队长',
    nickname: '明澈队长',
    realName: '郑明澈',
    studentId: '20248800007',
    note: '球员与队长权限',
  },
  {
    username: 'reporter',
    label: '比赛信息员',
    nickname: '嘉言现场',
    realName: '沈嘉言',
    studentId: '20239990002',
    note: '比赛数据录入入口',
  },
  {
    username: 'admin',
    label: '赛事管理员',
    nickname: '清越赛事组',
    realName: '韩清越',
    studentId: '20219990003',
    note: '实名目录与赛事管理',
  },
] as const

type PageState =
  | { phase: 'loading' }
  | { phase: 'ready'; home: HomeResponse; user: AuthUser | null }
  | { phase: 'failed'; message: string }

export default function MePage() {
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const [identifier, setIdentifier] = useState('student')
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
    if (!identifier.trim() || !password || loggingIn || state.phase !== 'ready') return
    setLoggingIn(true)
    try {
      const session = await productRepository.login(identifier, password)
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
    setIdentifier('student')
    setPassword(DEMO_PASSWORD)
    await Taro.showToast({ title: '已退出', icon: 'success' })
  }

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
      {state.phase === 'ready' && !state.user && (
        <LoginPanel
          identifier={identifier}
          loggingIn={loggingIn}
          password={password}
          onIdentifierChange={setIdentifier}
          onLogin={() => void login()}
          onPasswordChange={setPassword}
          onRecovered={(studentId, newPassword) => {
            setIdentifier(studentId)
            setPassword(newPassword)
          }}
          onSelectAccount={(value) => {
            setIdentifier(value)
            setPassword(DEMO_PASSWORD)
          }}
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
  identifier,
  loggingIn,
  password,
  onIdentifierChange,
  onLogin,
  onPasswordChange,
  onRecovered,
  onSelectAccount,
}: {
  identifier: string
  loggingIn: boolean
  password: string
  onIdentifierChange: (value: string) => void
  onLogin: () => void
  onPasswordChange: (value: string) => void
  onRecovered: (studentId: string, newPassword: string) => void
  onSelectAccount: (username: string) => void
}) {
  const [mode, setMode] = useState<'password' | 'email'>('password')
  const [showRecovery, setShowRecovery] = useState(false)
  const [recoveryName, setRecoveryName] = useState('')
  const [recoveryStudentId, setRecoveryStudentId] = useState('')
  const [recoveryPassword, setRecoveryPassword] = useState(DEMO_PASSWORD)
  const [resetting, setResetting] = useState(false)
  const [email, setEmail] = useState('')
  const [emailCode, setEmailCode] = useState('')

  const resetPassword = async () => {
    if (!recoveryName.trim() || !recoveryStudentId.trim() || !recoveryPassword || resetting) return
    setResetting(true)
    try {
      await productRepository.resetPasswordByIdentity(
        recoveryName.trim(),
        recoveryStudentId.trim(),
        recoveryPassword,
      )
      onRecovered(recoveryStudentId.trim(), recoveryPassword)
      setShowRecovery(false)
      await Taro.showToast({ title: '密码已重置', icon: 'success' })
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '重置失败',
        icon: 'none',
      })
    } finally {
      setResetting(false)
    }
  }

  const showEmailPlaceholder = async () => {
    await Taro.showToast({ title: '演示版暂未发送邮件验证码', icon: 'none', duration: 2200 })
  }

  return (
    <View className="login-layout">
      <View className="login-copy">
        <Text className="login-copy__eyebrow">XIAOQIU ACCOUNT</Text>
        <Text className="login-copy__title">进入你的校园足球身份</Text>
        <Text className="login-copy__body">登录后使用主队、社区和对应角色的赛事工作入口。</Text>
        <View className="demo-password">
          <Text>所有演示账户密码</Text>
          <Text>{DEMO_PASSWORD}</Text>
        </View>
      </View>

      <View className="login-form">
        <Text className="login-form__title">账户登录</Text>
        <View className="login-mode-tabs">
          <Button
            className={'login-mode-tab ' + (mode === 'password' ? 'login-mode-tab--active' : '')}
            onClick={() => setMode('password')}
          >
            账号密码
          </Button>
          <Button
            className={'login-mode-tab ' + (mode === 'email' ? 'login-mode-tab--active' : '')}
            onClick={() => setMode('email')}
          >
            邮箱验证码
          </Button>
        </View>

        {mode === 'password' ? (
          <>
            <Text className="login-form__label">用户名 / 昵称 / 姓名 / 学号</Text>
            <Input
              className="login-form__input"
              placeholder="例如 student 或 20249990001"
              value={identifier}
              onInput={(event) => onIdentifierChange(event.detail.value)}
            />
            <Text className="login-form__label">密码</Text>
            <Input
              className="login-form__input"
              password
              value={password}
              onInput={(event) => onPasswordChange(event.detail.value)}
            />
            <Button
              className="login-form__forgot"
              onClick={() => setShowRecovery((value) => !value)}
            >
              忘记密码
            </Button>
            <Button
              className="button button--primary login-form__submit"
              disabled={!identifier.trim() || !password || loggingIn}
              loading={loggingIn}
              onClick={onLogin}
            >
              登录
            </Button>
          </>
        ) : (
          <>
            <Text className="login-form__label">绑定邮箱</Text>
            <Input
              className="login-form__input"
              placeholder="name@example.com"
              value={email}
              onInput={(event) => setEmail(event.detail.value)}
            />
            <Text className="login-form__label">验证码</Text>
            <View className="email-code-row">
              <Input
                className="login-form__input"
                placeholder="6 位验证码"
                value={emailCode}
                onInput={(event) => setEmailCode(event.detail.value)}
              />
              <Button className="email-code-button" onClick={() => void showEmailPlaceholder()}>
                获取验证码
              </Button>
            </View>
            <Button
              className="button button--primary login-form__submit"
              disabled={!email.trim() || !emailCode.trim()}
              onClick={() => void showEmailPlaceholder()}
            >
              邮箱登录
            </Button>
          </>
        )}
      </View>

      {showRecovery && mode === 'password' && (
        <View className="recovery-panel">
          <View className="recovery-panel__heading">
            <View>
              <Text className="recovery-panel__eyebrow">DEMO RECOVERY</Text>
              <Text className="recovery-panel__title">找回密码</Text>
            </View>
            <Button className="recovery-panel__close" onClick={() => setShowRecovery(false)}>
              关闭
            </Button>
          </View>
          <View className="recovery-form">
            <View>
              <Text className="login-form__label">真实姓名</Text>
              <Input
                className="login-form__input"
                value={recoveryName}
                onInput={(event) => setRecoveryName(event.detail.value)}
              />
            </View>
            <View>
              <Text className="login-form__label">学号</Text>
              <Input
                className="login-form__input"
                value={recoveryStudentId}
                onInput={(event) => setRecoveryStudentId(event.detail.value)}
              />
            </View>
            <View>
              <Text className="login-form__label">新密码</Text>
              <Input
                className="login-form__input"
                password
                value={recoveryPassword}
                onInput={(event) => setRecoveryPassword(event.detail.value)}
              />
            </View>
            <Button
              className="button button--primary recovery-form__submit"
              disabled={
                !recoveryName.trim() ||
                !recoveryStudentId.trim() ||
                recoveryPassword.length < 8 ||
                resetting
              }
              loading={resetting}
              onClick={() => void resetPassword()}
            >
              重置密码
            </Button>
          </View>
        </View>
      )}

      <View className="demo-account-section">
        <ProductSection kicker="DEMO IDENTITIES" title="选择体验身份" note="一键填入" />
        <View className="demo-account-grid">
          {demoAccounts.map((account) => (
            <Button
              className={
                'demo-account ' + (identifier === account.username ? 'demo-account--active' : '')
              }
              key={account.username}
              onClick={() => onSelectAccount(account.username)}
            >
              <Text className="demo-account__role">{account.label}</Text>
              <Text className="demo-account__name">{account.nickname}</Text>
              <Text className="demo-account__real-name">实名 {account.realName}</Text>
              <Text className="demo-account__student-id">学号 {account.studentId}</Text>
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
  const isAdmin = user.roles.some((item) =>
    ['TOURNAMENT_ADMIN', 'ORGANIZATION_ADMIN'].includes(item.role),
  )
  const isOrganizationAdmin = user.roles.some((item) => item.role === 'ORGANIZATION_ADMIN')

  return (
    <View>
      <View className="profile-header">
        <UserAvatar name={user.displayName} size="large" />
        <View className="profile-header__copy">
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
        <Button className="profile-header__logout" onClick={onLogout}>
          退出登录
        </Button>
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
          <ServiceItem
            title={user.linkedPlayer ? '球员档案' : '认领球员'}
            note={user.linkedPlayer ? '数据与出场记录' : '关联校园球员身份'}
            action={() =>
              user.linkedPlayer
                ? void Taro.navigateTo({
                    url:
                      '/pages/player-detail/index?playerId=' +
                      encodeURIComponent(user.linkedPlayer.id) +
                      '&tournamentId=' +
                      encodeURIComponent(tournamentId),
                  })
                : void showUnavailable('该演示身份暂无待认领球员')
            }
          />
          <ServiceItem
            title="加入球队"
            note="查看球队与关注关系"
            action={() =>
              void Taro.reLaunch({
                url: '/pages/my-team/index?tournamentId=' + encodeURIComponent(tournamentId),
              })
            }
          />
          <ServiceItem
            title="意见反馈"
            note="向赛事组提交建议"
            action={() => void showUnavailable('反馈工单将在下一版本接入')}
          />
        </View>
      </View>

      {(isReporter || isAdmin) && (
        <View className="profile-section">
          <ProductSection kicker="WORKSPACE" title="赛事工作台" note="按权限显示" />
          <View className="workspace-list surface">
            {isReporter && (
              <View
                className="workspace-item"
                onClick={() => void Taro.navigateTo({ url: '/pages/quick-report/index' })}
              >
                <Text>快速比赛报告</Text>
                <Text>录入比分与比赛事件</Text>
                <Text>进入</Text>
              </View>
            )}
            {isAdmin && (
              <View
                className="workspace-item"
                onClick={() => void showUnavailable('赛事后台请在桌面管理端打开')}
              >
                <Text>赛事管理</Text>
                <Text>赛程、名单与数据修正</Text>
                <Text>管理端</Text>
              </View>
            )}
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

async function showUnavailable(message: string) {
  await Taro.showToast({ title: message, icon: 'none', duration: 2200 })
}
