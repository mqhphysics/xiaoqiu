import { Button, Input, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import {
  MatchCard,
  MatchStatus,
  PostCard,
  ProductSection,
  TeamCrest,
  UserAvatar,
} from '../../components/product-ui'
import { formatDate, formatTime } from '../../features/product/product.format'
import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import type {
  HomeResponse,
  PostSummary,
  SearchCategory,
  SearchResponse,
} from '../../features/product/product.types'

import './index.scss'

type PageState =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'ready'; data: HomeResponse }

const searchCategories: Array<{ key: SearchCategory; label: string }> = [
  { key: 'ALL', label: '全部' },
  { key: 'PLAYER', label: '球员' },
  { key: 'TEAM', label: '球队' },
  { key: 'MATCH', label: '比赛' },
  { key: 'POST', label: '动态' },
]

export default function IndexPage() {
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const [searchText, setSearchText] = useState('')
  const [searchCategory, setSearchCategory] = useState<SearchCategory>('ALL')
  const [searching, setSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [postBody, setPostBody] = useState('')
  const [publishing, setPublishing] = useState(false)

  const load = useCallback(async () => {
    setState({ phase: 'loading' })
    try {
      setState({ phase: 'ready', data: await productRepository.getHome() })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '首页加载失败，请稍后重试。',
      })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleSearch = async () => {
    const query = searchText.trim()
    if (!query) {
      setSearchResult(null)
      return
    }
    setSearching(true)
    try {
      setSearchResult(await productRepository.search(query, searchCategory))
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '搜索失败',
        icon: 'none',
      })
    } finally {
      setSearching(false)
    }
  }

  const handleLike = async (post: PostSummary) => {
    if (!readSession()) {
      await Taro.showToast({ title: '登录后可以点赞', icon: 'none' })
      await Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    try {
      const result = await productRepository.toggleLike(post.id)
      setState((current) => {
        if (current.phase !== 'ready') return current
        return {
          phase: 'ready',
          data: {
            ...current.data,
            posts: current.data.posts.map((item) =>
              item.id === post.id
                ? { ...item, likedByMe: result.liked, likeCount: result.likeCount }
                : item,
            ),
          },
        }
      })
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '操作失败',
        icon: 'none',
      })
    }
  }

  const openComposer = async () => {
    if (!readSession()) {
      await Taro.showToast({ title: '请先登录', icon: 'none' })
      await Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    setComposerOpen(true)
  }

  const publishPost = async () => {
    const body = postBody.trim()
    if (body.length < 2 || publishing) return
    setPublishing(true)
    try {
      const post = await productRepository.createPost(body)
      setState((current) =>
        current.phase === 'ready'
          ? { phase: 'ready', data: { ...current.data, posts: [post, ...current.data.posts] } }
          : current,
      )
      setPostBody('')
      setComposerOpen(false)
      await Taro.showToast({ title: '已发布', icon: 'success' })
    } catch (error) {
      await Taro.showToast({
        title: error instanceof Error ? error.message : '发布失败',
        icon: 'none',
      })
    } finally {
      setPublishing(false)
    }
  }

  const tournamentId = state.phase === 'ready' ? state.data.tournament.id : undefined

  return (
    <PublicShell active="home" tournamentId={tournamentId}>
      {state.phase === 'loading' && <DataState kind="loading" title="正在进入晓球" />}
      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="暂时无法连接赛事数据"
          description={state.message}
          onRetry={() => void load()}
        />
      )}
      {state.phase === 'ready' && (
        <HomeContent
          composerOpen={composerOpen}
          data={state.data}
          postBody={postBody}
          publishing={publishing}
          searchCategory={searchCategory}
          searching={searching}
          searchResult={searchResult}
          searchText={searchText}
          onCategoryChange={setSearchCategory}
          onCloseComposer={() => setComposerOpen(false)}
          onLike={(post) => void handleLike(post)}
          onOpenComposer={() => void openComposer()}
          onPostBodyChange={setPostBody}
          onPublish={() => void publishPost()}
          onSearch={() => void handleSearch()}
          onSearchTextChange={setSearchText}
        />
      )}
    </PublicShell>
  )
}

function HomeContent({
  composerOpen,
  data,
  postBody,
  publishing,
  searchCategory,
  searching,
  searchResult,
  searchText,
  onCategoryChange,
  onCloseComposer,
  onLike,
  onOpenComposer,
  onPostBodyChange,
  onPublish,
  onSearch,
  onSearchTextChange,
}: {
  composerOpen: boolean
  data: HomeResponse
  postBody: string
  publishing: boolean
  searchCategory: SearchCategory
  searching: boolean
  searchResult: SearchResponse | null
  searchText: string
  onCategoryChange: (category: SearchCategory) => void
  onCloseComposer: () => void
  onLike: (post: PostSummary) => void
  onOpenComposer: () => void
  onPostBodyChange: (value: string) => void
  onPublish: () => void
  onSearch: () => void
  onSearchTextChange: (value: string) => void
}) {
  const focus = data.focusMatches[0]
  return (
    <View>
      <View className="experience-hero">
        <View className="experience-hero__copy">
          <Text className="experience-hero__eyebrow">XIAOQIU CAMPUS FOOTBALL</Text>
          <Text className="experience-hero__title">{data.tournament.name}</Text>
          <Text className="experience-hero__season">{data.tournament.seasonName}</Text>
        </View>
        {focus && (
          <View className="hero-scoreboard" onClick={() => void goToMatch(focus.id)}>
            <View className="hero-scoreboard__meta">
              <MatchStatus status={focus.status} />
              <Text>
                {formatDate(focus.scheduledStartAt)} {formatTime(focus.scheduledStartAt)}
              </Text>
            </View>
            <View className="hero-scoreboard__teams">
              <View className="hero-scoreboard__team">
                <TeamCrest team={focus.homeTeam} size="large" />
                <Text>{focus.homeTeam?.name ?? '主队待定'}</Text>
              </View>
              <View className="hero-scoreboard__score">
                <Text>
                  {focus.homeScore ?? '-'} : {focus.awayScore ?? '-'}
                </Text>
                <Text className="hero-scoreboard__stage">{focus.title}</Text>
              </View>
              <View className="hero-scoreboard__team">
                <TeamCrest team={focus.awayTeam} size="large" />
                <Text>{focus.awayTeam?.name ?? '客队待定'}</Text>
              </View>
            </View>
            <Text className="hero-scoreboard__venue">{focus.venue?.name ?? '场地待定'}</Text>
          </View>
        )}
      </View>

      <View className="global-search">
        <View className="global-search__categories">
          {searchCategories.map((item) => (
            <Button
              className={`search-category ${searchCategory === item.key ? 'search-category--active' : ''}`}
              key={item.key}
              onClick={() => onCategoryChange(item.key)}
            >
              {item.label}
            </Button>
          ))}
        </View>
        <View className="global-search__bar">
          <Input
            className="global-search__input"
            confirmType="search"
            placeholder="搜索球员、球队、比赛或动态"
            value={searchText}
            onConfirm={onSearch}
            onInput={(event) => onSearchTextChange(event.detail.value)}
          />
          <Button className="global-search__submit" loading={searching} onClick={onSearch}>
            搜索
          </Button>
        </View>
        {searchResult && <SearchResults result={searchResult} tournamentId={data.tournament.id} />}
      </View>

      {data.announcements.length > 0 && (
        <View className="notice-rail">
          <Text className="notice-rail__label">官方公告</Text>
          <View className="notice-rail__items">
            {data.announcements.map((announcement) => (
              <View
                className="notice-rail__item"
                key={announcement.id}
                onClick={() => void goToPost(announcement.id)}
              >
                <Text className="notice-rail__title">{announcement.title}</Text>
                <Text className="notice-rail__body">{announcement.body}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View className="home-product-section">
        <ProductSection
          kicker="MATCH CENTRE"
          title="焦点赛事"
          note={`${data.tournament.matchCount} 场赛程`}
        />
        <View className="focus-match-grid">
          {data.focusMatches.map((match) => (
            <MatchCard match={match} key={match.id} onClick={() => void goToMatch(match.id)} />
          ))}
        </View>
      </View>

      <View className="home-product-layout">
        <View className="community-column">
          <ProductSection kicker="CAMPUS FEED" title="绿茵动态" note="全校社区" />
          <View className="community-feed surface">
            {composerOpen && (
              <View className="post-composer">
                <View className="post-composer__head">
                  <UserAvatar name={data.viewer?.displayName ?? '我'} size="small" />
                  <Text>{data.viewer?.displayName ?? '发布动态'}</Text>
                  <Button className="post-composer__close" onClick={onCloseComposer}>
                    关闭
                  </Button>
                </View>
                <Textarea
                  className="post-composer__input"
                  maxlength={500}
                  placeholder="记录此刻的校园足球"
                  value={postBody}
                  onInput={(event) => onPostBodyChange(event.detail.value)}
                />
                <View className="post-composer__footer">
                  <Text>{postBody.length}/500</Text>
                  <Button
                    className="button button--primary post-composer__submit"
                    disabled={postBody.trim().length < 2 || publishing}
                    loading={publishing}
                    onClick={onPublish}
                  >
                    发布
                  </Button>
                </View>
              </View>
            )}
            {data.posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onLike={() => onLike(post)}
                onOpen={() => void goToPost(post.id)}
              />
            ))}
          </View>
        </View>

        <View className="team-column">
          <ProductSection
            kicker="TEAMS"
            title="参赛球队"
            note={`${data.tournament.teamCount} 支`}
          />
          <View className="team-directory surface">
            {data.teams.map((team) => (
              <View
                className="team-directory__item"
                key={team.id}
                onClick={() => void goToTeam(team.id, data.tournament.id)}
              >
                <TeamCrest team={team} />
                <View className="team-directory__copy">
                  <Text className="team-directory__name">{team.name}</Text>
                  <Text className="team-directory__college">{team.collegeName}</Text>
                </View>
                <Text className="team-directory__group">{team.groupName}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {!composerOpen && (
        <Button className="floating-publish" onClick={onOpenComposer}>
          <Text className="floating-publish__plus">+</Text>
          <Text className="floating-publish__label">发布</Text>
        </Button>
      )}
    </View>
  )
}

function SearchResults({ result, tournamentId }: { result: SearchResponse; tournamentId: string }) {
  const total =
    result.players.length + result.teams.length + result.matches.length + result.posts.length
  return (
    <View className="search-results">
      <View className="search-results__head">
        <Text>“{result.query}”的搜索结果</Text>
        <Text>{total} 项</Text>
      </View>
      {total === 0 && <Text className="search-results__empty">没有找到相关内容</Text>}
      {result.players.map((player) => (
        <View
          className="search-result-row"
          key={player.id}
          onClick={() => void goToPlayer(player.id, tournamentId)}
        >
          <UserAvatar name={player.displayName} color={player.profileColor} size="small" />
          <View className="search-result-row__copy">
            <Text>{player.displayName}</Text>
            <Text>{player.team?.name ?? '暂无球队'} · 球员</Text>
          </View>
        </View>
      ))}
      {result.teams.map((team) => (
        <View
          className="search-result-row"
          key={team.id}
          onClick={() => void goToTeam(team.id, tournamentId)}
        >
          <TeamCrest team={team} size="small" />
          <View className="search-result-row__copy">
            <Text>{team.name}</Text>
            <Text>{team.collegeName} · 球队</Text>
          </View>
        </View>
      ))}
      {result.matches.map((match) => (
        <View className="search-result-row" key={match.id} onClick={() => void goToMatch(match.id)}>
          <Text className="search-result-row__tag">赛</Text>
          <View className="search-result-row__copy">
            <Text>
              {match.homeTeam?.name ?? '待定'} vs {match.awayTeam?.name ?? '待定'}
            </Text>
            <Text>
              {match.title} · {formatDate(match.scheduledStartAt)}
            </Text>
          </View>
        </View>
      ))}
      {result.posts.map((post) => (
        <View className="search-result-row" key={post.id} onClick={() => void goToPost(post.id)}>
          <Text className="search-result-row__tag">文</Text>
          <View className="search-result-row__copy">
            <Text>{post.title ?? post.body.slice(0, 24)}</Text>
            <Text>{post.author.displayName} · 动态</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

async function goToMatch(matchId: string) {
  await Taro.navigateTo({
    url: `/pages/readonly-match-detail/index?matchId=${encodeURIComponent(matchId)}`,
  })
}

async function goToTeam(teamId: string, tournamentId: string) {
  await Taro.navigateTo({
    url: `/pages/readonly-team-detail/index?teamId=${encodeURIComponent(teamId)}&tournamentId=${encodeURIComponent(tournamentId)}`,
  })
}

async function goToPlayer(playerId: string, tournamentId: string) {
  await Taro.navigateTo({
    url: `/pages/player-detail/index?playerId=${encodeURIComponent(playerId)}&tournamentId=${encodeURIComponent(tournamentId)}`,
  })
}

async function goToPost(postId: string) {
  await Taro.navigateTo({ url: `/pages/post-detail/index?postId=${encodeURIComponent(postId)}` })
}
