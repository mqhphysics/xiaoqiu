import { useRef, useState } from 'react'
import type { PostTag } from '../../features/product/product.types'
import { PostTagPicker } from '../post-tags/picker.h5'
import { createPortal } from 'react-dom'
import { createClientActionId, productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import { UserAvatar } from '../product-ui'
import { useOverlayFocus } from '../overlay-focus'
import { EmojiPicker, insertAtCursor } from '../post-social/emoji-picker'
import { PostIcon } from '../post-social/icons'
import {
  MAX_POST_DATA_LENGTH,
  MAX_POST_IMAGES,
  prepareDesktopPostImage,
} from '../post-social/media'
import type { PostComposerProps } from './index'
import '../post-social/index.h5.scss'

export function DesktopPostComposer({
  open,
  onClose,
  onPublished,
  teamId,
  tournamentId,
  initialTags,
}: PostComposerProps) {
  const [body, setBody] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [processing, setProcessing] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState('')
  const [tags, setTags] = useState<PostTag[]>(() => initialTags ?? [])
  const [tagResolving, setTagResolving] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const pending = useRef<{ signature: string; id: string } | null>(null)
  const busy = useRef(false)
  const enabled = open && window.matchMedia('(min-width: 721px)').matches
  const close = () => {
    if (!busy.current && !processing && !tagResolving) onClose()
  }
  useOverlayFocus(enabled, '.post-composer', close)
  const session = readSession()
  const canPublish =
    Boolean(body.trim() || images.length) && !processing && !publishing && !tagResolving
  const publish = async () => {
    if (!canPublish || busy.current) return
    busy.current = true
    setPublishing(true)
    setError('')
    const signature = JSON.stringify([body.trim(), images, teamId, tags, tournamentId])
    if (pending.current?.signature !== signature)
      pending.current = { signature, id: createClientActionId('post') }
    try {
      const post = await productRepository.createPost(
        body.trim(),
        pending.current.id,
        undefined,
        teamId,
        undefined,
        images,
        tags,
        tournamentId,
      )
      setBody('')
      setImages([])
      setTags(initialTags ?? [])
      pending.current = null
      onPublished(post)
      onClose()
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '发布失败，请重试')
    } finally {
      busy.current = false
      setPublishing(false)
    }
  }
  if (!enabled) return null
  return createPortal(
    <div
      className="post-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <section
        className="post-composer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-composer-title"
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            void publish()
          }
        }}
      >
        <header className="post-composer__header">
          <h2 id="post-composer-title">发布动态</h2>
          <button
            type="button"
            className="post-tool"
            aria-label="关闭发布窗口"
            disabled={publishing || processing || tagResolving}
            onClick={close}
          >
            <PostIcon name="close" />
          </button>
        </header>
        <div className="post-composer__identity">
          <UserAvatar
            avatarUrl={session?.user.avatarUrl ?? null}
            name={session?.user.displayName ?? '我'}
            userId={session?.user.id}
            size="small"
          />
          <div>
            <strong>{session?.user.displayName ?? '我'}</strong>
            <span>分享你的绿茵时刻</span>
          </div>
          <span className="post-composer__visibility">全校可见</span>
        </div>
        <textarea
          data-post-input
          ref={textarea}
          className="post-composer__input"
          aria-label="动态正文"
          placeholder="今天的球场，有什么想分享的？"
          maxLength={500}
          value={body}
          disabled={publishing}
          onChange={(event) => setBody(event.target.value)}
        />
        {images.length > 0 && (
          <div className="post-composer__previews" aria-label="待发布图片">
            {images.map((source, index) => (
              <div className="post-composer__preview" key={index}>
                <img src={source} alt={`待发布图片 ${index + 1}`} />
                {source.startsWith('data:image/gif') && (
                  <span className="post-composer__gif">GIF</span>
                )}
                <button
                  type="button"
                  aria-label={`删除第 ${index + 1} 张图片`}
                  disabled={publishing || processing}
                  onClick={() =>
                    setImages((current) => current.filter((_, item) => item !== index))
                  }
                >
                  <PostIcon name="close" />
                </button>
              </div>
            ))}
            {images.length < MAX_POST_IMAGES && (
              <button
                type="button"
                className="post-composer__add"
                aria-label="继续添加图片"
                disabled={publishing || processing}
                onClick={() => input.current?.click()}
              >
                <PostIcon name="plus" />
                <span>添加</span>
              </button>
            )}
          </div>
        )}
        <input
          className="post-file-input"
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          aria-label="选择动态图片"
          disabled={publishing || processing}
          onChange={async (event) => {
            const files = Array.from(event.currentTarget.files ?? [])
            event.currentTarget.value = ''
            if (!files.length) return
            if (images.length + files.length > MAX_POST_IMAGES) {
              setError('每条动态最多 9 张图片，请重新选择')
              return
            }
            setProcessing(true)
            setError('')
            const next: string[] = []
            const failures: string[] = []
            for (const file of files) {
              try {
                next.push(await prepareDesktopPostImage(file))
              } catch (issue) {
                failures.push(
                  `${file.name}：${issue instanceof Error ? issue.message : '读取失败'}`,
                )
              }
            }
            if (
              [...images, ...next].reduce((sum, source) => sum + source.length, 0) >
              MAX_POST_DATA_LENGTH
            ) {
              setError('图片总大小过大，请减少图片或选择较小的 GIF')
            } else {
              setImages((current) => [...current, ...next])
              setError(failures.join('；'))
            }
            setProcessing(false)
          }}
        />
        {error && (
          <p className="post-error" role="alert">
            {error}
          </p>
        )}
        <div className="post-composer__toolbar">
          <div className="post-composer__tools">
            <EmojiPicker
              disabled={publishing}
              onSelect={(emoji) => insertAtCursor(textarea.current, body, emoji, 500, setBody)}
            />
            <button
              type="button"
              className="post-tool"
              title="图片 / GIF"
              aria-label="添加图片或 GIF"
              disabled={publishing || processing || images.length >= MAX_POST_IMAGES}
              onClick={() => input.current?.click()}
            >
              <PostIcon name="photo" />
            </button>
            <span>{processing ? '正在处理图片…' : `图片 / GIF · ${images.length}/9`}</span>
          </div>
          <span className="post-composer__counter">{body.length}/500</span>
        </div>
        <PostTagPicker
          tags={tags}
          onChange={setTags}
          disabled={publishing || processing}
          tournamentId={tournamentId}
          onPendingChange={setTagResolving}
        />
        <footer className="post-composer__footer">
          <span>让每一个绿茵时刻被看见</span>
          <button
            type="button"
            className="post-submit"
            disabled={!canPublish}
            onClick={() => void publish()}
          >
            {publishing ? '正在发布…' : '发布动态'}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
