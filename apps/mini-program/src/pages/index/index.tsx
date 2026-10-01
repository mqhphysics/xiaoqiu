import { Button, Image, Input, Text, Textarea, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'

import { PublicShell } from '../../components/public-shell'
import { PersistentHeaderSearch } from '../../components/public-shell/persistent-header-search'
import { openSearchPage } from '../../components/public-shell/search-transition'
import backIcon from '../../assets/search-icons/arrow-left.svg'
import { PostImagePicker } from '../../components/post-image-picker'
import { useOverlayFocus } from '../../components/overlay-focus'
import { openMessaging } from '../../components/messaging-drawer'
import { DataState } from '../../components/public-ui'
import {
  MatchStatus,
  PostCard,
  ProductSection,
  TeamCrest,
  UserAvatar,
} from '../../components/product-ui'
import { formatDate, formatTime } from '../../features/product/product.format'
import {
  createClientActionId,
  productRepository,
  resolveMediaUrl,
} from '../../features/product/product.repository'
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

function readSearchRoute() {
  if (typeof window !== 'undefined') {
    const routeQuery = window.location.hash.includes('?')
      ? window.location.hash.slice(window.location.hash.indexOf('?') + 1)
      : window.location.search
    const params = new URLSearchParams(routeQuery)
    const query = params.get('query') ?? ''
    const category =
      searchCategories.find((item) => item.key === params.get('category'))?.key ?? 'ALL'
    return { query, category, expanded: params.get('search') === '1' || Boolean(query.trim()) }
  }
  const params = getCurrentInstance().router?.params ?? {}
  let query = params.query ?? ''
  try {
    query = decodeURIComponent(query.replace(/\+/g, ' '))
  } catch {
    // Keep malformed links readable instead of failing the whole page.
  }
  const category = searchCategories.find((item) => item.key === params.category)?.key ?? 'ALL'
  return { query, category, expanded: params.search === '1' || Boolean(query.trim()) }
}

export default function IndexPage() {
  const [initialSearch] = useState(readSearchRoute)
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const [searchText, setSearchText] = useState(initialSearch.query)
  const [searchCategory, setSearchCategory] = useState<SearchCategory>(initialSearch.category)
  const [searchMode, setSearchMode] = useState(initialSearch.expanded)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [postBody, setPostBody] = useState('')
  const [postImageDataUrl, setPostImageDataUrl] = useState<string | null>(null)
  const [postImageProcessing, setPostImageProcessing] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [pendingPost, setPendingPost] = useState<{ id: string; signature: string } | null>(null)
  const searchRequestId = useRef(0)

  useOverlayFocus(composerOpen, '.composer-dialog', () => setComposerOpen(false))

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

  const runSearch = useCallback(async (text: string, category: SearchCategory) => {
    const query = text.trim()
    const requestId = ++searchRequestId.current
    if (!query) {
      setSearching(false)
      setSearchResult(null)
      setSearchError(null)
      return
    }
    setSearching(true)
    setSearchError(null)
    setSearchResult(null)
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
  }, [])

  useEffect(() => {
    if (initialSearch.expanded) void runSearch(initialSearch.query, initialSearch.category)
    return () => {
      searchRequestId.current += 1
    }
  }, [initialSearch, runSearch])

  const handleSearch = async (category: SearchCategory = searchCategory, text = searchText) => {
    const query = text.trim()
    if (!searchMode && !query) return
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB) {
      const url = `/pages/index/index?search=1&query=${encodeURIComponent(query)}&category=${category}`
      if (!searchMode) {
        try {
          await openSearchPage(query, category)
        } catch {
          await Taro.showToast({ title: '搜索未能打开，请重试', icon: 'none' })
        }
        return
      }
      // Refining a search replaces this entry so Back returns to its originating page.
      const browserUrl = new URL(window.location.href)
      if (browserUrl.hash.startsWith('#/')) browserUrl.hash = url
      else {
        const target = new URL(url, browserUrl.origin)
        browserUrl.pathname = target.pathname
        browserUrl.search = target.search
      }
      window.history.replaceState(window.history.state, '', browserUrl)
    }
    setSearchText(text)
    setSearchMode(true)
    await runSearch(query, category)
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
    if (!searchMode) return
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB && initialSearch.expanded) {
      if (window.history.state?.xiaoqiuSearchEntry) {
        window.history.back()
      } else {
        void Taro.redirectTo({ url: '/pages/index/index' })
      }
      return
    }
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
      const result = await productRepository.setLike(post.id, !post.likedByMe)
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
      const result = await Taro.showModal({
        title: '登录后即可发送动态',
        content: '登录后即可发布绿茵动态。是否前往登录？',
        confirmText: '前往登录',
        cancelText: '取消',
      })
      if (result.confirm) await Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    setComposerOpen(true)
  }

  const publishPost = async () => {
    const body = postBody.trim()
    if (body.length < 2 || publishing || postImageProcessing) return
    const signature = `${body}\n${postImageDataUrl ?? ''}`
    const request =
      pendingPost?.signature === signature
        ? pendingPost
        : { id: createClientActionId('post'), signature }
    setPendingPost(request)
    setPublishing(true)
    try {
      const post = await productRepository.createPost(
        body,
        request.id,
        undefined,
        undefined,
        postImageDataUrl ?? undefined,
      )
      setState((current) =>
        current.phase === 'ready'
          ? { phase: 'ready', data: { ...current.data, posts: [post, ...current.data.posts] } }
          : current,
      )
      setPostBody('')
      setPostImageDataUrl(null)
      setPendingPost(null)
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
    <PublicShell
      active="home"
      tournamentId={tournamentId}
      onActiveReselect={() => {
        if (initialSearch.expanded) void Taro.redirectTo({ url: '/pages/index/index' })
        else exitSearch()
      }}
      headerSearch={
        searchMode ? null : (
          <PersistentHeaderSearch
            query={searchText}
            onQueryChange={handleSearchTextChange}
            onSearch={(query) => void handleSearch(searchCategory, query)}
          />
        )
      }
    >
      {!searchMode && state.phase === 'loading' && (
        <DataState kind="loading" title="正在进入晓球" />
      )}
      {!searchMode && state.phase === 'failed' && (
        <DataState
          kind="error"
          title="暂时无法连接赛事数据"
          description={state.message}
          onRetry={() => void load()}
        />
      )}
      {searchMode ? (
        <SearchExperience
          category={searchCategory}
          error={searchError}
          query={searchText}
          result={searchResult}
          searching={searching}
          tournamentId={tournamentId ?? ''}
          onBack={exitSearch}
          onCategoryChange={handleCategoryChange}
          onQueryChange={handleSearchTextChange}
          onSearch={() => void handleSearch()}
        />
      ) : state.phase === 'ready' ? (
        <HomeContent
          composerOpen={composerOpen}
          data={state.data}
          postBody={postBody}
          postImageDataUrl={postImageDataUrl}
          postImageProcessing={postImageProcessing}
          publishing={publishing}
          searchText={searchText}
          onCloseComposer={() => setComposerOpen(false)}
          onLike={(post) => void handleLike(post)}
          onOpenComposer={() => void openComposer()}
          onPostBodyChange={setPostBody}
          onPostImageChange={setPostImageDataUrl}
          onPostImageProcessingChange={setPostImageProcessing}
          onPublish={() => void publishPost()}
          onSearch={() => void handleSearch()}
          onSearchTextChange={handleSearchTextChange}
        />
      ) : null}
    </PublicShell>
  )
}

function HomeSearch({
  placement,
  searchText,
  onSearch,
  onSearchTextChange,
}: {
  placement: 'header' | 'body'
  searchText: string
  onSearch: () => void
  onSearchTextChange: (value: string) => void
}) {
  return (
    <View className={`home-search-entry home-search-entry--${placement}`}>
      {placement === 'header' ? (
        <View aria-hidden="true" className="persistent-header-search__icon" />
      ) : (
        <Text className="home-search-entry__icon">⌕</Text>
      )}
      <Input
        className="home-search-entry__input"
        confirmType="search"
        placeholder="搜索球员、球队、比赛或动态"
        value={searchText}
        onConfirm={onSearch}
        onInput={(event) => onSearchTextChange(event.detail.value)}
      />
      <Button aria-label="搜索" className="home-search-entry__action" onClick={onSearch}>
        搜索
      </Button>
    </View>
  )
}

function HomeContent({
  composerOpen,
  data,
  postBody,
  postImageDataUrl,
  postImageProcessing,
  publishing,
  searchText,
  onCloseComposer,
  onLike,
  onOpenComposer,
  onPostBodyChange,
  onPostImageChange,
  onPostImageProcessingChange,
  onPublish,
  onSearch,
  onSearchTextChange,
}: {
  composerOpen: boolean
  data: HomeResponse
  postBody: string
  postImageDataUrl: string | null
  postImageProcessing: boolean
  publishing: boolean
  searchText: string
  onCloseComposer: () => void
  onLike: (post: PostSummary) => void
  onOpenComposer: () => void
  onPostBodyChange: (value: string) => void
  onPostImageChange: (value: string | null) => void
  onPostImageProcessingChange: (processing: boolean) => void
  onPublish: () => void
  onSearch: () => void
  onSearchTextChange: (value: string) => void
}) {
  const focusMatches = selectFocusMatches(data.focusMatches)
  const featuredAnnouncement = data.announcements[0]
  const otherAnnouncements = data.announcements.slice(1)
  return (
    <View className="home-page">
      <View aria-hidden="true" className="home-page__lineart" />
      <View aria-hidden="true" className="home-page__lineart home-page__lineart--left" />
      <View className="experience-hero">
        <View className="experience-hero__copy">
          <Text className="experience-hero__eyebrow">
            {data.tournament.name} · {data.tournament.seasonName}
          </Text>
          {featuredAnnouncement && <Text className="experience-hero__badge">官方公告</Text>}
          <Text
            className={`experience-hero__title ${
              (featuredAnnouncement?.title?.length ?? data.tournament.name.length) > 20
                ? 'experience-hero__title--long'
                : ''
            }`}
          >
            {featuredAnnouncement?.title ?? data.tournament.name}
          </Text>
          <Text className="experience-hero__summary">
            {featuredAnnouncement?.body ?? '校园赛事、球队和绿茵动态，都在这里。'}
          </Text>
          <Button
            className="experience-hero__action"
            onClick={() =>
              void (featuredAnnouncement
                ? goToPost(featuredAnnouncement.id)
                : goToSchedule(data.tournament.id))
            }
          >
            {featuredAnnouncement ? '查看公告' : '查看赛程'} <Text>→</Text>
          </Button>
        </View>
        <View aria-hidden="true" className="experience-hero__media">
          <View className="experience-hero__illustration" />
        </View>
      </View>

      <HomeSearch
        placement="body"
        searchText={searchText}
        onSearch={onSearch}
        onSearchTextChange={onSearchTextChange}
      />

      <View className="home-product-section">
        <View aria-hidden="true" className="match-ornament match-ornament--floodlight" />
        <View aria-hidden="true" className="match-ornament match-ornament--ball" />
        <View aria-hidden="true" className="match-ornament match-ornament--goal" />
        <ProductSection
          kicker="MATCH CENTRE"
          title="焦点赛事"
          actionLabel="查看全部"
          onAction={() => void goToSchedule(data.tournament.id)}
        />
        {focusMatches.length > 0 ? (
          <View className={`focus-match-grid focus-match-grid--count-${focusMatches.length}`}>
            {focusMatches.map((match, index) => (
              <CompactMatchCard featured={index === 0} match={match} key={match.id} />
            ))}
          </View>
        ) : (
          <DataState kind="empty" title="暂无焦点赛事" description="完整赛程发布后将在这里展示。" />
        )}
      </View>

      {otherAnnouncements.length > 0 && (
        <View className="notice-rail">
          <Text className="notice-rail__label">官方公告</Text>
          <View className="notice-rail__items">
            {otherAnnouncements.map((announcement) => (
              <Button
                className={`notice-rail__item ${announcement.imageUrl ? 'notice-rail__item--photo' : ''}`}
                key={announcement.id}
                onClick={() => void goToPost(announcement.id)}
              >
                {announcement.imageUrl && (
                  <Image
                    className="notice-rail__photo"
                    mode="aspectFill"
                    src={resolveMediaUrl(announcement.imageUrl) ?? ''}
                  />
                )}
                <Text className="notice-rail__title">{announcement.title}</Text>
                <Text className="notice-rail__body">{announcement.body}</Text>
                <Text className="notice-rail__more">查看详情 →</Text>
              </Button>
            ))}
          </View>
        </View>
      )}

      <View className="community-column">
        <ProductSection kicker="CAMPUS FEED" title="绿茵动态" note="全校社区" />
        <Button className="composer-entry" onClick={onOpenComposer}>
          <UserAvatar
            avatarUrl={data.viewer?.avatarUrl ?? null}
            name={data.viewer?.displayName ?? '访客'}
            size="small"
          />
          <Text className="composer-entry__placeholder">说点什么，记录此刻的校园足球</Text>
          <Text className="composer-entry__action">发布</Text>
        </Button>
        <View className="community-feed">
          {data.posts.length > 0 ? (
            data.posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                variant="home"
                onLike={() => onLike(post)}
                onOpen={() => void goToPost(post.id)}
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
              <UserAvatar
                avatarUrl={data.viewer?.avatarUrl ?? null}
                name={data.viewer?.displayName ?? '我'}
                size="small"
              />
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
            <PostImagePicker
              value={postImageDataUrl}
              disabled={publishing}
              onChange={onPostImageChange}
              onProcessingChange={onPostImageProcessingChange}
            />
            <View className="composer-dialog__footer">
              <Text>{postBody.length}/500</Text>
              <View className="composer-dialog__actions">
                <Button className="composer-dialog__cancel" onClick={onCloseComposer}>
                  取消
                </Button>
                <Button
                  className="composer-dialog__submit"
                  disabled={postBody.trim().length < 2 || publishing || postImageProcessing}
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
          <Text className="search-experience__mobile-back">←</Text>
          <Image aria-hidden="true" className="search-experience__back-icon" src={backIcon} />
        </Button>
        <Text className="search-experience__title">全站搜索</Text>
        <Button className="search-experience__exit" onClick={onBack}>
          退出
        </Button>
      </View>
      <View className="search-experience__desktop-bar">
        <PersistentHeaderSearch
          expanded
          query={query}
          searching={searching}
          onQueryChange={onQueryChange}
          onSearch={onSearch}
        />
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
      {searching && <DataState kind="loading" title="正在搜索" />}
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

function CompactMatchCard({ match, featured }: { match: MatchSummary; featured: boolean }) {
  const hasScore = match.homeScore !== null && match.awayScore !== null
  return (
    <Button
      aria-label={`查看${match.title}比赛详情`}
      className={`compact-match ${featured ? 'compact-match--featured' : ''}`}
      onClick={() => void goToMatch(match.id)}
    >
      <View className="compact-match__meta">
        <MatchStatus status={match.status} />
        <View className="compact-match__meta-copy">
          <Text className="compact-match__round">{match.title}</Text>
          <Text className="compact-match__time">
            {formatDate(match.scheduledStartAt)} {formatTime(match.scheduledStartAt)}
          </Text>
        </View>
      </View>
      <View className="compact-match__line">
        <View className="compact-match__side">
          <TeamCrest team={match.homeTeam} size="medium" />
          <Text className="compact-match__team">
            {match.homeTeam?.name ?? match.homePlaceholder ?? '主队待定'}
          </Text>
        </View>
        <Text className="compact-match__score">
          {hasScore ? `${match.homeScore} : ${match.awayScore}` : 'VS'}
        </Text>
        <View className="compact-match__side compact-match__side--away">
          <TeamCrest team={match.awayTeam} size="medium" />
          <Text className="compact-match__team">
            {match.awayTeam?.name ?? match.awayPlaceholder ?? '客队待定'}
          </Text>
        </View>
      </View>
      <Text className="compact-match__stage">{match.venue?.name ?? '场地待定'}</Text>
    </Button>
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
          <UserAvatar
            avatarUrl={player.avatarUrl}
            name={player.displayName}
            color={player.profileColor}
            size="small"
          />
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
