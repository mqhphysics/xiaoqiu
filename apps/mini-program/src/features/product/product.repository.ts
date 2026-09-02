import Taro from '@tarojs/taro'

import { clearSession, leaveGuestMode, readSession, saveSession } from './session'
import type {
  AdminIdentity,
  AuthSession,
  AuthUser,
  CompetitionDataResponse,
  CaptainWorkspaceResponse,
  ConversationListResponse,
  HomeResponse,
  LikeResponse,
  MessageListResponse,
  MessageUser,
  MatchExperienceResponse,
  PlayerDetailResponse,
  PlayerFollowsResponse,
  PostComment,
  PostDetail,
  PostSummary,
  RegisterInput,
  SearchCategory,
  SearchResponse,
  NotificationResponse,
  ReportListResponse,
  ReportTargetType,
  TeamDashboardResponse,
  TeamPreferencesResponse,
  TeamRelationshipResponse,
} from './product.types'

const DEFAULT_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001'

export class ProductApiError extends Error {
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
    request<MatchExperienceResponse>(`/public/matches/${encodeURIComponent(matchId)}/experience`),

  getPost: (postId: string) => request<PostDetail>(`/public/posts/${encodeURIComponent(postId)}`),

  login: async (identifier: string, password: string) => {
    const session = await request<AuthSession>('/auth/login', {
      method: 'POST',
      data: { username: identifier.trim(), password },
      authenticated: false,
    })
    saveSession(session)
    return session
  },

  register: async (input: RegisterInput) => {
    const session = await request<AuthSession>('/auth/register', {
      method: 'POST',
      data: input,
      authenticated: false,
    })
    saveSession(session)
    return session
  },

  getMe: () => request<AuthUser>('/auth/me'),

  updateProfile: async (displayName: string, email: string, bio: string) => {
    const user = await request<AuthUser>('/auth/me', {
      method: 'PATCH',
      data: { displayName, email, bio },
    })
    refreshStoredUser(user)
    return user
  },

  uploadAvatar: async (dataUrl: string) => {
    const result = await request<{ user: AuthUser; avatar: { avatarUrl: string } }>('/me/avatar', {
      method: 'PUT',
      data: { dataUrl },
    })
    refreshStoredUser(result.user)
    return result
  },

  resetPasswordByIdentity: (realName: string, studentId: string, newPassword: string) =>
    request<void>('/auth/password/reset-by-identity', {
      method: 'POST',
      authenticated: false,
      data: { realName, studentId, newPassword },
    }),

  getAdminIdentities: () => request<AdminIdentity[]>('/admin/identities'),

  reviewMatch: (matchId: string, rating: number, body?: string) =>
    request<MatchExperienceResponse>(`/matches/${encodeURIComponent(matchId)}/reviews`, {
      method: 'POST',
      data: { rating, ...(body?.trim() ? { body: body.trim() } : {}) },
    }),

  logout: async () => {
    try {
      await request<void>('/auth/logout', { method: 'POST' })
    } finally {
      clearSession()
      leaveGuestMode()
    }
  },

  getTeamPreferences: () => request<TeamPreferencesResponse>('/me/team-preferences'),

  updateTeamPreferences: (primaryTeamId: string, followedTeamIds: string[]) =>
    request<TeamPreferencesResponse>('/me/team-preferences', {
      method: 'PUT',
      data: { primaryTeamId, followedTeamIds },
    }),

  createPost: (body: string, clientPostId: string, title?: string, teamId?: string) =>
    request<PostSummary>('/community/posts', {
      method: 'POST',
      data: {
        body,
        clientPostId,
        ...(title ? { title } : {}),
        ...(teamId ? { teamId } : {}),
      },
    }),

  setLike: (postId: string, liked: boolean) =>
    request<LikeResponse>(`/community/posts/${encodeURIComponent(postId)}/like`, {
      method: liked ? 'PUT' : 'DELETE',
    }),

  createComment: (
    postId: string,
    body: string,
    clientCommentId: string,
    parentCommentId?: string,
  ) =>
    request<PostComment>(`/community/posts/${encodeURIComponent(postId)}/comments`, {
      method: 'POST',
      data: { body, clientCommentId, ...(parentCommentId ? { parentCommentId } : {}) },
    }),

  getPlayerFollows: () => request<PlayerFollowsResponse>('/me/player-follows'),
  followPlayer: (playerId: string) =>
    request<PlayerFollowsResponse>(`/me/player-follows/${encodeURIComponent(playerId)}`, {
      method: 'PUT',
    }),
  unfollowPlayer: (playerId: string) =>
    request<PlayerFollowsResponse>(`/me/player-follows/${encodeURIComponent(playerId)}`, {
      method: 'DELETE',
    }),

  getTeamRelationship: (teamId: string) =>
    request<TeamRelationshipResponse>(`/teams/${encodeURIComponent(teamId)}/relationship`),
  applyToTeam: (teamId: string, requestedPosition: string, message: string) =>
    request<TeamRelationshipResponse>(`/teams/${encodeURIComponent(teamId)}/join-applications`, {
      method: 'POST',
      data: {
        ...(requestedPosition ? { requestedPosition } : {}),
        ...(message.trim() ? { message: message.trim() } : {}),
      },
    }),
  getCaptainWorkspace: (teamId: string) =>
    request<CaptainWorkspaceResponse>(`/captain/teams/${encodeURIComponent(teamId)}`),
  reviewTeamApplication: (teamId: string, applicationId: string, decision: string, note = '') =>
    request<CaptainWorkspaceResponse>(
      `/captain/teams/${encodeURIComponent(teamId)}/applications/${encodeURIComponent(applicationId)}`,
      { method: 'PUT', data: { decision, ...(note.trim() ? { note: note.trim() } : {}) } },
    ),
  updateTeamMember: (teamId: string, membershipId: string, position: string) =>
    request<CaptainWorkspaceResponse>(
      `/captain/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(membershipId)}`,
      { method: 'PUT', data: { position } },
    ),
  removeTeamMember: (teamId: string, membershipId: string) =>
    request<CaptainWorkspaceResponse>(
      `/captain/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(membershipId)}`,
      { method: 'DELETE' },
    ),

  getNotifications: () => request<NotificationResponse>('/me/notifications'),
  readNotification: (notificationId: string) =>
    request<NotificationResponse>(`/me/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: 'PUT',
    }),
  readAllNotifications: () =>
    request<NotificationResponse>('/me/notifications/read-all', { method: 'PUT' }),

  createReport: (
    targetType: ReportTargetType,
    reason: string,
    details: string,
    clientReportId: string,
    targetId?: string,
  ) =>
    request('/reports', {
      method: 'POST',
      data: {
        clientReportId,
        targetType,
        reason,
        ...(details.trim() ? { details: details.trim() } : {}),
        ...(targetId ? { targetId } : {}),
      },
    }),
  getMyReports: () => request<ReportListResponse>('/me/reports'),
  getAdminReports: () => request<ReportListResponse>('/admin/reports'),
  reviewReport: (reportId: string, status: string, resolution: string, hideContent: boolean) =>
    request<ReportListResponse>(`/admin/reports/${encodeURIComponent(reportId)}`, {
      method: 'PUT',
      data: { status, resolution, hideContent },
    }),

  getMessageDirectory: (query = '') =>
    request<{ items: MessageUser[] }>(
      `/messages/directory${query.trim() ? `?query=${encodeURIComponent(query.trim())}` : ''}`,
    ),
  getConversations: () => request<ConversationListResponse>('/messages/conversations'),
  getMessages: (conversationId: string) =>
    request<MessageListResponse>(`/messages/conversations/${encodeURIComponent(conversationId)}`),
  readConversation: (conversationId: string) =>
    request<MessageListResponse>(
      `/messages/conversations/${encodeURIComponent(conversationId)}/read`,
      { method: 'PUT' },
    ),
  sendMessage: (recipientUserId: string, body: string, clientMessageId: string) =>
    request<{ conversationId: string }>(`/messages/direct/${encodeURIComponent(recipientUserId)}`, {
      method: 'POST',
      data: { body, clientMessageId },
    }),
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
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
        (session?.user.organizationId ?? process.env.TARO_APP_ORGANIZATION_ID?.trim()) ||
        DEFAULT_ORGANIZATION_ID,
      ...(options.authenticated !== false && session?.accessToken
        ? { Authorization: `Bearer ${session.accessToken}` }
        : {}),
    },
    timeout: 8000,
  })

  if (response.statusCode < 200 || response.statusCode >= 300) {
    if (response.statusCode === 401 && options.authenticated !== false) clearSession()
    throw new ProductApiError(
      readErrorMessage(response.data, response.statusCode),
      response.statusCode,
    )
  }
  return response.data
}

function getApiBaseUrl(): string {
  const configured = process.env.TARO_APP_API_BASE_URL?.trim()
  if (!configured) {
    throw new ProductApiError('尚未配置 API 地址。请使用 TARO_APP_API_BASE_URL 启动客户端。', 0)
  }
  const normalized = configured.replace(/\/+$/, '')
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`
}

export function resolveMediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  if (/^https?:\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:'))
    return path
  const base = getApiBaseUrl()
  return path.startsWith('/api/')
    ? `${base.replace(/\/api$/, '')}${path}`
    : `${base}/${path.replace(/^\/+/, '')}`
}

export function createClientActionId(scope: string): string {
  return `${scope}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function refreshStoredUser(user: AuthUser): void {
  const session = readSession()
  if (session) saveSession({ ...session, user })
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
