import { View } from '@tarojs/components'
import { useEffect, useState } from 'react'

import { openMessaging } from '../../../components/messaging-drawer'
import { PostCard } from '../../../components/product-ui'
import { DataState } from '../../../components/public-ui'
import type { PostSummary } from '../../../features/product/product.types'
import { readSession } from '../../../features/product/session'

function readFeedColumns(): number {
  if (typeof window === 'undefined') return 3
  if (window.matchMedia('(max-width: 1150px)').matches) return 2
  return 3
}

function splitColumns<T>(items: T[], columns: number): T[][] {
  const count = Math.max(1, Math.min(columns, items.length))
  const cols: T[][] = Array.from({ length: count }, () => [])
  items.forEach((item, index) => {
    cols[index % count]!.push(item)
  })
  return cols
}

export function CommunityFeed({
  posts,
  onLike,
  onOpen,
}: {
  posts: PostSummary[]
  onLike: (post: PostSummary) => void
  onOpen: (postId: string) => void
}) {
  const [columns, setColumns] = useState(readFeedColumns)

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1150px)')
    const update = () => setColumns(query.matches ? 2 : 3)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return (
    <View className="community-feed community-feed--masonry">
      {posts.length > 0 ? (
        splitColumns(posts, columns).map((column, index) => (
          <View className={`community-feed__col community-feed__col--${index}`} key={index}>
            {column.map((post) => (
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
            ))}
          </View>
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
