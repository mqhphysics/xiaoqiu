import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PostIcon } from '../post-social/icons'

import { UserAvatar } from '../product-ui'
import { createClientActionId, productRepository } from '../../features/product/product.repository'
import type {
  ConversationListResponse,
  MessageListResponse,
  MessageUser,
} from '../../features/product/product.types'
import { useOverlayFocus } from '../overlay-focus'
import { ReportModal } from '../report-modal'
import { IconButton } from '../icon-button'
import { readSession } from '../../features/product/session'

import './index.scss'
import './index.h5.scss'

type OpenRequest = MessageUser | { conversationId: string } | { chooseRecipient: true } | undefined
const listeners = new Set<(user: OpenRequest) => void>()

export function openMessaging(
  request?: MessageUser | { conversationId: string } | { chooseRecipient: true },
) {
  for (const listener of listeners) listener(request)
}

// PublicShell keeps its native host; the H5 host lives once at App level so
// preserved route pages cannot open duplicate drawers for a single event.
export function MessagingDrawer() {
  return null
}

export function MessagingOverlayHost() {
  const viewerId = readSession()?.user.id ?? null
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 721px)').matches)
  const [open, setOpen] = useState(false)
  const [chooseRecipient, setChooseRecipient] = useState(false)
  const [directory, setDirectory] = useState<MessageUser[]>([])
  const [conversations, setConversations] = useState<ConversationListResponse['items']>([])
  const [selected, setSelected] = useState<MessageUser | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageListResponse['items']>([])
  const [body, setBody] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [listError, setListError] = useState('')
  const [threadError, setThreadError] = useState('')
  const [threadLoading, setThreadLoading] = useState(false)
  const sendBusy = useRef(false)
  const historyRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const [reportTarget, setReportTarget] = useState<{ id: string; body: string } | null>(null)
  const selectionRequestRef = useRef(0)
  const directoryRequestRef = useRef(0)
  const selectedIdRef = useRef<string | null>(null)
  const queryRef = useRef('')
  const openRequestRef = useRef(0)
  const [pendingMessage, setPendingMessage] = useState<{
    body: string
    clientMessageId: string
    recipientUserId: string
  } | null>(null)
  const closeDrawer = useCallback(() => {
    openRequestRef.current += 1
    selectionRequestRef.current += 1
    directoryRequestRef.current += 1
    setThreadLoading(false)
    setLoading(false)
    setOpen(false)
  }, [])
  useOverlayFocus(open && !reportTarget, '.message-drawer', closeDrawer)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 721px)')
    const changed = () => setDesktop(media.matches)
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])
  useEffect(() => {
    closeDrawer()
    selectedIdRef.current = null
    setSelected(null)
    setConversationId(null)
    setDirectory([])
    setConversations([])
    setMessages([])
    setBody('')
    setPendingMessage(null)
    setReportTarget(null)
  }, [viewerId, closeDrawer])
  useEffect(() => {
    document.body.classList.toggle('xiaoqiu-messaging-open', open)
    return () => document.body.classList.remove('xiaoqiu-messaging-open')
  }, [open])

  useEffect(() => {
    selectedIdRef.current = selected?.id ?? null
    nearBottomRef.current = true
  }, [selected])

  useEffect(() => {
    if (!open || !nearBottomRef.current) return
    const frame = requestAnimationFrame(() => {
      const element = historyRef.current
      if (element) element.scrollTop = element.scrollHeight
    })
    return () => cancelAnimationFrame(frame)
  }, [messages, open, selected?.id])

  useEffect(() => {
    queryRef.current = query
  }, [query])

  const loadLists = useCallback(async () => {
    const [people, list] = await Promise.all([
      productRepository.getMessageDirectory(),
      productRepository.getConversations(),
    ])
    if (!queryRef.current.trim()) setDirectory(people.items)
    setConversations(list.items)
    setListError('')
    return list.items
  }, [])

  const selectConversation = useCallback(async (id: string, user: MessageUser, silent = false) => {
    if (silent && selectedIdRef.current !== user.id) return
    const requestId = ++selectionRequestRef.current
    if (!silent) {
      if (selectedIdRef.current !== user.id) {
        setBody('')
        setPendingMessage(null)
      }
      selectedIdRef.current = user.id
      setSelected(user)
      setConversationId(id)
      setMessages([])
      setLoading(true)
      setThreadLoading(true)
      setThreadError('')
    }
    try {
      const data = await productRepository.readConversation(id)
      if (selectionRequestRef.current !== requestId) return
      setMessages(data.items)
    } catch (error) {
      if (selectionRequestRef.current !== requestId || silent) return
      setThreadError(error instanceof Error ? error.message : '会话加载失败，请重试')
      await Taro.showToast({
        title: error instanceof Error ? error.message : '会话加载失败',
        icon: 'none',
      })
    } finally {
      if (!silent && selectionRequestRef.current === requestId) {
        setLoading(false)
        setThreadLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const listener = (user: OpenRequest) => {
      const openRequestId = ++openRequestRef.current
      setOpen(true)
      setChooseRecipient(Boolean(user && 'chooseRecipient' in user))
      setQuery('')
      setLoading(true)
      setListError('')
      setThreadError('')
      if (user) {
        selectionRequestRef.current += 1
        selectedIdRef.current = null
        setSelected(null)
        setConversationId(null)
        setMessages([])
        setBody('')
        setPendingMessage(null)
      }
      void loadLists()
        .then(async (items) => {
          if (openRequestRef.current !== openRequestId) return
          if (!user || 'chooseRecipient' in user) {
            if (!user && !selectedIdRef.current && items[0])
              return selectConversation(items[0].id, items[0].counterpart)
            return
          }
          const existing = items.find((item) =>
            'conversationId' in user
              ? item.id === user.conversationId
              : item.counterpart.id === user.id,
          )
          if (existing) return selectConversation(existing.id, existing.counterpart)
          if ('conversationId' in user) {
            const requestId = ++selectionRequestRef.current
            const data = await productRepository.readConversation(user.conversationId)
            if (
              openRequestRef.current !== openRequestId ||
              selectionRequestRef.current !== requestId
            )
              return
            selectedIdRef.current = data.conversation.counterpart.id
            setSelected(data.conversation.counterpart)
            setConversationId(data.conversation.id)
            setMessages(data.items)
            return
          }
          selectedIdRef.current = user.id
          setSelected(user)
          setConversationId(null)
          setMessages([])
        })
        .catch((error) => {
          if (openRequestRef.current !== openRequestId) return undefined
          setListError(error instanceof Error ? error.message : '私信加载失败，请重试')
          return Taro.showToast({
            title: error instanceof Error ? error.message : '私信加载失败',
            icon: 'none',
          })
        })
        .finally(() => {
          if (openRequestRef.current === openRequestId) setLoading(false)
        })
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [loadLists, selectConversation])

  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => {
      void productRepository
        .getConversations()
        .then((data) => setConversations(data.items))
        .catch(() => undefined)
      if (conversationId && selected) void selectConversation(conversationId, selected, true)
    }, 5000)
    return () => clearInterval(timer)
  }, [conversationId, loadLists, open, selectConversation, selected])

  useEffect(() => {
    if (!open) return
    const requestId = ++directoryRequestRef.current
    const timer = setTimeout(() => {
      void productRepository
        .getMessageDirectory(query)
        .then((data) => {
          if (directoryRequestRef.current === requestId) {
            setDirectory(data.items)
            setListError('')
          }
        })
        .catch(async (error) => {
          if (directoryRequestRef.current !== requestId) return
          setListError(error instanceof Error ? error.message : '用户搜索失败，请重试')
          await Taro.showToast({
            title: error instanceof Error ? error.message : '用户搜索失败',
            icon: 'none',
          })
        })
    }, 220)
    return () => clearTimeout(timer)
  }, [open, query])

  const send = async () => {
    if (!selected || !body.trim() || sendBusy.current) return
    sendBusy.current = true
    nearBottomRef.current = true
    const text = body.trim()
    const request =
      pendingMessage?.recipientUserId === selected.id && pendingMessage.body === text
        ? pendingMessage
        : {
            body: text,
            clientMessageId: createClientActionId('message'),
            recipientUserId: selected.id,
          }
    setPendingMessage(request)
    setSending(true)
    setBody('')
    try {
      const result = await productRepository.sendMessage(
        request.recipientUserId,
        text,
        request.clientMessageId,
      )
      setPendingMessage(null)
      try {
        if (selectedIdRef.current === request.recipientUserId) {
          setConversationId(result.conversationId)
          await selectConversation(result.conversationId, selected, true)
        }
        await loadLists()
      } catch {
        await Taro.showToast({ title: '消息已发送，列表刷新稍后重试', icon: 'none' })
      }
    } catch (error) {
      if (selectedIdRef.current === request.recipientUserId) setBody(text)
      await Taro.showToast({
        title: error instanceof Error ? error.message : '发送失败',
        icon: 'none',
      })
    } finally {
      sendBusy.current = false
      setSending(false)
    }
  }

  if (!open) return null
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  const filtered = normalized
    ? directory.filter((user) => user.displayName.toLocaleLowerCase('zh-CN').includes(normalized))
    : directory
  const visibleUsers = normalized
    ? filtered
    : chooseRecipient
      ? directory
      : conversations.length > 0
        ? conversations.map((item) => item.counterpart)
        : directory
  if (desktop) {
    const contacts =
      selected && !visibleUsers.some((user) => user.id === selected.id) && !normalized
        ? [selected, ...visibleUsers]
        : visibleUsers
    const conversationsByUser = new Map(conversations.map((item) => [item.counterpart.id, item]))
    const selectUser = (user: MessageUser) => {
      const conversation = conversationsByUser.get(user.id)
      if (conversation) {
        void selectConversation(conversation.id, user)
        return
      }
      selectionRequestRef.current += 1
      selectedIdRef.current = user.id
      setBody('')
      setPendingMessage(null)
      setSelected(user)
      setConversationId(null)
      setMessages([])
      setThreadLoading(false)
      setThreadError('')
    }
    return createPortal(
      <div className="message-layer message-layer--desktop">
        <section
          className="message-drawer message-drawer--desktop"
          role="dialog"
          aria-label="私信"
          tabIndex={-1}
        >
          <header className="dm-head">
            <div>
              <PostIcon name="comment" />
              <h2>消息</h2>
              <span>校园里的对话，从这里开始</span>
            </div>
            <button type="button" aria-label="关闭私信" onClick={closeDrawer}>
              <PostIcon name="close" />
            </button>
          </header>
          <div className="dm-workspace">
            <aside className="dm-sidebar">
              <label className="dm-search">
                <PostIcon name="comment" />
                <input
                  aria-label="搜索校内用户"
                  placeholder="搜索校内用户"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="dm-sidebar__label">
                {normalized
                  ? '搜索结果'
                  : chooseRecipient
                    ? '校内用户'
                    : conversations.length
                      ? '最近对话'
                      : '校内用户'}
                <span>{contacts.length}</span>
              </div>
              {listError && (
                <div className="dm-error" role="alert">
                  {listError}
                  <button
                    type="button"
                    onClick={() => {
                      setLoading(true)
                      void loadLists()
                        .catch((error) =>
                          setListError(error instanceof Error ? error.message : '读取失败'),
                        )
                        .finally(() => setLoading(false))
                    }}
                  >
                    重试
                  </button>
                </div>
              )}
              <div className="dm-contacts">
                {contacts.map((user) => {
                  const conversation = conversationsByUser.get(user.id)
                  return (
                    <button
                      type="button"
                      key={user.id}
                      className={`dm-contact ${selected?.id === user.id ? 'is-selected' : ''}`}
                      aria-pressed={selected?.id === user.id}
                      disabled={sending}
                      onClick={() => selectUser(user)}
                    >
                      <UserAvatar avatarUrl={user.avatarUrl} name={user.displayName} size="small" />
                      <div className="dm-contact__copy">
                        <div>
                          <strong>{user.displayName}</strong>
                          <time>
                            {conversation?.lastMessageAt
                              ? messageTime(conversation.lastMessageAt, true)
                              : ''}
                          </time>
                        </div>
                        <p>
                          {conversation?.latestMessage
                            ? `${conversation.latestMessage.isMine ? '我：' : ''}${conversation.latestMessage.body}`
                            : '开始一段新对话'}
                        </p>
                      </div>
                      {(conversation?.unreadCount ?? 0) > 0 && (
                        <span
                          className="dm-unread"
                          aria-label={`${conversation!.unreadCount} 条未读`}
                        >
                          {conversation!.unreadCount > 99 ? '99+' : conversation!.unreadCount}
                        </span>
                      )}
                    </button>
                  )
                })}
                {!contacts.length && (
                  <div className="dm-empty" role="status">
                    {loading
                      ? '正在读取联系人'
                      : normalized
                        ? '没有找到这个名字'
                        : '暂无可私信用户'}
                  </div>
                )}
              </div>
            </aside>
            <div className="dm-thread">
              {selected ? (
                <>
                  <header className="dm-thread__head">
                    <UserAvatar
                      name={selected.displayName}
                      avatarUrl={selected.avatarUrl}
                      size="small"
                    />
                    <div>
                      <strong>{selected.displayName}</strong>
                      <span>校内私信</span>
                    </div>
                  </header>
                  <div
                    className="dm-history"
                    role="log"
                    aria-label="对话记录"
                    aria-live="polite"
                    ref={historyRef}
                    onScroll={(event) => {
                      const element = event.currentTarget
                      nearBottomRef.current =
                        element.scrollHeight - element.scrollTop - element.clientHeight < 64
                    }}
                  >
                    {threadLoading ? (
                      <div className="dm-empty" role="status">
                        正在读取对话
                      </div>
                    ) : threadError ? (
                      <div className="dm-error" role="alert">
                        {threadError}
                        <button
                          type="button"
                          onClick={() => {
                            if (conversationId) void selectConversation(conversationId, selected)
                          }}
                        >
                          重试
                        </button>
                      </div>
                    ) : messages.length ? (
                      messages.map((message, index) => (
                        <div key={message.id}>
                          {(index === 0 ||
                            new Date(message.createdAt).getTime() -
                              new Date(messages[index - 1]!.createdAt).getTime() >
                              300000) && (
                            <time className="dm-time">{messageTime(message.createdAt)}</time>
                          )}
                          <div className={`dm-message ${message.isMine ? 'is-mine' : ''}`}>
                            <UserAvatar
                              name={message.isMine ? '我' : selected.displayName}
                              avatarUrl={message.isMine ? null : selected.avatarUrl}
                              size="small"
                            />
                            <div>
                              <p>{message.body}</p>
                              <div className="dm-message__meta">
                                <time>
                                  {new Date(message.createdAt).toLocaleTimeString('zh-CN', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </time>
                                {message.isMine ? (
                                  <span>{message.readAt ? '已读' : '已发送'}</span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setReportTarget({ id: message.id, body: message.body })
                                    }
                                  >
                                    投诉
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="dm-welcome">
                        <PostIcon name="comment" />
                        <strong>和{selected.displayName}打个招呼</strong>
                        <p>聊聊比赛，或者约一场球。</p>
                      </div>
                    )}
                  </div>
                  <form
                    className="dm-compose"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void send()
                    }}
                  >
                    <textarea
                      aria-label="输入私信"
                      placeholder={`发消息给${selected.displayName}…`}
                      maxLength={2000}
                      disabled={sending || threadLoading || Boolean(threadError)}
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          event.key === 'Enter' &&
                          !event.shiftKey &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault()
                          void send()
                        }
                      }}
                    />
                    <div>
                      <span>Enter 发送 · Shift + Enter 换行</span>
                      <button
                        type="submit"
                        disabled={!body.trim() || sending || threadLoading || Boolean(threadError)}
                      >
                        <PostIcon name="send" />
                        {sending ? '发送中' : '发送'}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="dm-welcome">
                  <PostIcon name="comment" />
                  <strong>选择一个人，开始对话</strong>
                  <p>在左侧选择联系人，或搜索校内用户。</p>
                </div>
              )}
            </div>
          </div>
        </section>
        {reportTarget && (
          <ReportModal
            targetId={reportTarget.id}
            targetType="DIRECT_MESSAGE"
            title={`投诉私信：${reportTarget.body.slice(0, 18)}`}
            onClose={() => setReportTarget(null)}
          />
        )}
      </div>,
      document.body,
    )
  }
  return (
    <View className="message-layer">
      <View className="message-scrim" onClick={closeDrawer} />
      <View aria-modal role="dialog" aria-label="私信" className="message-drawer">
        <View className="message-drawer__head">
          <View>
            <Text className="message-drawer__kicker">MESSAGES</Text>
            <Text className="message-drawer__title">私信</Text>
          </View>
          <IconButton
            icon="close"
            aria-label="关闭私信"
            className="message-drawer__close"
            onClick={closeDrawer}
          >
            ×
          </IconButton>
        </View>
        <View className="message-drawer__body">
          <View className="message-sidebar">
            <Input
              className="message-search"
              placeholder="搜索校内用户"
              value={query}
              onInput={(event) => setQuery(event.detail.value)}
            />
            <ScrollView className="message-list" scrollY>
              {visibleUsers.map((user) => {
                const conversation = conversations.find((item) => item.counterpart.id === user.id)
                return (
                  <Button
                    disabled={sending}
                    className={`message-contact ${selected?.id === user.id ? 'message-contact--active' : ''}`}
                    key={user.id}
                    onClick={() => {
                      if (conversation) {
                        void selectConversation(conversation.id, conversation.counterpart)
                        return
                      }
                      selectionRequestRef.current += 1
                      selectedIdRef.current = user.id
                      setBody('')
                      setPendingMessage(null)
                      setSelected(user)
                      setConversationId(null)
                      setMessages([])
                    }}
                  >
                    <UserAvatar avatarUrl={user.avatarUrl} name={user.displayName} size="small" />
                    <View>
                      <Text>{user.displayName}</Text>
                      <Text>{conversation?.latestMessage?.body ?? '开始新对话'}</Text>
                    </View>
                    {(conversation?.unreadCount ?? 0) > 0 && (
                      <Text className="message-contact__badge">{conversation!.unreadCount}</Text>
                    )}
                  </Button>
                )
              })}
              {!loading && visibleUsers.length === 0 && (
                <Text className="message-empty">暂无可私信用户</Text>
              )}
            </ScrollView>
          </View>
          <View className="message-thread">
            {selected ? (
              <>
                <View className="message-thread__person">
                  <UserAvatar
                    avatarUrl={selected.avatarUrl}
                    name={selected.displayName}
                    size="small"
                  />
                  <Text>{selected.displayName}</Text>
                </View>
                <ScrollView
                  className="message-bubbles"
                  scrollY
                  {...(messages.at(-1) ? { scrollIntoView: messages.at(-1)!.id } : {})}
                >
                  {messages.map((message) => (
                    <View
                      id={message.id}
                      className={`message-bubble ${message.isMine ? 'message-bubble--mine' : ''}`}
                      key={message.id}
                    >
                      <Text>{message.body}</Text>
                      {!message.isMine && (
                        <Button
                          className="message-bubble__report"
                          onClick={() => setReportTarget({ id: message.id, body: message.body })}
                        >
                          投诉
                        </Button>
                      )}
                    </View>
                  ))}
                  {messages.length === 0 && (
                    <Text className="message-empty">说声你好，开始一段校内对话。</Text>
                  )}
                </ScrollView>
                <View className="message-compose">
                  <Input
                    disabled={sending}
                    confirmType="send"
                    maxlength={2000}
                    placeholder="输入私信"
                    value={body}
                    onConfirm={() => void send()}
                    onInput={(event) => setBody(event.detail.value)}
                  />
                  <Button
                    disabled={!body.trim() || sending}
                    loading={sending}
                    onClick={() => void send()}
                  >
                    发送
                  </Button>
                </View>
              </>
            ) : (
              <Text className="message-empty message-empty--center">选择一个人开始私聊</Text>
            )}
          </View>
        </View>
      </View>
      {reportTarget && (
        <ReportModal
          targetId={reportTarget.id}
          targetType="DIRECT_MESSAGE"
          title={`投诉私信：${reportTarget.body.slice(0, 18)}`}
          onClose={() => setReportTarget(null)}
        />
      )}
    </View>
  )
}

function messageTime(value: string, compact = false) {
  const date = new Date(value)
  const today = date.toDateString() === new Date().toDateString()
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (today) return time
  const day = date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  return compact ? day : `${day} ${time}`
}
