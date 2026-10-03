import Taro from '@tarojs/taro'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { OPEN_POST_EVENT, updatePostInteraction } from '../../features/product/post-navigation.h5'
import {
  createClientActionId,
  productRepository,
  resolveMediaUrl,
} from '../../features/product/product.repository'
import { formatRelativeTime } from '../../features/product/product.format'
import { readSession } from '../../features/product/session'
import type {
  PostComment,
  PostDetail,
  ReportTargetType,
} from '../../features/product/product.types'
import { UserAvatar } from '../product-ui'
import { PersonTrigger } from '../person-trigger'
import { VerificationBadge } from '../verification-badge'
import { useOverlayFocus } from '../overlay-focus'
import { ReportModal } from '../report-modal'
import { openMessaging } from '../messaging-drawer'
import { EmojiPicker, EmojiText, insertAtCursor } from '../post-social/emoji-picker'
import { PostGallery } from '../post-social/gallery'
import { PostIcon } from '../post-social/icons'
import { PostTags } from '../post-tags'
import { OPEN_TEAM_EVENT } from '../../features/product/team-navigation.h5'
import '../post-social/index.h5.scss'

export function PostOverlayHost() {
  const [postId, setPostId] = useState<string | null>(null)
  useEffect(() => {
    const open = (event: Event) => {
      const id = (event as CustomEvent<unknown>).detail
      if (typeof id === 'string' && id.length > 0 && id.length < 150) setPostId(id)
    }
    window.addEventListener(OPEN_POST_EVENT, open)
    const close = () => setPostId(null)
    window.addEventListener(OPEN_TEAM_EVENT, close)
    window.addEventListener('hashchange', close)
    window.addEventListener('popstate', close)
    return () => {
      window.removeEventListener(OPEN_POST_EVENT, open)
      window.removeEventListener(OPEN_TEAM_EVENT, close)
      window.removeEventListener('hashchange', close)
      window.removeEventListener('popstate', close)
    }
  }, [])
  return postId ? (
    <PostOverlay key={postId} postId={postId} onClose={() => setPostId(null)} />
  ) : null
}

function groupComments(comments: PostComment[]) {
  const byId = new Map(comments.map((comment) => [comment.id, comment]))
  const threads = new Map<string, { root: PostComment; replies: PostComment[] }>()
  for (const comment of comments) {
    let root = comment
    const seen = new Set([comment.id])
    while (
      root.parentCommentId &&
      byId.has(root.parentCommentId) &&
      !seen.has(root.parentCommentId)
    ) {
      seen.add(root.parentCommentId)
      root = byId.get(root.parentCommentId)!
    }
    const thread = threads.get(root.id) ?? { root, replies: [] }
    if (comment.id !== root.id) thread.replies.push(comment)
    threads.set(root.id, thread)
  }
  return { threads: [...threads.values()], byId }
}

function PostOverlay({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [post, setPost] = useState<PostDetail | null>(null)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<PostComment | null>(null)
  const [sending, setSending] = useState(false)
  const [liking, setLiking] = useState(false)
  const [error, setError] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [report, setReport] = useState<{
    type: ReportTargetType
    id: string
    title: string
  } | null>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const busy = useRef(false)
  const likeBusy = useRef(false)
  const pending = useRef<{ signature: string; id: string } | null>(null)
  const close = () => {
    if (!busy.current) onClose()
  }
  useOverlayFocus(!report, '.post-detail-modal', close)
  useEffect(() => {
    let active = true
    setLoadError('')
    void productRepository
      .getPost(postId)
      .then((result) => {
        if (active) {
          setPost(result)
          updatePostInteraction(result)
        }
      })
      .catch((issue) => {
        if (active) setLoadError(issue instanceof Error ? issue.message : '动态读取失败')
      })
    return () => {
      active = false
    }
  }, [postId, reload])
  const images = useMemo(
    () =>
      (post?.imageUrls ?? (post?.imageUrl ? [post.imageUrl] : []))
        .map((source) => resolveMediaUrl(source) ?? '')
        .filter(Boolean),
    [post?.imageUrl, post?.imageUrls],
  )
  const { threads, byId } = useMemo(() => groupComments(post?.comments ?? []), [post?.comments])
  const signedIn = Boolean(readSession())
  const reply = (comment: PostComment) => {
    setReplyTo(comment)
    textarea.current?.focus()
  }
  const toggleLike = async () => {
    if (!post || likeBusy.current) return
    if (!signedIn) {
      setError('登录后可以点赞和评论')
      return
    }
    likeBusy.current = true
    setLiking(true)
    setError('')
    try {
      const result = await productRepository.setLike(post.id, !post.likedByMe)
      setPost((current) =>
        current ? { ...current, likedByMe: result.liked, likeCount: result.likeCount } : current,
      )
      updatePostInteraction({ ...post, likedByMe: result.liked, likeCount: result.likeCount })
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '点赞失败，请重试')
    } finally {
      likeBusy.current = false
      setLiking(false)
    }
  }
  useEffect(() => {
    if (post) updatePostInteraction(post)
  }, [post])
  const sendComment = async () => {
    if (!post || !body.trim() || busy.current || !signedIn) return
    busy.current = true
    setSending(true)
    setError('')
    const signature = JSON.stringify([post.id, replyTo?.id, body.trim()])
    if (pending.current?.signature !== signature)
      pending.current = { signature, id: createClientActionId('comment') }
    try {
      const created = await productRepository.createComment(
        post.id,
        body.trim(),
        pending.current.id,
        replyTo?.id,
      )
      setPost((current) =>
        current && !current.comments.some((item) => item.id === created.id)
          ? {
              ...current,
              commentCount: current.commentCount + 1,
              comments: [...current.comments, created],
            }
          : current,
      )
      if (replyTo) {
        let root = replyTo
        const visited = new Set([root.id])
        while (
          root.parentCommentId &&
          byId.has(root.parentCommentId) &&
          !visited.has(root.parentCommentId)
        ) {
          visited.add(root.parentCommentId)
          root = byId.get(root.parentCommentId)!
        }
        setExpanded((current) => new Set([...current, root.id]))
      }
      setBody('')
      setReplyTo(null)
      pending.current = null
      requestAnimationFrame(() =>
        document.getElementById('post-comment-' + created.id)?.scrollIntoView({ block: 'nearest' }),
      )
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '评论发布失败，请重试')
    } finally {
      busy.current = false
      setSending(false)
    }
  }
  const authorMessage = (author: PostComment['author']) => {
    onClose()
    openMessaging({ id: author.id, displayName: author.displayName, avatarUrl: author.avatarUrl })
  }
  const renderComment = (comment: PostComment, nested: boolean) => (
    <article
      className={`post-comment ${nested ? 'post-comment--reply' : ''}`}
      id={'post-comment-' + comment.id}
      key={comment.id}
    >
      <UserAvatar
        avatarUrl={comment.author.avatarUrl}
        name={comment.author.displayName}
        userId={comment.author.id}
        tournamentId={post?.tournamentId}
        size="small"
      />
      <div className="post-comment__copy">
        <div className="post-comment__head">
          <PersonTrigger
            userId={comment.author.id}
            tournamentId={post?.tournamentId}
            name={comment.author.displayName}
          >
            <strong>{comment.author.displayName}</strong>
          </PersonTrigger>
          <VerificationBadge
            level={comment.author.verificationLevel}
            roles={comment.author.roles}
            official={comment.author.official}
          />
          {post?.author.id === comment.author.id && (
            <span className="post-comment__author-label">作者</span>
          )}
          {signedIn && (
            <button
              type="button"
              className="post-comment__more"
              aria-label={`评论操作：${comment.author.displayName}`}
              aria-expanded={menu === comment.id}
              onClick={() => setMenu(menu === comment.id ? null : comment.id)}
            >
              <PostIcon name="more" />
            </button>
          )}
        </div>
        <p>
          {nested &&
            comment.parentCommentId &&
            byId.get(comment.parentCommentId)?.parentCommentId && (
              <span className="post-comment__reply-name">
                回复{' '}
                <PersonTrigger
                  userId={byId.get(comment.parentCommentId)?.author.id}
                  name={byId.get(comment.parentCommentId)?.author.displayName ?? '用户'}
                >
                  {byId.get(comment.parentCommentId)?.author.displayName}
                </PersonTrigger>
                ：
              </span>
            )}
          <EmojiText>{comment.body}</EmojiText>
        </p>
        <div className="post-comment__meta">
          <time>{formatRelativeTime(comment.createdAt)}</time>
          <button type="button" disabled={!signedIn || sending} onClick={() => reply(comment)}>
            回复
          </button>
        </div>
        {menu === comment.id && (
          <div className="post-comment__menu">
            {comment.author.messageable && (
              <button type="button" onClick={() => authorMessage(comment.author)}>
                私聊
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setReport({ type: 'COMMENT', id: comment.id, title: '投诉这条评论' })
                setMenu(null)
              }}
            >
              投诉
            </button>
          </div>
        )}
      </div>
    </article>
  )
  return createPortal(
    <div
      className="post-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <section
        className={`post-detail-modal ${post && images.length === 0 ? 'post-detail-modal--text' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-detail-title"
      >
        <button
          type="button"
          className="post-detail-modal__close post-tool"
          aria-label="关闭动态详情"
          disabled={sending}
          onClick={close}
        >
          <PostIcon name="close" />
        </button>
        {!post ? (
          <div className="post-detail-modal__state" role="status">
            <h2 id="post-detail-title">{loadError ? '动态暂时无法读取' : '正在读取动态…'}</h2>
            {loadError && (
              <>
                <p>{loadError}</p>
                <button
                  type="button"
                  className="post-submit"
                  onClick={() => setReload((current) => current + 1)}
                >
                  重试
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {images.length > 0 && (
              <div className="post-detail-modal__media">
                <PostGallery images={images} />
              </div>
            )}
            <div className="post-detail-modal__discussion">
              <div className="post-detail-modal__scroll">
                <header className="post-detail-modal__author">
                  <UserAvatar
                    avatarUrl={post.author.avatarUrl}
                    name={post.author.displayName}
                    userId={post.author.id}
                    tournamentId={post.tournamentId}
                    size="small"
                  />
                  <div>
                    <PersonTrigger
                      userId={post.author.id}
                      tournamentId={post.tournamentId}
                      name={post.author.displayName}
                    >
                      <strong>{post.author.displayName}</strong>
                    </PersonTrigger>
                    <VerificationBadge
                      level={post.author.verificationLevel}
                      roles={post.author.roles}
                      official={post.author.official}
                    />
                  </div>
                  {signedIn && post.author.messageable && (
                    <button
                      type="button"
                      className="post-detail-modal__message"
                      onClick={() => authorMessage(post.author)}
                    >
                      私聊
                    </button>
                  )}
                </header>
                <div className="post-detail-modal__body">
                  {post.title && <h2 id="post-detail-title">{post.title}</h2>}
                  {!post.title && (
                    <h2 id="post-detail-title" className="post-sr-only">
                      绿茵动态详情
                    </h2>
                  )}
                  <p>
                    <EmojiText>{post.body}</EmojiText>
                  </p>
                  <PostTags tags={post.tags} tournamentId={post.tournamentId} />
                  <div className="post-detail-modal__meta">
                    <time>{formatRelativeTime(post.publishedAt)}</time>
                    {post.type === 'OFFICIAL' && <span>官方发布</span>}
                    {signedIn && (
                      <button
                        type="button"
                        onClick={() =>
                          setReport({ type: 'POST', id: post.id, title: '投诉这条动态' })
                        }
                      >
                        投诉
                      </button>
                    )}
                  </div>
                </div>
                <div className="post-detail-modal__comments-heading">
                  全部评论 <span>{post.commentCount}</span>
                </div>
                <div className="post-comment-list">
                  {threads.length === 0 && (
                    <div className="post-comment-list__empty">
                      <PostIcon name="comment" />
                      <p>还没有评论，来聊聊这场球吧</p>
                    </div>
                  )}
                  {threads.map((thread) => (
                    <div className="post-comment-thread" key={thread.root.id}>
                      {renderComment(thread.root, false)}
                      {(expanded.has(thread.root.id)
                        ? thread.replies
                        : thread.replies.slice(0, 2)
                      ).map((comment) => renderComment(comment, true))}
                      {thread.replies.length > 2 && (
                        <button
                          type="button"
                          className="post-comment-thread__expand"
                          onClick={() =>
                            setExpanded((current) => {
                              const next = new Set(current)
                              if (next.has(thread.root.id)) next.delete(thread.root.id)
                              else next.add(thread.root.id)
                              return next
                            })
                          }
                        >
                          {expanded.has(thread.root.id)
                            ? '收起回复'
                            : `展开 ${thread.replies.length - 2} 条回复`}
                          <PostIcon name={expanded.has(thread.root.id) ? 'left' : 'right'} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <footer className="post-detail-modal__footer">
                <div className="post-detail-modal__interactions">
                  <button
                    type="button"
                    className={`post-detail-modal__like ${post.likedByMe ? 'is-active' : ''}`}
                    aria-label={post.likedByMe ? '取消点赞' : '点赞'}
                    aria-pressed={post.likedByMe}
                    disabled={liking}
                    onClick={() => void toggleLike()}
                  >
                    <PostIcon name="heart" />
                    <span>{post.likeCount}</span>
                  </button>
                  <span>
                    <PostIcon name="comment" />
                    {post.commentCount}
                  </span>
                </div>
                {error && (
                  <p className="post-error" role="alert">
                    {error}
                  </p>
                )}
                {signedIn ? (
                  <div className="post-comment-composer">
                    {replyTo && (
                      <div className="post-comment-composer__reply">
                        回复{' '}
                        <PersonTrigger userId={replyTo.author.id} name={replyTo.author.displayName}>
                          {replyTo.author.displayName}
                        </PersonTrigger>
                        <button
                          type="button"
                          aria-label="取消回复"
                          disabled={sending}
                          onClick={() => setReplyTo(null)}
                        >
                          <PostIcon name="close" />
                        </button>
                      </div>
                    )}
                    <textarea
                      data-post-input
                      ref={textarea}
                      aria-label={replyTo ? `回复 ${replyTo.author.displayName}` : '评论内容'}
                      placeholder={
                        replyTo ? `回复 ${replyTo.author.displayName}…` : '聊聊你的看法…'
                      }
                      maxLength={300}
                      value={body}
                      disabled={sending}
                      onChange={(event) => setBody(event.target.value)}
                      onKeyDown={(event) => {
                        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                          event.preventDefault()
                          void sendComment()
                        }
                      }}
                    />
                    <div className="post-comment-composer__tools">
                      <EmojiPicker
                        disabled={sending}
                        onSelect={(emoji) =>
                          insertAtCursor(textarea.current, body, emoji, 300, setBody)
                        }
                      />
                      <span>{body.length ? `${body.length}/300` : ''}</span>
                      <button
                        type="button"
                        className="post-submit"
                        disabled={!body.trim() || sending}
                        onClick={() => void sendComment()}
                      >
                        {sending ? '发送中…' : replyTo ? '回复' : '发送'}
                        <PostIcon name="send" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="post-detail-modal__login"
                    onClick={() => {
                      onClose()
                      void Taro.reLaunch({ url: '/pages/login/index' })
                    }}
                  >
                    登录后参与评论
                  </button>
                )}
              </footer>
            </div>
          </>
        )}
      </section>
      {report && (
        <ReportModal
          targetId={report.id}
          targetType={report.type}
          title={report.title}
          onClose={() => setReport(null)}
        />
      )}
    </div>,
    document.body,
  )
}
