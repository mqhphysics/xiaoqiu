import { View } from '@tarojs/components'

import { openMessaging } from '../../../components/messaging-drawer'
import { PostCard } from '../../../components/product-ui'
import { DataState } from '../../../components/public-ui'
import type { PostSummary } from '../../../features/product/product.types'
import { readSession } from '../../../features/product/session'

export function CommunityFeed({
  posts,
  onLike,
  onOpen,
}: {
  posts: PostSummary[]
  onLike: (post: PostSummary) => void
  onOpen: (postId: string) => void
}) {
  return (
    <View className="community-feed">
      {posts.length > 0 ? (
        posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            variant="home"
            onLike={() => onLike(post)}
            onOpen={() => onOpen(post.id)}
            {...(post.author.messageable && readSession()
              ? {
                  onMessageAuthor: () =>
                    openMessaging({
                      id: post.author.id,
                      displayName: post.author.displayName,
                      avatarUrl: post.author.avatarUrl,
                    }),
                }
              : {})}
          />
        ))
      ) : (
        <DataState
          kind="empty"
          title="还没有绿茵动态"
          description="登录后可以发布第一条动态。"
        />
      )}
    </View>
  )
}
