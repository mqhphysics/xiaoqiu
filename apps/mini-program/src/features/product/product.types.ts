export type MatchStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'CHECK_IN'
  | 'LIVE'
  | 'FINISHED'
  | 'CONFIRMED'
  | 'POSTPONED'
  | 'CANCELLED'
  | 'ABANDONED'

export type SearchCategory = 'ALL' | 'PLAYER' | 'TEAM' | 'MATCH' | 'POST'

export interface TeamSummary {
  id: string
  teamCode: string
  name: string
  shortName: string
  collegeName: string | null
  primaryColor: string | null
  secondaryColor: string | null
  groupName?: string | null
}
export interface MatchSummary {
  id: string
  tournamentId: string
  matchCode: string
  title: string
  status: MatchStatus
  scheduledStartAt: string | null
  homeTeam: TeamSummary | null
  awayTeam: TeamSummary | null
  homeScore: number | null
  awayScore: number | null
  homePenaltyScore: number | null
  awayPenaltyScore: number | null
  statusReason: string | null
  venue: { id: string; name: string } | null
  stageName?: string | null
  stageType?: string | null
  groupName?: string | null
  roundName?: string | null
  homePlaceholder?: string | null
  awayPlaceholder?: string | null
}

export interface PostAuthor {
  id: string
  displayName: string
  verificationLevel: string
}

export interface PostSummary {
  id: string
  type: 'OFFICIAL' | 'COMMUNITY'
  title: string | null
  body: string
  publishedAt: string
  author: PostAuthor
  likeCount: number
  commentCount: number
  likedByMe: boolean
}

export interface PostComment {
  id: string
  body: string
  createdAt: string
  author: PostAuthor
}

export interface PostDetail extends PostSummary {
  comments: PostComment[]
}

export interface AuthRole {
  role: string
  scopeType: string
  scopeId: string
}

export interface AuthUser {
  id: string
  username: string
  displayName: string
  bio: string | null
  verificationLevel: string
  roles: AuthRole[]
  linkedPlayer: {
    id: string
    displayName: string
    position: string | null
  } | null
}

export interface AuthSession {
  accessToken: string
  expiresAt: string
  user: AuthUser
}

export interface HomeResponse {
  tournament: {
    id: string
    name: string
    seasonName: string
    status: string
    teamCount: number
    matchCount: number
  }
  announcements: PostSummary[]
  focusMatches: MatchSummary[]
  teams: TeamSummary[]
  posts: PostSummary[]
  viewer: AuthUser | null
}

export interface SeasonOption {
  tournamentId: string
  tournamentName: string
  seasonId: string
  seasonName: string
  year: string
  status: string
}

export interface StandingRow {
  rank: number
  teamId: string
  teamName: string
  shortName: string
  primaryColor: string | null
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
  isLive?: boolean
}

export interface PlayerStats {
  id: string
  displayName: string
  appearances: number
  starts: number
  minutes: number
  goals: number
  assists: number
  yellowCards: number
  redCards: number
  team: TeamSummary | null
}

export interface CompetitionDataResponse {
  tournament: {
    id: string
    name: string
    seasonName: string
    status: string
  }
  seasons: SeasonOption[]
  schedule: MatchSummary[]
  groups: Array<{
    id: string
    name: string
    standings: StandingRow[]
  }>
  bracket: Array<{
    id: string
    name: string
    number: number
    matches: MatchSummary[]
  }>
  leaders: {
    scorers: PlayerStats[]
    assists: PlayerStats[]
  }
  updatedAt: string
}

export interface TeamDashboardResponse {
  team: TeamSummary & {
    description: string | null
    motto: string | null
    foundedYear: number | null
    coachName: string | null
    captainName: string | null
    groupName: string | null
  }
  stats: {
    played: number
    won: number
    drawn: number
    lost: number
    goalsFor: number
    goalsAgainst: number
    points: number
    goalDifference: number
  }
  recentMatches: MatchSummary[]
  upcomingMatches: MatchSummary[]
  roster: Array<{
    id: string
    displayName: string
    jerseyName: string | null
    shirtNumber: string | null
    position: string | null
    secondaryPosition: string | null
    academicYear: string | null
    heightCm: number | null
    profileColor: string | null
    appearances: number
    goals: number
    assists: number
  }>
}

export interface PlayerDetailResponse {
  id: string
  displayName: string
  jerseyName: string | null
  shirtNumber: string | null
  position: string | null
  secondaryPosition: string | null
  dominantFoot: string | null
  heightCm: number | null
  academicYear: string | null
  major: string | null
  hometown: string | null
  bio: string | null
  profileColor: string | null
  team: TeamSummary | null
  tournamentName: string | null
  stats: PlayerStats
  recentMatches: Array<MatchSummary & { starter: boolean; minutesPlayed: number }>
}

export interface MatchExperienceResponse extends MatchSummary {
  summary: string | null
  attendance: number | null
  events: Array<{
    id: string
    type: string
    minute: number
    stoppageMinute: number | null
    description: string | null
    team: TeamSummary
    player: { id: string; displayName: string } | null
    relatedPlayer: { id: string; displayName: string } | null
  }>
  lineups: Array<{
    team: TeamSummary
    players: Array<{
      id: string
      displayName: string
      shirtNumber: string | null
      position: string | null
      starter: boolean
      minutesPlayed: number
    }>
  }>
}

export interface TeamPreferencesResponse {
  primaryTeam: TeamSummary | null
  followedTeams: TeamSummary[]
  availableTeams: TeamSummary[]
}

export interface SearchResponse {
  query: string
  players: Array<{
    id: string
    displayName: string
    position: string | null
    academicYear: string | null
    profileColor: string | null
    team: TeamSummary | null
  }>
  teams: TeamSummary[]
  matches: MatchSummary[]
  posts: PostSummary[]
}

export interface LikeResponse {
  liked: boolean
  likeCount: number
}
