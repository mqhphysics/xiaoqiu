import Taro from '@tarojs/taro'
import { openTeam } from '../../features/product/team-navigation'
import type { PostTagsProps } from './index'
import './index.h5.scss'

export function PostTags({ tags, tournamentId }: PostTagsProps) {
  if (!window.matchMedia('(min-width: 721px)').matches || !tags?.length) return null
  return (
    <div className="post-tags" aria-label="动态标签">
      {tags.map((tag) => {
        const key = `${tag.kind}:${tag.targetId ?? tag.label}`
        return tag.targetId && tag.kind !== 'TOPIC' ? (
          <button
            key={key}
            type="button"
            className="post-tag"
            data-post-tag
            onClick={(event) => {
              event.stopPropagation()
              if (tag.kind === 'TEAM') void openTeam(tag.targetId!, tournamentId ?? undefined)
              else
                void Taro.navigateTo({
                  url: `/pages/player-detail/index?playerId=${encodeURIComponent(tag.targetId!)}${tournamentId ? `&tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
                })
            }}
          >
            #{tag.label}
          </button>
        ) : (
          <span key={key} className="post-tag post-tag--topic">
            #{tag.label}
          </span>
        )
      })}
    </div>
  )
}
