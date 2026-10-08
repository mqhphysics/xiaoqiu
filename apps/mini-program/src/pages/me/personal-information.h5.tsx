import Taro from '@tarojs/taro'
import { useRef, useState } from 'react'
import { UserAvatar } from '../../components/product-ui'
import { AvatarCropper } from '../../components/avatar-cropper'
import {
  MediaAccountEntry,
  MediaUploadButton,
  usePersonalBackground,
} from '../../features/managed-media/index.h5'
import { ReportModal } from '../../components/report-modal'
import { productRepository } from '../../features/product/product.repository'
import type { DesktopProfileProps } from './desktop-profile'
import { ProfileDialog } from './profile-dialog.h5'
export function ProfileInformation({
  user,
  onUserChange,
  onClose,
  onAvatar,
}: Pick<DesktopProfileProps, 'user' | 'onUserChange'> & {
  onClose: () => void
  onAvatar?: () => void
}) {
  const [editing, setEditing] = useState<'name' | 'email' | 'bio' | null>(null)
  const [correction, setCorrection] = useState(false)
  const [avatar, setAvatar] = useState(false)
  const background = usePersonalBackground(user.id)
  return (
    <ProfileDialog title="个人信息" note="公开资料与仅本人可见的账户信息。" onClose={onClose}>
      <div className="profile-info-list">
        <div className="profile-info-row">
          <span>头像</span>
          <UserAvatar name={user.displayName} avatarUrl={user.avatarUrl} size="small" />
          <button data-profile-button onClick={onAvatar ?? (() => setAvatar(true))}>
            更换
          </button>
        </div>
        <div className="profile-info-row">
          <span>昵称</span>
          <strong>{user.displayName}</strong>
          <button data-profile-button onClick={() => setEditing('name')}>
            更改
          </button>
        </div>
        <div className="profile-info-row">
          <span>个人背景</span>
          <span>
            {background ? (
              <img className="profile-info-background" src={background} alt="当前个人背景" />
            ) : (
              '默认背景'
            )}
          </span>
          <MediaUploadButton purpose="USER_BACKGROUND" targetId={user.id} label="更换" />
        </div>
        <div className="profile-info-row">
          <span>个人简介</span>
          <span>{user.bio || '还没有填写简介'}</span>
          <button data-profile-button onClick={() => setEditing('bio')}>
            更改
          </button>
        </div>
        <p className="profile-info-private">以下信息仅本人可见</p>
        <div className="profile-info-row">
          <span>姓名</span>
          <strong>{user.realName || '未登记'}</strong>
          <button data-profile-button onClick={() => setCorrection(true)}>
            申请更正
          </button>
        </div>
        <div className="profile-info-row">
          <span>学号</span>
          <span>{user.studentId || '未登记'}</span>
          <button data-profile-button onClick={() => setCorrection(true)}>
            申请更正
          </button>
        </div>
        <div className="profile-info-row">
          <span>绑定邮箱</span>
          <span>{user.email || '未绑定'}</span>
          <button data-profile-button onClick={() => setEditing('email')}>
            {user.email ? '更换' : '绑定'}
          </button>
        </div>
      </div>
      {editing && (
        <ProfileEditor
          key={editing}
          user={user}
          field={editing}
          onUserChange={onUserChange}
          onClose={() => setEditing(null)}
        />
      )}
      <div className="profile-info-media">
        <MediaAccountEntry includeBackground={false} />
      </div>
      {correction && (
        <ReportModal
          targetType="FEEDBACK"
          title="实名资料更正申请"
          onClose={() => setCorrection(false)}
        />
      )}
      {avatar && (
        <AvatarCropper
          onCancel={() => setAvatar(false)}
          onConfirm={async (dataUrl) => {
            const result = await productRepository.uploadAvatar(dataUrl)
            onUserChange(result.user)
            setAvatar(false)
          }}
        />
      )}
    </ProfileDialog>
  )
}

function ProfileEditor({
  user,
  onUserChange,
  onClose,
  field,
}: Pick<DesktopProfileProps, 'user' | 'onUserChange'> & {
  onClose: () => void
  field: 'name' | 'email' | 'bio'
}) {
  const [name, setName] = useState(user.displayName)
  const [email, setEmail] = useState(user.email ?? '')
  const [bio, setBio] = useState(user.bio ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const close = () => {
    if (!busy.current) onClose()
  }
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy.current) return
    if (name.trim().length < 2) {
      setError('昵称至少需要 2 个字。')
      return
    }
    if (field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('请输入有效的邮箱地址。')
      return
    }
    busy.current = true
    setSaving(true)
    setError('')
    try {
      onUserChange(await productRepository.updateProfile(name.trim(), email.trim(), bio.trim()))
      onClose()
      void Taro.showToast({ title: '资料已保存', icon: 'success' })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '保存失败，请重试')
    } finally {
      busy.current = false
      setSaving(false)
    }
  }
  return (
    <form
      className="profile-edit-form profile-edit-form--inline"
      onSubmit={(event) => void save(event)}
    >
      {field === 'name' && (
        <label data-profile-field="">
          昵称
          <input
            data-profile-input=""
            autoComplete="nickname"
            value={name}
            maxLength={120}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </label>
      )}
      {field === 'email' && (
        <label data-profile-field="">
          绑定邮箱
          <input
            data-profile-input=""
            type="email"
            autoComplete="email"
            value={email}
            maxLength={254}
            required
            onChange={(event) => setEmail(event.target.value)}
          />
          <small>用于账号联系与登录，当前未提供邮件验证码验证。</small>
        </label>
      )}
      {field === 'bio' && (
        <label data-profile-field="">
          个人简介
          <textarea
            data-profile-textarea=""
            value={bio}
            maxLength={280}
            rows={4}
            onChange={(event) => setBio(event.target.value)}
          />
          <small>{bio.length}/280</small>
        </label>
      )}
      {error && (
        <p role="alert" className="profile-error">
          {error}
        </p>
      )}
      <div className="profile-dialog__actions">
        <button
          data-profile-button=""
          type="button"
          className="profile-button profile-button--outline"
          disabled={saving}
          onClick={close}
        >
          取消
        </button>
        <button
          data-profile-button=""
          className="profile-button profile-button--primary"
          disabled={saving}
        >
          {saving ? '正在保存…' : '保存资料'}
        </button>
      </div>
    </form>
  )
}
