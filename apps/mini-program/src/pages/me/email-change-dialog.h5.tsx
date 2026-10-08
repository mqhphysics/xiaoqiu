import { useEffect, useRef, useState } from 'react'
import type { AuthUser } from '../../features/product/product.types'
import {
  emailChange,
  type EmailChangeFlow,
} from '../../features/product/email-change.repository.h5'
import { ReportModal } from '../../components/report-modal'
import { ProfileDialog } from './profile-dialog.h5'
import './personal-information.h5.scss'
export function EmailChangeDialog({
  user,
  onChanged,
  onClose,
}: {
  user: AuthUser
  onChanged: (user: AuthUser) => void
  onClose: () => void
}) {
  const [flow, setFlow] = useState<EmailChangeFlow | null>(null),
    [email, setEmail] = useState(''),
    [code, setCode] = useState('')
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState(false),
    [manual, setManual] = useState(false)
  const [deadline, setDeadline] = useState(0),
    [now, setNow] = useState(Date.now()),
    [requestedEmail, setRequestedEmail] = useState<string | null>(null)
  const lock = useRef(false)
  const initiallyBound = useRef(Boolean(user.email)).current
  useEffect(() => {
    let active = true
    void emailChange
      .start()
      .then((value) => {
        if (active) {
          setFlow(value)
          setEmail(value.newEmail ?? '')
          setRequestedEmail(value.newEmail)
        }
      })
      .catch((issue) => {
        if (active) setError(issue.message)
      })
    return () => {
      active = false
    }
  }, [user.id, user.organizationId])
  useEffect(() => {
    if (deadline <= Date.now()) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [deadline])
  const old = flow?.stage === 'OLD_EMAIL',
    remaining = Math.max(0, Math.ceil((deadline - now) / 1000))
  const close = () => {
    if (!lock.current) onClose()
  }
  const send = async () => {
    if (!flow || lock.current || remaining) return
    if (!old && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('请输入有效的新邮箱')
      return
    }
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await emailChange.requestCode(flow.id, old ? undefined : email.trim())
      setRequestedEmail(email.trim().toLowerCase())
      setDeadline(Date.now() + result.retryAfterSeconds * 1000)
      setNow(Date.now())
      setNotice(result.message)
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '验证码请求失败')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!flow || lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      if (old) {
        setFlow(await emailChange.verifyOld(flow.id, code))
        setCode('')
        setNotice('原邮箱已验证，请继续验证新邮箱。')
        setDeadline(0)
        setRequestedEmail(null)
      } else {
        onChanged(await emailChange.complete(flow.id, code))
        setSuccess(true)
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '验证未完成')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <ProfileDialog
      title={initiallyBound ? '换绑邮箱' : '绑定邮箱'}
      {...(success ? {} : { note: '验证邮箱归属后完成绑定。' })}
      onClose={close}
    >
      {success ? (
        <div className="email-change-success">
          <span>✓</span>
          <strong>{initiallyBound ? '邮箱换绑已完成' : '邮箱绑定已完成'}</strong>
          <button
            data-profile-button
            className="profile-button profile-button--primary"
            onClick={onClose}
          >
            完成
          </button>
        </div>
      ) : (
        <>
          {!flow && !error && <p role="status">正在读取邮箱绑定…</p>}
          {flow && (
            <form className="email-change-form" onSubmit={(event) => void submit(event)}>
              {flow.currentEmail && (
                <div className="email-change-steps">
                  <span className={old ? 'is-current' : 'is-complete'}>1 验证原邮箱</span>
                  <i />
                  <span className={!old ? 'is-current' : ''}>2 绑定新邮箱</span>
                </div>
              )}
              <label>
                {old ? '原邮箱' : '新邮箱'}
                <input
                  aria-label={old ? '原邮箱' : '新邮箱'}
                  type="email"
                  autoComplete="email"
                  value={old ? (flow.currentEmail ?? '') : email}
                  readOnly={old}
                  required
                  onChange={(event) => {
                    setEmail(event.target.value)
                    setCode('')
                    setRequestedEmail(null)
                    setDeadline(0)
                    setNotice('')
                  }}
                />
              </label>
              <label>
                邮箱验证码
                <div className="email-change-code">
                  <input
                    aria-label="邮箱验证码"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    required
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  />
                  <button
                    data-profile-button
                    type="button"
                    disabled={busy || remaining > 0}
                    onClick={() => void send()}
                  >
                    {remaining ? `${remaining}秒后重试` : busy ? '正在请求…' : '获取验证码'}
                  </button>
                </div>
              </label>
              {notice && (
                <p className="email-change-notice" role="status">
                  {notice}
                </p>
              )}
              <div className="profile-dialog__actions">
                <button
                  data-profile-button
                  type="button"
                  className="profile-button profile-button--outline"
                  disabled={busy}
                  onClick={close}
                >
                  取消
                </button>
                <button
                  data-profile-button
                  className="profile-button profile-button--primary"
                  disabled={
                    busy ||
                    code.length !== 6 ||
                    (!old && requestedEmail !== email.trim().toLowerCase())
                  }
                >
                  {busy ? '正在验证…' : old ? '验证原邮箱并继续' : '验证并绑定'}
                </button>
              </div>
            </form>
          )}
          {error && (
            <p className="profile-error" role="alert">
              {error}
            </p>
          )}
          <p className="email-change-manual">
            原邮箱无法使用？
            <button data-profile-button onClick={() => setManual(true)}>
              向管理员申请
            </button>
          </p>
          {manual && (
            <ReportModal
              targetType="FEEDBACK"
              title="邮箱换绑申请"
              onClose={() => setManual(false)}
            />
          )}
        </>
      )}
    </ProfileDialog>
  )
}
