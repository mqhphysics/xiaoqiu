import { useEffect, useRef, useState } from 'react'
import { UserAvatar } from '../product-ui'
import { roleLabel, verificationLabel } from '../../features/product/product.format'
import { useBrowserPreferences } from '../settings-dialog/preferences.h5'
import { InformationEntryDialog } from '../../features/match-report/information-entry-dialog.h5'
import type { DesktopAccountProps } from './desktop-account'
import './desktop-account.h5.scss'

export function useDesktopAccount() {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 721px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 721px)')
    const sync = () => setDesktop(media.matches)
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])
  return desktop
}

export function DesktopAccount({
  user,
  onProfile,
  onMessages,
  onSettings,
  onFeedback,
  onLogout,
}: DesktopAccountProps) {
  useBrowserPreferences()
  const [open, setOpen] = useState(false)
  const [report, setReport] = useState(false)
  const account = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const close = () => {
    clearTimeout(timer.current)
    setOpen(false)
  }
  const show = () => {
    clearTimeout(timer.current)
    setOpen(true)
  }
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!account.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const route = () => {
      setOpen(false)
      setReport(false)
    }
    window.addEventListener('pointerdown', dismiss)
    window.addEventListener('keydown', escape)
    window.addEventListener('hashchange', route)
    return () => {
      clearTimeout(timer.current)
      window.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('keydown', escape)
      window.removeEventListener('hashchange', route)
    }
  }, [])
  const canReport = user?.roles.some(
    (role) =>
      (role.role === 'MATCH_REPORTER' && ['MATCH', 'TOURNAMENT'].includes(role.scopeType)) ||
      (role.role === 'TOURNAMENT_ADMIN' && role.scopeType === 'TOURNAMENT') ||
      (role.role === 'PLATFORM_ADMIN' && role.scopeType === 'PLATFORM') ||
      (role.role === 'ORGANIZATION_ADMIN' &&
        role.scopeType === 'ORGANIZATION' &&
        role.scopeId === user.organizationId),
  )
  const select = (action: () => void) => {
    close()
    action()
  }
  return (
    <div className="desktop-account-tools">
      <div
        ref={account}
        className="desktop-account-hover"
        onMouseEnter={show}
        onMouseLeave={() => {
          timer.current = setTimeout(() => {
            if (!account.current?.contains(document.activeElement)) setOpen(false)
          }, 120)
        }}
        onFocusCapture={show}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) close()
        }}
      >
        <button
          data-account-control
          className="desktop-account-avatar"
          aria-label="账户菜单"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <UserAvatar
            name={user?.displayName ?? '访客'}
            avatarUrl={user?.avatarUrl ?? null}
            size="small"
          />
        </button>
        {open && (
          <div className="desktop-account-popover" aria-label="账户选项">
            <div className="desktop-account-popover__identity">
              <strong>{user?.displayName ?? '游客'}</strong>
              <span>{user ? `@${user.username}` : '公开浏览模式'}</span>
              {user && (
                <small>
                  {[...new Set(user.roles.map((role) => roleLabel(role.role)))].join(' · ') ||
                    verificationLabel(user.verificationLevel)}
                </small>
              )}
            </div>
            <button data-account-control onClick={() => select(onProfile)}>
              {user ? '个人中心' : '登录或注册'}
            </button>
            <button data-account-control onClick={() => select(onSettings)}>
              设置
            </button>
            <button data-account-control onClick={() => select(onFeedback)}>
              问题反馈
            </button>
            {user && (
              <button
                data-account-control
                className="desktop-account-popover__logout"
                onClick={() => select(onLogout)}
              >
                退出登录
              </button>
            )}
            <div className="desktop-account-popover__version">晓球 V1.0.0</div>
          </div>
        )}
      </div>
      {user && (
        <button
          data-account-control
          className="desktop-account-icon"
          aria-label="我的消息"
          title="我的消息"
          onClick={() => select(onMessages)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 6 9 7 9-7" />
          </svg>
        </button>
      )}
      {canReport && (
        <button
          data-account-control
          className="desktop-account-icon"
          aria-label="信息录入"
          title="信息录入"
          onClick={() => {
            close()
            setReport(true)
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="m16 3 5 5-12 12H4v-5Z" />
            <path d="m14 5 5 5M3 22h18" />
          </svg>
        </button>
      )}
      {report && user && <InformationEntryDialog onClose={() => setReport(false)} />}
    </div>
  )
}
