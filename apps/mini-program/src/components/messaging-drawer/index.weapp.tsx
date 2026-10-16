import { Button, Text, View } from '@tarojs/components'
import { useCallback, useEffect, useRef, useState } from 'react'
import { NativeDialog } from '../native-ui/index.weapp'
import { UserAvatar } from '../product-ui'
import { productRepository } from '../../features/product/product.repository'
import { formatRelativeTime } from '../../features/product/product.format'
import { readSession } from '../../features/product/session'
import type {
  ConversationListResponse,
  MessageListResponse,
  MessageUser,
  NotificationResponse,
} from '../../features/product/product.types'
import './index.weapp.scss'

type OpenRequest = MessageUser | { conversationId: string } | undefined
const listeners = new Set<(request: OpenRequest) => void>()
export function openMessaging(request?: OpenRequest) {
  for (const listener of listeners) listener(request)
}
export function MessagingDrawer() {
  const [open, setOpen] = useState(false),
    [category, setCategory] = useState<'all' | 'system' | 'private'>('all')
  const [conversations, setConversations] = useState<ConversationListResponse['items']>([])
  const [notifications, setNotifications] = useState<NotificationResponse['items']>([])
  const [thread, setThread] = useState<MessageListResponse | null>(null)
  const [notice, setNotice] = useState<NotificationResponse['items'][number] | null>(null)
  const [loading, setLoading] = useState(false),
    [error, setError] = useState('')
  const sequence = useRef(0)
  const readThread = useCallback(async (id: string) => {
    const ticket = ++sequence.current
    setLoading(true)
    setError('')
    setThread(null)
    setNotice(null)
    try {
      const data = await productRepository.readConversation(id)
      if (ticket === sequence.current) {
        setThread(data)
        setConversations((items) =>
          items.map((item) => (item.id === id ? { ...item, unreadCount: 0 } : item)),
        )
      }
    } catch (reason) {
      if (ticket === sequence.current)
        setError(reason instanceof Error ? reason.message : '私信读取失败')
    } finally {
      if (ticket === sequence.current) setLoading(false)
    }
  }, [])
  const load = useCallback(
    async (request?: OpenRequest) => {
      const ticket = ++sequence.current
      setOpen(true)
      setLoading(true)
      setError('')
      setThread(null)
      setNotice(null)
      setCategory('all')
      const account = readSession()?.user.id
      try {
        const [list, system] = await Promise.all([
          productRepository.getConversations(),
          productRepository.getNotifications(),
        ])
        if (ticket !== sequence.current || readSession()?.user.id !== account) return
        setConversations(list.items)
        setNotifications(system.items)
        if (request) {
          const existing = list.items.find((item) =>
            'conversationId' in request
              ? item.id === request.conversationId
              : item.counterpart.id === request.id,
          )
          if (existing) {
            await readThread(existing.id)
            return
          }
          if ('conversationId' in request) {
            await readThread(request.conversationId)
            return
          }
          setCategory('private')
        }
      } catch (reason) {
        if (ticket === sequence.current)
          setError(reason instanceof Error ? reason.message : '信箱读取失败')
      } finally {
        if (ticket === sequence.current) setLoading(false)
      }
    },
    [readThread],
  )
  useEffect(() => {
    const listener = (request: OpenRequest) => {
      void load(request)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      sequence.current++
    }
  }, [load])
  const close = () => {
    sequence.current++
    setOpen(false)
  }
  const readNotice = async (item: NotificationResponse['items'][number]) => {
    setNotice(item)
    if (item.readAt) return
    const ticket = sequence.current
    try {
      const result = await productRepository.readNotification(item.id)
      if (ticket === sequence.current) setNotifications(result.items)
    } catch (reason) {
      if (ticket === sequence.current)
        setError(reason instanceof Error ? reason.message : '已读状态更新失败')
    }
  }
  if (!open) return null
  return (
    <NativeDialog
      title={thread?.conversation.counterpart.displayName ?? (notice ? '系统通知' : '信箱')}
      onClose={close}
    >
      {(thread || notice) && (
        <Button
          className="native-mail-back native-button native-button--quiet"
          onClick={() => {
            sequence.current++
            setThread(null)
            setNotice(null)
            setError('')
            setLoading(false)
          }}
        >
          <View />
          信箱
        </Button>
      )}
      {error && (
        <View className="native-mail-error">
          <Text className="native-error">{error}</Text>
          <Button className="native-button" onClick={() => void load()}>
            重试
          </Button>
        </View>
      )}
      {loading && <Text className="native-note">正在读取消息</Text>}
      {thread ? (
        <View className="native-mail-thread">
          {thread.items.length ? (
            thread.items.map((message) => (
              <View
                key={message.id}
                className={`native-mail-message${message.isMine ? ' is-mine' : ''}`}
              >
                <Text>{formatRelativeTime(message.createdAt)}</Text>
                <View>
                  <Text>{message.body}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text className="native-note">暂无私信记录</Text>
          )}
        </View>
      ) : notice ? (
        <View className="native-mail-notice">
          <Text>{notice.title}</Text>
          <Text>{formatRelativeTime(notice.createdAt)}</Text>
          <Text>{notice.body || notice.title}</Text>
        </View>
      ) : (
        !loading && (
          <>
            <View className="native-segment native-mail-tabs">
              {(
                [
                  { id: 'all', title: '全部' },
                  { id: 'system', title: '系统' },
                  { id: 'private', title: '私信' },
                ] as const
              ).map((item) => (
                <Button
                  key={item.id}
                  className={category === item.id ? 'is-active' : ''}
                  onClick={() => setCategory(item.id)}
                >
                  {item.title}
                </Button>
              ))}
            </View>
            {category !== 'private' &&
              notifications.map((item) => (
                <Button
                  key={item.id}
                  className={`native-mail-row${item.readAt ? '' : ' is-unread'}`}
                  onClick={() => void readNotice(item)}
                >
                  <View className="native-mail-system-icon" />
                  <View>
                    <View>
                      <Text>{item.title}</Text>
                      <Text>{formatRelativeTime(item.createdAt)}</Text>
                    </View>
                    <Text>{item.body || '系统通知'}</Text>
                  </View>
                </Button>
              ))}
            {category !== 'system' &&
              conversations.map((item) => (
                <Button
                  key={item.id}
                  className={`native-mail-row${item.unreadCount ? ' is-unread' : ''}`}
                  onClick={() => void readThread(item.id)}
                >
                  <UserAvatar
                    name={item.counterpart.displayName}
                    avatarUrl={item.counterpart.avatarUrl}
                    size="small"
                  />
                  <View>
                    <View>
                      <Text>{item.counterpart.displayName}</Text>
                      <Text>
                        {item.lastMessageAt ? formatRelativeTime(item.lastMessageAt) : ''}
                      </Text>
                    </View>
                    <Text>{item.latestMessage?.body || '暂无私信'}</Text>
                  </View>
                </Button>
              ))}
            {((category === 'system' && !notifications.length) ||
              (category === 'private' && !conversations.length) ||
              (category === 'all' && !notifications.length && !conversations.length)) && (
              <Text className="native-note native-mail-empty">暂无消息</Text>
            )}
          </>
        )
      )}
    </NativeDialog>
  )
}
