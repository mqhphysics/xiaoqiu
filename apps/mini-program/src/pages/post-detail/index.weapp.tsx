import { Button, Image, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { UserAvatar } from '../../components/product-ui'
import { VerificationBadge } from '../../components/verification-badge'
import { ReactionHeart } from '../../components/reaction-heart'
import { ReportModal } from '../../components/report-modal'
import { productRepository, resolveMediaUrl } from '../../features/product/product.repository'
import { formatRelativeTime } from '../../features/product/product.format'
import { readSession } from '../../features/product/session'
import type { PostDetail } from '../../features/product/product.types'
import './index.weapp.scss'

export default function NativePostDetailPage() {
  const postId = getCurrentInstance().router?.params.postId ?? ''
  const [post, setPost] = useState<PostDetail | null>(null)
  const [error, setError] = useState('')
  const [report, setReport] = useState(false)
  const [liking, setLiking] = useState(false)
  const sequence = useRef(0)
  const load = useCallback(async () => {
    const ticket = ++sequence.current
    try {
      if (!postId) throw new Error('缺少动态参数')
      const result = await productRepository.getPost(postId)
      if (ticket === sequence.current) {
        setPost(result)
        setError('')
      }
    } catch (reason) {
      if (ticket === sequence.current)
        setError(reason instanceof Error ? reason.message : '动态读取失败')
    }
  }, [postId])
  useEffect(() => {
    void load()
    return () => {
      sequence.current++
    }
  }, [load])
  const like = async () => {
    if (!post || liking) return
    if (!readSession()) {
      void Taro.showToast({ title: '登录后可以点赞', icon: 'none' })
      return
    }
    setLiking(true)
    try {
      const result = await productRepository.setLike(post.id, !post.likedByMe)
      setPost((current) =>
        current ? { ...current, likedByMe: result.liked, likeCount: result.likeCount } : null,
      )
    } catch (reason) {
      void Taro.showToast({
        title: reason instanceof Error ? reason.message : '点赞失败',
        icon: 'none',
      })
    } finally {
      setLiking(false)
    }
  }
  const images = [
    ...new Set(
      [...(post?.imageUrls ?? []), post?.imageUrl]
        .map(resolveMediaUrl)
        .filter((url): url is string => Boolean(url)),
    ),
  ]
  return (
    <PublicShell active="home" showBack>
      {!post && !error && <DataState kind="loading" title="正在读取动态" />}
      {error && (
        <DataState
          kind="error"
          title="动态暂不可用"
          description={error}
          onRetry={() => void load()}
        />
      )}
      {post && (
        <View className="native-post-detail">
          <View className="native-post-detail__author">
            <UserAvatar
              avatarUrl={post.author.avatarUrl}
              name={post.author.displayName}
              size="small"
            />
            <View className="native-post-detail__identity">
              <View>
                <Text>{post.author.displayName}</Text>
                <VerificationBadge
                  level={post.author.verificationLevel}
                  roles={post.author.roles}
                  official={post.author.official}
                  displayedKind={post.author.displayedBadgeKind}
                />
              </View>
              <Text>{formatRelativeTime(post.publishedAt)}</Text>
            </View>
          </View>
          {post.type === 'OFFICIAL' && (
            <Text className="native-post-detail__official">官方发布</Text>
          )}
          {post.title && <Text className="native-post-detail__title">{post.title}</Text>}
          <View className="native-post-detail__photos">
            {images.map((src) => (
              <Image
                key={src}
                mode="widthFix"
                src={src}
                onClick={() => void Taro.previewImage({ urls: images, current: src })}
              />
            ))}
          </View>
          <Text className="native-post-detail__body">{post.body}</Text>
          <View className="native-post-detail__actions">
            <Button
              className={`native-post-detail__like${post.likedByMe ? ' is-active' : ''}`}
              disabled={liking}
              aria-label={post.likedByMe ? '取消点赞' : '点赞'}
              onClick={() => void like()}
            >
              <ReactionHeart active={post.likedByMe} />
              <Text>{post.likeCount}</Text>
            </Button>
            {readSession() && (
              <Button
                className="native-button native-button--quiet"
                onClick={() => setReport(true)}
              >
                投诉
              </Button>
            )}
          </View>
        </View>
      )}
      {post && report && (
        <ReportModal
          targetType="POST"
          targetId={post.id}
          title="投诉动态"
          onClose={() => setReport(false)}
        />
      )}
    </PublicShell>
  )
}
