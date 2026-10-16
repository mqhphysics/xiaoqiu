import { Button, Input, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { NativeDialog } from '../../components/native-ui/index.weapp'
import { UserAvatar } from '../../components/product-ui'
import { VerificationBadge } from '../../components/verification-badge'
import { AvatarCropper } from '../../components/avatar-cropper'
import { ReportModal } from '../../components/report-modal'
import { openMessaging } from '../../components/messaging-drawer'
import { productRepository, request } from '../../features/product/product.repository'
import { readSession, saveSession } from '../../features/product/session'
import { roleLabel } from '../../features/product/product.format'
import { openPlayer } from '../../features/product/player-navigation'
import { NativeEmailDialog } from './email-dialog.weapp'
import { NativeIdentityDialog } from './identity-dialog.weapp'
import { NativeBadgeDialog } from './badge-dialog.weapp'
import type { DesktopProfileProps, ProfileService } from './desktop-profile'
import type { AuthUser, BadgePreferenceResponse } from '../../features/product/product.types'
import './profile.weapp.scss'

const titles: Record<ProfileService, string> = {
  notifications: '我的通知',
  reports: '反馈记录',
  adminReports: '反馈处理',
  identities: '实名账号目录',
}
type Dialog = ProfileService | 'edit' | 'identity' | 'email' | 'badge' | 'logout' | null
export function useDesktopProfile() {
  return true
}
export function DesktopProfile({ home, user, onUserChange, renderService }: DesktopProfileProps) {
  const [dialog, setDialog] = useState<Dialog>(null)
  const [avatar, setAvatar] = useState(false)
  const [feedback, setFeedback] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [badge, setBadge] = useState<BadgePreferenceResponse | null>(null)
  useEffect(() => {
    let active = true
    void productRepository
      .getBadgePreference()
      .then((value) => {
        if (active) setBadge(value)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [user.id])
  const admin = user.roles.some(
    (role) =>
      role.role === 'PLATFORM_ADMIN' ||
      (role.role === 'ORGANIZATION_ADMIN' &&
        role.scopeType === 'ORGANIZATION' &&
        role.scopeId === user.organizationId),
  )
  const leave = async () => {
    if (logoutBusy) return
    setLogoutBusy(true)
    try {
      await productRepository.logout()
      await Taro.reLaunch({ url: '/pages/login/index' })
    } catch (error) {
      void Taro.showToast({
        title: error instanceof Error ? error.message : '退出失败',
        icon: 'none',
      })
    } finally {
      setLogoutBusy(false)
    }
  }
  return (
    <View className="native-profile">
      <View className="native-profile-card">
        <Button
          className="native-profile-avatar"
          aria-label="更换头像"
          onClick={() => setAvatar(true)}
        >
          <UserAvatar avatarUrl={user.avatarUrl} name={user.displayName} size="large" />
        </Button>
        <View className="native-profile-card__copy">
          <View className="native-profile-card__name">
            <Text>{user.displayName}</Text>
            <VerificationBadge
              level={user.verificationLevel}
              roles={user.roles}
              displayedKind={badge?.displayedKind}
            />
          </View>
          <Text className="native-note">@{user.username}</Text>
          {user.bio && <Text className="native-profile-card__bio">{user.bio}</Text>}
        </View>
        <Button className="native-button" onClick={() => setDialog('edit')}>
          编辑
        </Button>
      </View>
      <View className="native-profile-group">
        <Text className="native-profile-group__title">个人信息</Text>
        <MenuRow icon="user-circle" title="个人资料" onClick={() => setDialog('edit')} />
        <MenuRow icon="shield-check" title="身份与认证" onClick={() => setDialog('identity')} />
        <MenuRow icon="check" title="展示标志" onClick={() => setDialog('badge')} />
        <MenuRow
          icon="mail"
          title="绑定邮箱"
          value={user.email ? (user.emailVerifiedAt ? '已验证' : '待验证') : '未绑定'}
          onClick={() => setDialog('email')}
        />
        {user.linkedPlayer && (
          <MenuRow
            icon="trophy"
            title="球员档案"
            value={user.linkedPlayer.displayName}
            onClick={() => void openPlayer(user.linkedPlayer!.id, home.tournament.id)}
          />
        )}
        <MenuRow
          icon="users"
          title="主队与关注"
          onClick={() =>
            void Taro.reLaunch({
              url: `/pages/my-team/index?tournamentId=${encodeURIComponent(home.tournament.id)}`,
            })
          }
        />
      </View>
      <View className="native-profile-group">
        <Text className="native-profile-group__title">消息与服务</Text>
        <MenuRow icon="bell" title="我的通知" onClick={() => setDialog('notifications')} />
        <MenuRow icon="message-circle" title="消息与私信" onClick={() => openMessaging()} />
        <MenuRow icon="flag" title="问题反馈" onClick={() => setFeedback(true)} />
        <MenuRow icon="file-text" title="反馈记录" onClick={() => setDialog('reports')} />
      </View>
      {admin && (
        <View className="native-profile-group">
          <Text className="native-profile-group__title">管理服务</Text>
          <MenuRow icon="shield-check" title="反馈处理" onClick={() => setDialog('adminReports')} />
          <MenuRow icon="users" title="实名账号目录" onClick={() => setDialog('identities')} />
        </View>
      )}
      <Button
        className="native-button native-button--danger native-profile-logout"
        onClick={() => setDialog('logout')}
      >
        退出登录
      </Button>
      {dialog === 'edit' && (
        <EditProfile user={user} onClose={() => setDialog(null)} onChanged={onUserChange} />
      )}
      {dialog === 'email' && (
        <NativeEmailDialog user={user} onClose={() => setDialog(null)} onChanged={onUserChange} />
      )}
      {dialog === 'identity' && (
        <NativeIdentityDialog
          user={user}
          onClose={() => setDialog(null)}
          onChanged={onUserChange}
        />
      )}
      {dialog === 'badge' && (
        <NativeBadgeDialog onClose={() => setDialog(null)} onSaved={setBadge} />
      )}
      {dialog && dialog in titles && (
        <NativeDialog title={titles[dialog as ProfileService]} onClose={() => setDialog(null)}>
          {renderService(dialog as ProfileService, setDialog)}
        </NativeDialog>
      )}
      {dialog === 'logout' && (
        <NativeDialog
          title="退出登录"
          compact
          busy={logoutBusy}
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button className="native-button" onClick={() => setDialog(null)}>
                取消
              </Button>
              <Button
                className="native-button native-button--danger"
                loading={logoutBusy}
                onClick={() => void leave()}
              >
                退出
              </Button>
            </>
          }
        >
          <Text className="native-note">确定退出当前账号？</Text>
        </NativeDialog>
      )}
      {feedback && (
        <ReportModal title="问题反馈" targetType="FEEDBACK" onClose={() => setFeedback(false)} />
      )}
      {avatar && (
        <AvatarCropper
          onCancel={() => setAvatar(false)}
          onConfirm={async (image) => {
            const updated = await productRepository.uploadAvatar(image)
            onUserChange(updated.user)
            setAvatar(false)
          }}
        />
      )}
    </View>
  )
}
function MenuRow({
  icon,
  title,
  value,
  onClick,
}: {
  icon: string
  title: string
  value?: string
  onClick: () => void
}) {
  return (
    <Button className="native-menu-row" onClick={onClick}>
      <View className={`native-menu-row__icon native-menu-row__icon--${icon}`} />
      <Text>{title}</Text>
      <Text className="native-menu-row__value">{value ?? ''}</Text>
      <Text className="native-menu-row__arrow">›</Text>
    </Button>
  )
}
export function EditProfile({
  user,
  onClose,
  onChanged,
}: {
  user: AuthUser
  onClose: () => void
  onChanged: (user: AuthUser) => void
}) {
  const [name, setName] = useState(user.displayName),
    [bio, setBio] = useState(user.bio ?? '')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const save = async () => {
    if (busy || name.trim().length < 2) return
    setBusy(true)
    setError('')
    const before = readSession()
    try {
      const updated = await request<AuthUser>('/auth/me', {
        method: 'PATCH',
        data: { displayName: name.trim(), bio: bio.trim() },
      })
      const current = readSession()
      if (!before || current?.accessToken !== before.accessToken || current.user.id !== updated.id)
        throw new Error('账号已切换，请重新打开个人资料')
      saveSession({ ...current, user: updated })
      onChanged(updated)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }
  return (
    <NativeDialog
      title="个人资料"
      onClose={onClose}
      busy={busy}
      footer={
        <Button
          className="native-button native-button--primary"
          loading={busy}
          disabled={busy || name.trim().length < 2}
          onClick={() => void save()}
        >
          保存
        </Button>
      }
    >
      <Text className="native-label">昵称</Text>
      <Input
        className="native-field"
        value={name}
        maxlength={40}
        onInput={(event) => setName(event.detail.value)}
      />
      <Text className="native-label">个人简介</Text>
      <Textarea
        className="native-field"
        value={bio}
        maxlength={280}
        onInput={(event) => setBio(event.detail.value)}
      />
      <View className="native-private-info">
        <Text>姓名</Text>
        <Text>{user.realName ?? '未登记'}</Text>
        <Text>学号</Text>
        <Text>{user.studentId ?? '未登记'}</Text>
        <Text>身份</Text>
        <Text>{user.roles.map((role) => roleLabel(role.role)).join('、') || '普通学生'}</Text>
      </View>
      {error && <Text className="native-error">{error}</Text>}
    </NativeDialog>
  )
}
