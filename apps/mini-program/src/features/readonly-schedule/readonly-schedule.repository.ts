import Taro from '@tarojs/taro'

import { readonlyScheduleMockFixture } from './mock-fixture'
import type {
  ReadonlyMatch,
  ReadonlyScheduleFixture,
  ReadonlyTeam,
  ReadonlyTournamentDetail,
  ReadonlyTournamentSummary,
} from './readonly-schedule.types'

interface RepositoryResult<T> {
  data: T
  source: 'api' | 'mock'
}

class ReadonlyScheduleRepository {
  async listTournaments(): Promise<RepositoryResult<ReadonlyTournamentSummary[]>> {
    const fixture = await this.loadFixture()
    return {
      data: fixture.data.tournaments.map(toTournamentSummary),
      source: fixture.source,
    }
  }

  async getTournament(tournamentId: string): Promise<RepositoryResult<ReadonlyTournamentDetail | null>> {
    const fixture = await this.loadFixture()
    return {
      data: fixture.data.tournaments.find((tournament) => tournament.id === tournamentId) ?? null,
      source: fixture.source,
    }
  }

  async listMatches(tournamentId: string): Promise<RepositoryResult<ReadonlyMatch[]>> {
    const fixture = await this.loadFixture()
    const tournament = fixture.data.tournaments.find((item) => item.id === tournamentId)
    return {
      data: tournament?.recentMatches ?? [],
      source: fixture.source,
    }
  }

  async getMatch(matchId: string): Promise<RepositoryResult<ReadonlyMatch | null>> {
    const fixture = await this.loadFixture()
    const matches = fixture.data.tournaments.flatMap((tournament) => tournament.recentMatches)
    return {
      data: matches.find((match) => match.id === matchId) ?? null,
      source: fixture.source,
    }
  }

  async getTeam(teamId: string): Promise<RepositoryResult<ReadonlyTeam | null>> {
    const fixture = await this.loadFixture()
    const teams = fixture.data.tournaments.flatMap((tournament) => tournament.teams)
    return {
      data: teams.find((team) => team.id === teamId) ?? null,
      source: fixture.source,
    }
  }

  private async loadFixture(): Promise<RepositoryResult<ReadonlyScheduleFixture>> {
    const baseUrl = getApiBaseUrl()
    if (!baseUrl) {
      return { data: readonlyScheduleMockFixture, source: 'mock' }
    }

    try {
      const response = await Taro.request<ReadonlyScheduleFixture>({
        url: `${baseUrl.replace(/\/$/, '')}/readonly-schedule`,
        method: 'GET',
        timeout: 5000,
      })

      if (response.statusCode >= 200 && response.statusCode < 300 && response.data?.tournaments) {
        return { data: response.data, source: 'api' }
      }
    } catch {
      // Mock fallback keeps P1 read-only pages usable while the API branch is still converging.
    }

    return { data: readonlyScheduleMockFixture, source: 'mock' }
  }
}

export const readonlyScheduleRepository = new ReadonlyScheduleRepository()

function toTournamentSummary(tournament: ReadonlyTournamentDetail): ReadonlyTournamentSummary {
  const {
    id,
    name,
    code,
    seasonName,
    organizationName,
    statusText,
    startDate,
    endDate,
    teamCount,
    matchCount,
    description,
  } = tournament

  return {
    id,
    name,
    code,
    seasonName,
    organizationName,
    statusText,
    startDate,
    endDate,
    teamCount,
    matchCount,
    description,
  }
}

function getApiBaseUrl(): string | undefined {
  const maybeProcess = globalThis as {
    process?: { env?: { TARO_APP_API_BASE_URL?: string } }
  }
  const value = maybeProcess.process?.env?.TARO_APP_API_BASE_URL
  return value && value.trim().length > 0 ? value.trim() : undefined
}
