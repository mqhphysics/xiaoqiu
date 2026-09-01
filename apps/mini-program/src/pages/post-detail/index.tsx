import { Button, Text, Textarea, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { UserAvatar } from '../../components/product-ui'
import { formatRelativeTime, verificationLabel } from '../../features/product/product.format'
import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import type { PostDetail } from '../../features/product/product.types'

import './index.scss'

type PageState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; post: PostDetail; tournamentId: string }

export default function PostDetailPage() {
  const postId = getCurrentInstance().router?.params.postId ?? ''
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!postId) {
      setState({ phase: 'failed', message: '缺少动态参数。' })
      return
    }
    setState({ phase: 'loading' })
    try {
      const [post, home] = await Promise.all([
        productRepository.getPost(postId),
        productRepository.getHome(),
      ])
      setState({ phase: 'ready', post, tournamentId: home.tournament.id })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '动态加载失败。',
      })
    }
  }, [postId])

  useEffect(() => {
    void load()
  }, [load])

  const toggleLike = async () => {
    if (state.phase !== 'ready') return
    if (!readSession()) {
      await Taro.showToast({ title: '登录后可以点赞', icon: 'none' })
      await Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    try {
      const result = await productRepository.toggleLike(state.post.id)
      setState({
        ...state,
        post: { ...state.post, likedByMe: result.liked, likeCount: result.likeCount },
      })
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '操作失败',
        icon: 'none',
      })
    }
  }

  const submitComment = async () => {
    if (state.phase !== 'ready' || comment.trim().length < 2 || submitting) return
    if (!readSession()) {
      await Taro.showToast({ title: '登录后可以评论', icon: 'none' })
      await Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    setSubmitting(true)
    try {
      const created = await productRepository.createComment(state.post.id, comment.trim())
      setState({
        ...state,
        post: {
          ...state.post,
          commentCount: state.post.commentCount + 1,
          comments: [...state.post.comments, created],
        },
      })
      setComment('')
      await Taro.showToast({ title: '评论已发布', icon: 'success' })
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '评论失败',
        icon: 'none',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PublicShell
      active="home"
      showBack
      tournamentId={state.phase === 'ready' ? state.tournamentId : undefined}
    >
      {state.phase === 'loading' && <DataState kind="loading" title="正在读取动态" />}
      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="动态不可用"
          description={state.message}
          onRetry={() => void load()}
        />
      )}
      {state.phase === 'ready' && (
        <View className="post-detail-layout">
          <View
            className={
              'post-detail ' + (state.post.type === 'OFFICIAL' ? 'post-detail--official' : '')
            }
          >
            <View className="post-detail__author">
              <UserAvatar name={state.post.author.displayName} />
              <View>
                <View className="post-detail__author-row">
                  <Text>{state.post.author.displayName}</Text>
                  <Text>{verificationLabel(state.post.author.verificationLevel)}</Text>
                </View>
                <Text className="post-detail__time">
                  {formatRelativeTime(state.post.publishedAt)}
                </Text>
              </View>
            </View>
            {state.post.type === 'OFFICIAL' && <Text className="post-detail__type">官方发布</Text>}
            {state.post.title && <Text className="post-detail__title">{state.post.title}</Text>}
            <Text className="post-detail__body">{state.post.body}</Text>
            <View className="post-detail__actions">
              <Button
                className={state.post.likedByMe ? 'post-detail__liked' : ''}
                onClick={() => void toggleLike()}
              >
                {state.post.likedByMe ? '已赞' : '点赞'} · {state.post.likeCount}
              </Button>
              <Text>评论 · {state.post.commentCount}</Text>
            </View>
          </View>

          <View className="comment-panel">
            <Text className="comment-panel__title">评论</Text>
            <View className="comment-composer">
              <Textarea
                className="comment-composer__input"
                maxlength={300}
                placeholder={readSession() ? '写下你的看法' : '登录后参与评论'}
                value={comment}
                onInput={(event) => setComment(event.detail.value)}
              />
              <Button
                className="button button--primary comment-composer__submit"
                disabled={comment.trim().length < 2 || submitting}
                loading={submitting}
                onClick={() => void submitComment()}
              >
                发布评论
              </Button>
            </View>
            <View className="comment-list">
              {state.post.comments.length === 0 && (
                <Text className="comment-list__empty">还没有评论</Text>
              )}
              {state.post.comments.map((item) => (
                <View className="comment-item" key={item.id}>
                  <UserAvatar name={item.author.displayName} size="small" />
                  <View className="comment-item__copy">
                    <View>
                      <Text>{item.author.displayName}</Text>
                      <Text>{formatRelativeTime(item.createdAt)}</Text>
                    </View>
                    <Text>{item.body}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}
    </PublicShell>
  )
}
