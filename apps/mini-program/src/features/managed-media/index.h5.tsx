import Taro from '@tarojs/taro'
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayFocus } from '../../components/overlay-focus/index.h5'
import { readSession, subscribeToSessionChanges } from '../product/session.h5'
import { resolveMediaUrl } from '../product/product.repository'
import {
  fileDataUrl,
  mediaRequest,
  privateMediaBlob,
  readMediaCapabilities,
  type MediaAsset,
  type MediaCapabilities,
  type MediaPage,
  type MediaPurpose,
} from './repository.h5'
import './index.h5.scss'

const LABELS: Record<MediaPurpose, string> = {
  GOAL_GIF: '进球 GIF',
  USER_AVATAR: '账户头像',
  USER_BACKGROUND: '个人背景',
  PLAYER_PORTRAIT: '球员照片',
}
const showError = (error: unknown) =>
  void Taro.showToast({ title: error instanceof Error ? error.message : '操作失败', icon: 'none' })
const mediaChanged = () => window.dispatchEvent(new Event('xiaoqiu:media-changed'))

function MediaDialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const id = `managed-media-${useId().replace(/:/g, '')}`
  useOverlayFocus(true, `#${id}`, onClose)
  return createPortal(
    <div
      className="managed-media-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        id={id}
        className="managed-media-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header>
          <h2>{title}</h2>
          <button data-media-control type="button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  )
}

export function MediaUploadButton({
  purpose,
  targetId,
  label,
  onSubmitted,
  compact = false,
}: {
  purpose: MediaPurpose
  targetId: string
  label?: string
  onSubmitted?: () => void
  compact?: boolean
}) {
  const [capabilities, setCapabilities] = useState<MediaCapabilities | null>(null)
  const [opening, setOpening] = useState(false)
  const open = async () => {
    if (opening) return
    setOpening(true)
    try {
      const data = await readMediaCapabilities()
      if (!data.enabled) throw new Error('功能暂未开放')
      if (!data.canSubmit) throw new Error('当前账号无投稿权限')
      if (
        purpose === 'PLAYER_PORTRAIT' &&
        data.linkedPlayerId !== targetId &&
        !data.canManageAnyPlayerPortrait
      )
        throw new Error('只能投稿本人已关联的球员照片')
      setCapabilities(data)
    } catch (error) {
      showError(error)
    } finally {
      setOpening(false)
    }
  }
  useEffect(() => subscribeToSessionChanges(() => setCapabilities(null)), [])
  return (
    <>
      <button
        data-media-control
        type="button"
        className={`managed-media-button${compact ? ' managed-media-button--compact' : ''}`}
        aria-busy={opening}
        disabled={opening}
        onClick={() => void open()}
      >
        {compact ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <path d="m16 3 5 5-12 12H4v-5Z" />
            <path d="m14 5 5 5" />
          </svg>
        ) : null}
        {label ?? `上传${LABELS[purpose]}`}
      </button>
      {capabilities ? (
        <UploadDialog
          purpose={purpose}
          targetId={targetId}
          direct={capabilities.canDirectPublish}
          onClose={() => setCapabilities(null)}
          onSubmitted={() => {
            mediaChanged()
            onSubmitted?.()
          }}
        />
      ) : null}
    </>
  )
}

function UploadDialog({
  purpose,
  targetId,
  direct,
  onClose,
  onSubmitted,
}: {
  purpose: MediaPurpose
  targetId: string
  direct: boolean
  onClose: () => void
  onSubmitted: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const [preview, setPreview] = useState('')
  useEffect(() => {
    if (!file || purpose === 'GOAL_GIF') {
      setPreview('')
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file, purpose])
  // Kept across retry of this file. A new selected file gets its own idempotency key.
  const clientId = useRef(crypto.randomUUID())
  const submit = async () => {
    if (!file || busy) return
    setBusy(true)
    setMessage('')
    try {
      if (file.size > (purpose === 'GOAL_GIF' ? 6 : 4) * 1024 * 1024)
        throw new Error(purpose === 'GOAL_GIF' ? 'GIF 不能超过 6 MiB' : '图片不能超过 4 MiB')
      const dataUrl = await fileDataUrl(file)
      const item = await mediaRequest<MediaAsset>(
        'media-assets',
        { purpose, targetId, clientSubmissionId: clientId.current, dataUrl },
        'POST',
      )
      setMessage(item.status === 'APPROVED' ? '已发布' : '投稿已提交，请在“我的投稿”查看审核结果')
      setSuccess(true)
      onSubmitted()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '上传失败，请重试')
    } finally {
      setBusy(false)
    }
  }
  return (
    <MediaDialog
      title={`${purpose === 'USER_BACKGROUND' ? '更换' : '上传'}${LABELS[purpose]}`}
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <div className="managed-media-form">
        <p>
          {purpose === 'GOAL_GIF'
            ? 'GIF ≤ 6 MiB，16–960 像素，2–120 帧，单次 ≤ 15 秒。'
            : purpose === 'USER_AVATAR'
              ? 'JPEG、PNG 或静态 WebP，最大 4 MiB；头像需为 64–512 像素的正方形。'
              : 'JPEG、PNG 或静态 WebP，最大 4 MiB。个人背景建议选择横向照片。'}
        </p>
        <p>
          {direct ? '总管理员上传后直接发布。' : '上传后经审核显示，审核结果在“我的投稿”中可见。'}
        </p>
        <label data-media-field className="managed-media-picker">
          <input
            data-media-input
            type="file"
            accept={purpose === 'GOAL_GIF' ? 'image/gif' : 'image/jpeg,image/png,image/webp'}
            disabled={busy || success}
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null
              const allowed =
                purpose === 'GOAL_GIF' ? ['image/gif'] : ['image/jpeg', 'image/png', 'image/webp']
              if (
                selected &&
                (!allowed.includes(selected.type) ||
                  selected.size > (purpose === 'GOAL_GIF' ? 6 : 4) * 1024 * 1024)
              ) {
                setFile(null)
                setMessage('请选择符合格式和大小要求的文件')
                return
              }
              setFile(selected)
              clientId.current = crypto.randomUUID()
              setMessage('')
            }}
          />
          {preview ? (
            <img className="managed-media-picker__preview" src={preview} alt="待上传图片预览" />
          ) : (
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="8" cy="8" r="1.5" />
              <path d="m3 17 5-5 4 4 4-6 5 7" />
            </svg>
          )}
          <strong>{file?.name ?? '点击选择图片'}</strong>
          <small>{file ? '重新选择' : '选择一张属于你的球场记忆'}</small>
        </label>
        {purpose === 'GOAL_GIF' ? (
          <small>该投稿只关联当前进球事件，事件更正或撤销后停止展示。</small>
        ) : null}
        <div role="status">{message}</div>
        <button
          data-media-control
          type="button"
          className="managed-media-button"
          disabled={!file || busy || success}
          onClick={() => void submit()}
        >
          {busy ? '上传中…' : '提交'}
        </button>
      </div>
    </MediaDialog>
  )
}

export function GoalMedia({ asset }: { asset: MediaAsset }) {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const playing = playingId === asset.id
  const [loaded, setLoaded] = useState(false)
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => {
      setReduced(query.matches)
      setPlayingId(null)
    }
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  useEffect(() => {
    if (!playing) return
    const timer = loaded
      ? window.setTimeout(() => setPlayingId(null), asset.durationMs + 250)
      : undefined
    const stop = () => {
      if (document.hidden) setPlayingId(null)
    }
    document.addEventListener('visibilitychange', stop)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', stop)
    }
  }, [playing, loaded, asset.durationMs])
  return (
    <div className="goal-media">
      <button
        type="button"
        aria-label={
          playing
            ? '停止进球 GIF'
            : `播放一次进球 GIF，${(asset.bytes / 1024 / 1024).toFixed(1)} MiB${reduced ? '，已开启减少动画' : ''}`
        }
        aria-pressed={playing}
        onClick={() => {
          setLoaded(false)
          setPlayingId(playing ? null : asset.id)
        }}
      >
        <img
          key={playing ? asset.contentUrl : asset.posterUrl}
          src={resolveMediaUrl(playing ? asset.contentUrl : asset.posterUrl)}
          alt="进球回放"
          loading="lazy"
          decoding="async"
          onLoad={() => {
            if (playing) setLoaded(true)
          }}
          onError={() => {
            setPlayingId(null)
            showError(new Error('进球媒体已撤下或不可用'))
          }}
        />
        <span>
          {playing ? '停止播放' : '播放 GIF'} · {(asset.bytes / 1024 / 1024).toFixed(1)} MiB
          {reduced && !playing ? ' · 点击播放一次' : ''}
        </span>
      </button>
    </div>
  )
}

export function useMatchGoalMedia(matchId: string) {
  const [items, setItems] = useState<MediaAsset[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const load = () =>
      void mediaRequest<{ items: MediaAsset[] }>(
        `media-assets/matches/${encodeURIComponent(matchId)}/goals`,
      )
        .then((data) => {
          if (active) {
            setItems(data.items)
            setError('')
          }
        })
        .catch((reason) => {
          if (active) {
            setItems([])
            setError(reason instanceof Error ? reason.message : '进球媒体读取失败')
          }
        })
    setItems([])
    load()
    window.addEventListener('xiaoqiu:media-changed', load)
    return () => {
      active = false
      window.removeEventListener('xiaoqiu:media-changed', load)
    }
  }, [matchId])
  return { items, error }
}

export function MediaLibraryButton({ review = false }: { review?: boolean }) {
  const [open, setOpen] = useState(false)
  const label = review ? '媒体审核' : '我的投稿'
  useEffect(() => subscribeToSessionChanges(() => setOpen(false)), [])
  const show = async () => {
    try {
      const capability = await readMediaCapabilities()
      if (!capability.enabled) throw new Error('功能暂未开放')
      if (review && !capability.canReview) throw new Error('当前账号无媒体审核权限')
      setOpen(true)
    } catch (error) {
      showError(error)
    }
  }
  return (
    <>
      <button type="button" className="managed-media-button" onClick={() => void show()}>
        {label}
      </button>
      {open ? (
        <MediaDialog title={label} onClose={() => setOpen(false)}>
          <MediaLibrary review={review} />
        </MediaDialog>
      ) : null}
    </>
  )
}

function PrivatePoster({ asset }: { asset: MediaAsset }) {
  const [url, setUrl] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')
  const element = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!element.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '100px' },
    )
    observer.observe(element.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) return
    const controller = new AbortController()
    let objectUrl = ''
    void privateMediaBlob(asset.posterUrl, controller.signal)
      .then((blob) => {
        if (!controller.signal.aborted) {
          objectUrl = URL.createObjectURL(blob)
          setUrl(objectUrl)
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message)
      })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [asset.posterUrl, visible])
  return (
    <div ref={element} className="media-private-poster">
      {url ? (
        <img src={url} alt={`${LABELS[asset.purpose]}投稿静态封面`} />
      ) : (
        <button type="button" onClick={() => setVisible(true)}>
          {error || '查看封面'}
        </button>
      )}
    </div>
  )
}

// Pending/hidden GIFs require the same authenticated fetch as their private posters.
// The animation is fetched only after an explicit click, including with reduced motion.
function PrivateGifPreview({ asset }: { asset: MediaAsset }) {
  const [playing, setPlaying] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!playing) return
    const controller = new AbortController()
    let objectUrl = ''
    void privateMediaBlob(asset.contentUrl, controller.signal)
      .then((blob) => {
        if (!controller.signal.aborted) {
          objectUrl = URL.createObjectURL(blob)
          setUrl(objectUrl)
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setPlaying(false)
          showError(error)
        }
      })
    return () => {
      controller.abort()
      setUrl('')
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [asset.contentUrl, playing])
  useEffect(() => {
    if (!playing) return
    const timer = loaded
      ? window.setTimeout(() => setPlaying(false), asset.durationMs + 250)
      : undefined
    const stop = () => {
      if (document.hidden) setPlaying(false)
    }
    document.addEventListener('visibilitychange', stop)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', stop)
    }
  }, [asset.durationMs, loaded, playing])
  return (
    <div className="goal-media media-private-gif">
      <button
        type="button"
        aria-pressed={playing}
        onClick={() => {
          setLoaded(false)
          setPlaying((value) => !value)
        }}
      >
        {playing && url ? (
          <img
            src={url}
            alt="投稿 GIF 授权预览"
            onLoad={() => setLoaded(true)}
            onError={() => {
              setPlaying(false)
              showError(new Error('投稿 GIF 无法解码'))
            }}
          />
        ) : null}
        <span>
          {playing ? (url ? '停止预览' : '正在加载，点击取消') : '播放投稿 GIF 一次'} ·{' '}
          {(asset.bytes / 1024 / 1024).toFixed(1)} MiB
        </span>
      </button>
    </div>
  )
}

function MediaLibrary({ review }: { review: boolean }) {
  const [items, setItems] = useState<MediaAsset[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const path = review ? 'admin/media-assets' : 'media-assets/mine'
  const load = useCallback(
    async (before?: string) => {
      try {
        const data = await mediaRequest<MediaPage>(
          `${path}${before ? `?before=${encodeURIComponent(before)}` : ''}`,
        )
        setItems((current) => (before ? [...current, ...data.items] : data.items))
        setNext(data.nextCursor)
        setMessage('')
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '投稿读取失败')
      }
    },
    [path],
  )
  useEffect(() => {
    void load()
  }, [load])
  const act = async (item: MediaAsset, action: string) => {
    if (busy) return
    setBusy(true)
    try {
      const reviewAction = action === 'APPROVE' || action === 'REJECT'
      const updated = await mediaRequest<MediaAsset>(
        reviewAction
          ? `admin/media-assets/${item.id}/review`
          : `media-assets/${item.id}/visibility`,
        { action, expectedVersion: item.version, reason: reasons[item.id] ?? '' },
        'PUT',
      )
      setItems((current) => current.map((row) => (row.id === updated.id ? updated : row)))
      setMessage('操作已保存')
      mediaChanged()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="media-library">
      <div role="status">{message}</div>
      <button type="button" className="managed-media-button" onClick={() => void load()}>
        刷新
      </button>
      {items.length === 0 && !message ? <p>暂无投稿</p> : null}
      {items.map((item) => (
        <article key={item.id}>
          <PrivatePoster asset={item} />
          <div className="media-library__copy">
            <strong>{LABELS[item.purpose]}</strong>
            <span>
              {item.status === 'PENDING'
                ? '待审核'
                : item.status === 'APPROVED'
                  ? '已通过'
                  : '已驳回'}
              {item.visibility !== 'ACTIVE'
                ? ` · ${item.visibility === 'HIDDEN' ? '已隐藏' : '已删除（可恢复）'}`
                : ''}
            </span>
            <small>{item.targetLabel}</small>
            {item.purpose === 'GOAL_GIF' ? <PrivateGifPreview asset={item} /> : null}
            {item.associationState === 'REMOVED_OR_CHANGED' ? (
              <p>关联目标已更正或撤销，停止公开展示。请针对新事件重新投稿。</p>
            ) : null}
            {item.reviewReason ? <p>审核反馈：{item.reviewReason}</p> : null}
            {review ? (
              <label>
                审核意见
                <textarea
                  value={reasons[item.id] ?? ''}
                  maxLength={1000}
                  onChange={(event) =>
                    setReasons((current) => ({ ...current, [item.id]: event.target.value }))
                  }
                  placeholder="驳回时必须填写原因"
                />
              </label>
            ) : null}
            <div className="media-library__actions">
              {review && item.visibility !== 'DELETED' ? (
                <>
                  <button
                    type="button"
                    disabled={busy || item.associationState !== 'CURRENT'}
                    onClick={() => void act(item, 'APPROVE')}
                  >
                    通过
                  </button>
                  <button type="button" disabled={busy} onClick={() => void act(item, 'REJECT')}>
                    驳回
                  </button>
                </>
              ) : null}
              {item.visibility === 'ACTIVE' ? (
                <button type="button" disabled={busy} onClick={() => void act(item, 'HIDE')}>
                  隐藏
                </button>
              ) : item.canRestore ? (
                <button type="button" disabled={busy} onClick={() => void act(item, 'RESTORE')}>
                  恢复
                </button>
              ) : null}
              {item.visibility !== 'DELETED' ? (
                <button type="button" disabled={busy} onClick={() => void act(item, 'DELETE')}>
                  删除
                </button>
              ) : null}
            </div>
          </div>
        </article>
      ))}
      {next ? (
        <button type="button" className="managed-media-button" onClick={() => void load(next)}>
          加载更多
        </button>
      ) : null}
    </div>
  )
}

export function MediaAccountEntry({
  includeBackground = true,
}: { includeBackground?: boolean } = {}) {
  const user = readSession()?.user
  const [canReview, setCanReview] = useState(false)
  useEffect(() => {
    let active = true
    const refresh = () =>
      void readMediaCapabilities()
        .then((data) => {
          if (active) setCanReview(data.canReview)
        })
        .catch(() => {
          if (active) setCanReview(false)
        })
    refresh()
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      window.removeEventListener('focus', refresh)
    }
  }, [user?.id, user?.organizationId])
  if (!user) return null
  const reviewer = user.roles.some(
    (role) => role.role === 'PLATFORM_ADMIN' && role.scopeType === 'PLATFORM',
  )
  return (
    <div className="media-account-entry">
      {includeBackground && (
        <MediaUploadButton purpose="USER_BACKGROUND" targetId={user.id} label="更换个人背景" />
      )}
      <MediaLibraryButton />
      {user.linkedPlayer ? (
        <MediaUploadButton purpose="PLAYER_PORTRAIT" targetId={user.linkedPlayer.id} />
      ) : null}
      {reviewer || canReview ? <MediaLibraryButton review /> : null}
    </div>
  )
}

export function usePersonalBackground(userId: string | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    setUrl(null)
    const load = () => {
      if (userId)
        void mediaRequest<{ backgroundUrl: string | null }>(
          `media-assets/users/${encodeURIComponent(userId)}/presentation`,
        )
          .then((data) => {
            if (active) setUrl(data.backgroundUrl)
          })
          .catch(() => {
            if (active) setUrl(null)
          })
    }
    load()
    window.addEventListener('xiaoqiu:media-changed', load)
    return () => {
      active = false
      window.removeEventListener('xiaoqiu:media-changed', load)
    }
  }, [userId])
  return resolveMediaUrl(url)
}
