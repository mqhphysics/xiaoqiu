import Taro from '@tarojs/taro'

import { clearSession, readSession, saveSession } from './session'
import type {
  AuthSession,
  AuthUser,
  CompetitionDataResponse,
  HomeResponse,
  LikeResponse,
  MatchExperienceResponse,
  PlayerDetailResponse,
  PostComment,
  PostDetail,
  PostSummary,
  SearchCategory,
  SearchResponse,
  TeamDashboardResponse,
  TeamPreferencesResponse,
} from './product.types'

const DEFAULT_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001'

class ProductApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message)
    this.name = 'ProductApiError'
  }
}

export const productRepository = {
  getHome: () => request<HomeResponse>('/public/home'),

  search: (query: string, category: SearchCategory) =>
    request<SearchResponse>(
      `/public/search?query=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}`,
    ),

  getCompetitionData: (tournamentId: string) =>
    request<CompetitionDataResponse>(
      `/public/tournaments/${encodeURIComponent(tournamentId)}/competition-data`,
    ),

  getTeamDashboard: (teamId: string, tournamentId?: string) =>
    request<TeamDashboardResponse>(
      `/public/teams/${encodeURIComponent(teamId)}/dashboard${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
    ),

  getPlayer: (playerId: string, tournamentId?: string) =>
    request<PlayerDetailResponse>(
      `/public/players/${encodeURIComponent(playerId)}${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
    ),

  getMatch: (matchId: string) =>
    request<MatchExperienceResponse>(
      `/public/matches/${encodeURIComponent(matchId)}/experience`,
    ),

  getPost: (postId: string) =>
    request<PostDetail>(`/public/posts/${encodeURIComponent(postId)}`),

  login: async (username: string, password: string) => {
    const session = await request<AuthSession>('/auth/login', {
      method: 'POST',
      data: { username: username.trim().toLowerCase(), password },
      authenticated: false,
    })
    saveSession(session)
    return session
  },

  getMe: () => request<AuthUser>('/auth/me'),

  logout: async () => {
    try {
      await request<void>('/auth/logout', { method: 'POST' })
    } finally {
      clearSession()
    }
  },

  getTeamPreferences: () => request<TeamPreferencesResponse>('/me/team-preferences'),

  updateTeamPreferences: (primaryTeamId: string, followedTeamIds: string[]) =>
    request<TeamPreferencesResponse>('/me/team-preferences', {
      method: 'PUT',
      data: { primaryTeamId, followedTeamIds },
    }),

  createPost: (body: string, title?: string) =>
    request<PostSummary>('/community/posts', {
      method: 'POST',
      data: { body, ...(title ? { title } : {}) },
    }),

  toggleLike: (postId: string) =>
    request<LikeResponse>(`/community/posts/${encodeURIComponent(postId)}/like`, {
      method: 'POST',
    }),

  createComment: (postId: string, body: string) =>
    request<PostComment>(`/community/posts/${encodeURIComponent(postId)}/comments`, {
      method: 'POST',
      data: { body },
    }),
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT'
  data?: unknown
  authenticated?: boolean
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const session = readSession()
  const response = await Taro.request<T>({
    url: `${getApiBaseUrl()}${path}`,
    method: options.method ?? 'GET',
    data: options.data,
    header: {
      'content-type': 'application/json',
      'x-dev-organization-id':
        process.env.TARO_APP_ORGANIZATION_ID?.trim() || DEFAULT_ORGANIZATION_ID,
      ...(options.authenticated !== false && session?.accessToken
        ? { Authorization: `Bearer ${session.accessToken}` }
        : {}),
    },
    timeout: 8000,
  })

  if (response.statusCode < 200 || response.statusCode >= 300) {
    if (response.statusCode === 401 && options.authenticated !== false) clearSession()
    throw new ProductApiError(readErrorMessage(response.data, response.statusCode), response.statusCode)
  }
  return response.data
}

function getApiBaseUrl(): string {
  const configured = process.env.TARO_APP_API_BASE_URL?.trim()
  if (!configured) {
    throw new ProductApiError(
      '尚未配置 API 地址。请使用 TARO_APP_API_BASE_URL 启动客户端。',
      0,
    )
  }
  const normalized = configured.replace(/\/+$/, '')
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`
}

function readErrorMessage(data: unknown, statusCode: number): string {
  if (typeof data === 'object' && data !== null) {
    if ('message' in data && typeof data.message === 'string') return data.message
    if ('error' in data && typeof data.error === 'object' && data.error !== null) {
      const error = data.error as { message?: unknown }
      if (typeof error.message === 'string') return error.message
    }
  }
  return statusCode === 0 ? '无法连接晓球 API' : `请求失败（HTTP ${statusCode}）`
}
