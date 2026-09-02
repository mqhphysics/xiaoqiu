import { Button, Input, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import {
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
  MatchSummary,
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
  const [searchMode, setSearchMode] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [postBody, setPostBody] = useState('')
  const [publishing, setPublishing] = useState(false)
  const searchRequestId = useRef(0)

  useEffect(() => {
    if (!composerOpen || typeof document === 'undefined') return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setComposerOpen(false)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [composerOpen])

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

  const handleSearch = async (category: SearchCategory = searchCategory) => {
    const query = searchText.trim()
    const requestId = ++searchRequestId.current
    setSearchMode(true)
    if (!query) {
      setSearching(false)
      setSearchResult(null)
      setSearchError(null)
      return
    }
    setSearching(true)
    setSearchError(null)
    try {
      const result = await productRepository.search(query, category)
      if (requestId === searchRequestId.current) setSearchResult(result)
    } catch (error) {
      if (requestId === searchRequestId.current) {
        setSearchError(error instanceof Error ? error.message : '搜索失败，请稍后重试。')
      }
    } finally {
      if (requestId === searchRequestId.current) setSearching(false)
    }
  }

  const handleCategoryChange = (category: SearchCategory) => {
    setSearchCategory(category)
    if (searchText.trim()) void handleSearch(category)
  }

  const handleSearchTextChange = (value: string) => {
    setSearchText(value)
    if (value.trim()) return
    searchRequestId.current += 1
    setSearching(false)
    setSearchError(null)
    setSearchResult(null)
  }

  const exitSearch = () => {
    searchRequestId.current += 1
    setSearchMode(false)
    setSearching(false)
    setSearchError(null)
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
    <PublicShell active="home" tournamentId={tournamentId} onActiveReselect={exitSearch}>
      {state.phase === 'loading' && <DataState kind="loading" title="正在进入晓球" />}
      {state.phase === 'failed' && (
        <DataState
          kind="error"
          title="暂时无法连接赛事数据"
          description={state.message}
          onRetry={() => void load()}
        />
      )}
      {state.phase === 'ready' &&
        (searchMode ? (
          <SearchExperience
            category={searchCategory}
            error={searchError}
            query={searchText}
            result={searchResult}
            searching={searching}
            tournamentId={state.data.tournament.id}
            onBack={exitSearch}
            onCategoryChange={handleCategoryChange}
            onQueryChange={handleSearchTextChange}
            onSearch={() => void handleSearch()}
          />
        ) : (
          <HomeContent
            composerOpen={composerOpen}
            data={state.data}
            postBody={postBody}
            publishing={publishing}
            onCloseComposer={() => setComposerOpen(false)}
            onEnterSearch={() => setSearchMode(true)}
            onLike={(post) => void handleLike(post)}
            onOpenComposer={() => void openComposer()}
            onPostBodyChange={setPostBody}
            onPublish={() => void publishPost()}
          />
        ))}
    </PublicShell>
  )
}

function HomeContent({
  composerOpen,
  data,
  postBody,
  publishing,
  onCloseComposer,
  onEnterSearch,
  onLike,
  onOpenComposer,
  onPostBodyChange,
  onPublish,
}: {
  composerOpen: boolean
  data: HomeResponse
  postBody: string
  publishing: boolean
  onCloseComposer: () => void
  onEnterSearch: () => void
  onLike: (post: PostSummary) => void
  onOpenComposer: () => void
  onPostBodyChange: (value: string) => void
  onPublish: () => void
}) {
  const focusMatches = selectFocusMatches(data.focusMatches)
  return (
    <View>
      <View className="experience-hero">
        <View className="experience-hero__copy">
          <Text className="experience-hero__eyebrow">XIAOQIU CAMPUS FOOTBALL</Text>
          <Text className="experience-hero__title">{data.tournament.name}</Text>
          <Text className="experience-hero__season">{data.tournament.seasonName}</Text>
        </View>
      </View>

      <View className="home-search-entry" onClick={onEnterSearch}>
        <Text className="home-search-entry__icon">⌕</Text>
        <Input
          className="home-search-entry__input"
          confirmType="search"
          placeholder="搜索球员、球队、比赛或动态"
          onFocus={onEnterSearch}
        />
        <Text className="home-search-entry__action">搜索</Text>
      </View>

      <View className="home-product-section">
        <ProductSection
          kicker="MATCH CENTRE"
          title="焦点赛事"
          actionLabel="查看全部"
          onAction={() => void goToSchedule(data.tournament.id)}
        />
        {focusMatches.length > 0 ? (
          <View className="focus-match-grid">
            {focusMatches.map((match) => (
              <CompactMatchCard match={match} key={match.id} />
            ))}
          </View>
        ) : (
          <DataState kind="empty" title="暂无焦点赛事" description="完整赛程发布后将在这里展示。" />
        )}
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

      <View className="community-column">
        <ProductSection kicker="CAMPUS FEED" title="绿茵动态" note="全校社区" />
        <Button className="composer-entry" onClick={onOpenComposer}>
          <UserAvatar name={data.viewer?.displayName ?? '访客'} size="small" />
          <Text className="composer-entry__placeholder">说点什么，记录此刻的校园足球</Text>
          <Text className="composer-entry__action">发布</Text>
        </Button>
        <View className="community-feed">
          {data.posts.length > 0 ? (
            data.posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onLike={() => onLike(post)}
                onOpen={() => void goToPost(post.id)}
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
      </View>

      {composerOpen && (
        <View className="composer-scrim" onClick={onCloseComposer}>
          <View
            aria-labelledby="composer-dialog-title"
            aria-modal="true"
            className="composer-dialog"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <View className="composer-dialog__head">
              <View>
                <Text className="composer-dialog__eyebrow">CREATE POST</Text>
                <Text className="composer-dialog__title" id="composer-dialog-title">
                  发布绿茵动态
                </Text>
              </View>
              <Button
                aria-label="关闭发布窗口"
                className="composer-dialog__close"
                onClick={onCloseComposer}
              >
                ×
              </Button>
            </View>
            <View className="composer-dialog__identity">
              <UserAvatar name={data.viewer?.displayName ?? '我'} size="small" />
              <Text>{data.viewer?.displayName ?? '发布动态'}</Text>
            </View>
            <Textarea
              focus
              className="composer-dialog__input"
              maxlength={500}
              placeholder="记录此刻的校园足球，emoji 也可以正常使用 ⚽"
              value={postBody}
              onInput={(event) => onPostBodyChange(event.detail.value)}
            />
            <View className="composer-dialog__footer">
              <Text>{postBody.length}/500</Text>
              <View className="composer-dialog__actions">
                <Button className="composer-dialog__cancel" onClick={onCloseComposer}>
                  取消
                </Button>
                <Button
                  className="composer-dialog__submit"
                  disabled={postBody.trim().length < 2 || publishing}
                  loading={publishing}
                  onClick={onPublish}
                >
                  发布动态
                </Button>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

function SearchExperience({
  category,
  error,
  query,
  result,
  searching,
  tournamentId,
  onBack,
  onCategoryChange,
  onQueryChange,
  onSearch,
}: {
  category: SearchCategory
  error: string | null
  query: string
  result: SearchResponse | null
  searching: boolean
  tournamentId: string
  onBack: () => void
  onCategoryChange: (category: SearchCategory) => void
  onQueryChange: (query: string) => void
  onSearch: () => void
}) {
  return (
    <View className="search-experience">
      <View className="search-experience__head">
        <Button aria-label="退出搜索" className="search-experience__back" onClick={onBack}>
          ←
        </Button>
        <Text className="search-experience__title">全站搜索</Text>
        <Button className="search-experience__exit" onClick={onBack}>
          退出
        </Button>
      </View>
      <View className="search-experience__bar">
        <Input
          focus
          className="search-experience__input"
          confirmType="search"
          placeholder="搜索球员、球队、比赛或动态"
          value={query}
          onConfirm={onSearch}
          onInput={(event) => onQueryChange(event.detail.value)}
        />
        <Button className="search-experience__submit" loading={searching} onClick={onSearch}>
          搜索
        </Button>
      </View>
      <View className="global-search__categories">
        {searchCategories.map((item) => (
          <Button
            className={`search-category ${category === item.key ? 'search-category--active' : ''}`}
            key={item.key}
            onClick={() => onCategoryChange(item.key)}
          >
            {item.label}
          </Button>
        ))}
      </View>
      {error && (
        <DataState kind="error" title="搜索暂时不可用" description={error} onRetry={onSearch} />
      )}
      {!error && !result && !searching && (
        <View className="search-experience__empty">
          <Text>输入关键词，查找晓球里的球员、球队、比赛和动态。</Text>
        </View>
      )}
      {!error && result && <SearchResults result={result} tournamentId={tournamentId} />}
    </View>
  )
}

function CompactMatchCard({ match }: { match: MatchSummary }) {
  const hasScore = match.homeScore !== null && match.awayScore !== null
  return (
    <View className="compact-match" onClick={() => void goToMatch(match.id)}>
      <View className="compact-match__meta">
        <MatchStatus status={match.status} />
        <Text>
          {formatDate(match.scheduledStartAt)} {formatTime(match.scheduledStartAt)}
        </Text>
      </View>
      <View className="compact-match__line">
        <Text className="compact-match__team">
          {match.homeTeam?.shortName ?? match.homePlaceholder ?? '待定'}
        </Text>
        <Text className="compact-match__score">
          {hasScore ? `${match.homeScore} : ${match.awayScore}` : 'vs'}
        </Text>
        <Text className="compact-match__team compact-match__team--away">
          {match.awayTeam?.shortName ?? match.awayPlaceholder ?? '待定'}
        </Text>
      </View>
      <Text className="compact-match__stage">
        {match.title} · {match.venue?.name ?? '场地待定'}
      </Text>
    </View>
  )
}

function selectFocusMatches(matches: MatchSummary[]): MatchSummary[] {
  const live = matches
    .filter((match) => match.status === 'LIVE')
    .sort(
      (left, right) =>
        upcomingDateValue(left.scheduledStartAt) - upcomingDateValue(right.scheduledStartAt),
    )
  const finished = matches
    .filter((match) => match.status === 'FINISHED')
    .sort((left, right) => dateValue(right.scheduledStartAt) - dateValue(left.scheduledStartAt))
  const upcoming = matches
    .filter((match) => match.status !== 'LIVE' && match.status !== 'FINISHED')
    .sort(
      (left, right) =>
        upcomingDateValue(left.scheduledStartAt) - upcomingDateValue(right.scheduledStartAt),
    )
  const selected = [...live, ...finished.slice(0, 1), ...upcoming].slice(0, 3)
  return selected.length > 0 ? selected : matches.slice(0, 3)
}

function dateValue(value: string | null): number {
  return value ? new Date(value).getTime() : 0
}

function upcomingDateValue(value: string | null): number {
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER
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

async function goToSchedule(tournamentId: string) {
  await Taro.redirectTo({
    url: `/pages/readonly-schedule/index?tournamentId=${encodeURIComponent(tournamentId)}`,
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
