export type MatchStatus = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED' | 'CANCELLED'

export interface ReadonlyTournamentSummary {
  id: string
  name: string
  code: string
  seasonName: string
  organizationName: string
  statusText: string
  startDate: string
  endDate: string
  teamCount: number
  matchCount: number
  description: string
}

export interface ReadonlyTeam {
  id: string
  tournamentId: string
  name: string
  shortName: string
  groupName: string
  coachName: string
  captainName: string
  colors: string
  rosterPreview: string[]
}

export interface ReadonlyMatch {
  id: string
  tournamentId: string
  stageName: string
  groupName?: string
  roundName: string
  scheduledStartAt: string
  venueName: string
  pitchName: string
  homeTeamId: string
  awayTeamId: string
  homeTeamName: string
  awayTeamName: string
  status: MatchStatus
  statusReason?: string
}

export interface ReadonlyTournamentDetail extends ReadonlyTournamentSummary {
  rules: string[]
  teams: ReadonlyTeam[]
  recentMatches: ReadonlyMatch[]
}

export interface ReadonlyScheduleFixture {
  tournaments: ReadonlyTournamentDetail[]
}

export interface ScheduleDateGroup {
  dateKey: string
  dateLabel: string
  stages: ScheduleStageGroup[]
}

export interface ScheduleStageGroup {
  stageName: string
  matches: ReadonlyMatch[]
}
