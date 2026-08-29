import {
  mapRosterRegistrationDetailResponse,
  mapRosterRegistrationListResponse,
} from './admin-roster.logic'
import {
  AdminRosterRepositoryError,
  type AdminRosterContext,
  type AdminRosterRepository,
  type RosterRegistrationDetail,
  type RosterRegistrationReview,
  type RosterReviewTournament,
} from './types'

export const mockRosterTournament: RosterReviewTournament = {
  id: '00000000-0000-4000-8000-000000000301',
  code: 'mock-campus-cup',
  name: '虚构校园杯（开发数据）',
}

export function createAdminRosterRepository(): AdminRosterRepository {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
  return apiBaseUrl ? new HttpAdminRosterRepository(apiBaseUrl) : new MockAdminRosterRepository()
}

class HttpAdminRosterRepository implements AdminRosterRepository {
  readonly mode = 'api' as const
  readonly apiBaseUrl: string

  constructor(apiBaseUrl: string) {
    this.apiBaseUrl = normalizeApiBaseUrl(apiBaseUrl)
  }

  async listRegistrations(
    context: AdminRosterContext,
    tournamentId: string,
  ): Promise<RosterRegistrationReview[]> {
    const payload = await this.request(
      context,
      `/admin/tournaments/${encodeURIComponent(tournamentId)}/team-registrations`,
    )
    return mapRosterRegistrationListResponse(payload)
  }

  async getRegistration(
    context: AdminRosterContext,
    tournamentId: string,
    registrationId: string,
  ): Promise<RosterRegistrationDetail> {
    const payload = await this.request(
      context,
      `/admin/tournaments/${encodeURIComponent(tournamentId)}/team-registrations/${encodeURIComponent(registrationId)}`,
    )
    return mapRosterRegistrationDetailResponse(payload)
  }

  private async request(context: AdminRosterContext, path: string): Promise<unknown> {
    let response: Response
    try {
      response = await fetch(`${this.apiBaseUrl}${path}`, {
        headers: {
          accept: 'application/json',
          'x-dev-organization-id': context.organizationId,
          'x-dev-user-id': context.userId,
          'x-dev-role': context.role,
          'x-request-source': 'admin-web-p2-roster-review',
        },
      })
    } catch {
      throw new AdminRosterRepositoryError('无法连接名单 API，请确认服务端已启动后重试。', 0)
    }

    if (!response.ok) {
      throw await readApiError(response)
    }

    try {
      return await response.json()
    } catch {
      throw new AdminRosterRepositoryError('名单 API 返回了无法解析的 JSON。', response.status)
    }
  }
}

class MockAdminRosterRepository implements AdminRosterRepository {
  readonly mode = 'mock' as const
  readonly apiBaseUrl = null

  async listRegistrations(
    _context: AdminRosterContext,
    _tournamentId: string,
  ): Promise<RosterRegistrationReview[]> {
    return mockRegistrationDetails.map(copyRegistration)
  }

  async getRegistration(
    _context: AdminRosterContext,
    _tournamentId: string,
    registrationId: string,
  ): Promise<RosterRegistrationDetail> {
    const detail = mockRegistrationDetails.find(
      (registration) => registration.registrationId === registrationId,
    )
    if (!detail) {
      throw new AdminRosterRepositoryError(
        '虚构名单中没有这条报名记录。',
        404,
        'RESOURCE_NOT_FOUND',
      )
    }
    return copyDetail(detail)
  }
}

const mockRegistrationDetails: RosterRegistrationDetail[] = [
  {
    registrationId: '00000000-0000-4000-8000-000000000311',
    teamId: '00000000-0000-4000-8000-000000000321',
    teamCode: 'MOCK-PHY-A',
    teamName: '星河一队（虚构）',
    registrationStatus: 'APPROVED',
    rosterStatus: 'LOCKED',
    rosterSubmissionVersion: 2,
    rosterSnapshotVersion: 2,
    playerCount: 4,
    dataQualityStatus: 'CLEAN',
    warningCodes: [],
    contactName: '测试联系人甲',
    contactPhoneMasked: '138****0001',
    leaderDisplayName: '测试领队甲',
    coachDisplayName: null,
    importBatchId: '00000000-0000-4000-8000-000000000331',
    importedAt: '2026-08-20T02:00:00.000Z',
    players: [
      {
        id: 'mock-player-a1',
        displayName: '测试球员甲',
        studentIdMasked: '2026****01',
        shirtNumber: '01',
      },
      {
        id: 'mock-player-a2',
        displayName: '测试球员乙',
        studentIdMasked: '2026****02',
        shirtNumber: '07',
      },
      { id: 'mock-player-a3', displayName: '测试球员丙', studentIdMasked: null, shirtNumber: '10' },
      {
        id: 'mock-player-a4',
        displayName: '测试球员丁',
        studentIdMasked: '2026****04',
        shirtNumber: null,
      },
    ],
  },
  {
    registrationId: '00000000-0000-4000-8000-000000000312',
    teamId: '00000000-0000-4000-8000-000000000322',
    teamCode: 'MOCK-PHY-B',
    teamName: '青岚二队（虚构）',
    registrationStatus: 'APPROVED',
    rosterStatus: 'APPROVED',
    rosterSubmissionVersion: 1,
    rosterSnapshotVersion: null,
    playerCount: 3,
    dataQualityStatus: 'WARNING',
    warningCodes: ['DUPLICATE_SHIRT_NUMBER', 'MISSING_STABLE_SOURCE_KEY'],
    contactName: '测试联系人乙',
    contactPhoneMasked: '139****0002',
    leaderDisplayName: '测试领队乙',
    coachDisplayName: '测试教练乙',
    importBatchId: '00000000-0000-4000-8000-000000000332',
    importedAt: '2026-08-20T02:10:00.000Z',
    players: [
      {
        id: 'mock-player-b1',
        displayName: '示例球员戊',
        studentIdMasked: '2026****11',
        shirtNumber: '09',
      },
      {
        id: 'mock-player-b2',
        displayName: '示例球员己',
        studentIdMasked: '2026****12',
        shirtNumber: '09',
      },
      { id: 'mock-player-b3', displayName: '示例球员庚', studentIdMasked: null, shirtNumber: '18' },
    ],
  },
]

async function readApiError(response: Response): Promise<AdminRosterRepositoryError> {
  const fallbackMessage =
    response.status === 403
      ? '没有权限查看该赛事的球队与名单。'
      : `请求失败：HTTP ${response.status}`

  try {
    const payload = (await response.json()) as Record<string, unknown>
    return new AdminRosterRepositoryError(
      typeof payload.message === 'string' ? payload.message : fallbackMessage,
      response.status,
      typeof payload.code === 'string' ? payload.code : null,
      typeof payload.requestId === 'string' ? payload.requestId : null,
    )
  } catch {
    return new AdminRosterRepositoryError(fallbackMessage, response.status)
  }
}

function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.replace(/\/+$/, '')
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
}

function copyRegistration(registration: RosterRegistrationReview): RosterRegistrationReview {
  return {
    ...registration,
    warningCodes: [...registration.warningCodes],
  }
}

function copyDetail(detail: RosterRegistrationDetail): RosterRegistrationDetail {
  return {
    ...copyRegistration(detail),
    leaderDisplayName: detail.leaderDisplayName,
    coachDisplayName: detail.coachDisplayName,
    importBatchId: detail.importBatchId,
    importedAt: detail.importedAt,
    players: detail.players.map((player) => ({ ...player })),
  }
}
