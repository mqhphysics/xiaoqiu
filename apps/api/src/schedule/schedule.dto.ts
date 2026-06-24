import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  MATCH_STATUSES,
  SCHEDULE_PLAN_STATUSES,
  SCHEDULE_REVISION_STATUSES,
  TOURNAMENT_STATUSES,
  type CompetitionRuleVersionView,
  type MatchView,
  type PublicTournamentListView,
  type SchedulePlanView,
  type ScheduleRevisionView,
  type SeasonView,
  type TeamView,
  type TournamentDetailView,
  type TournamentScheduleView,
  type TournamentView,
  type VenueView,
} from '@xiaoqiu/contracts'
import {
  ArrayNotEmpty,
  IsArray,
  IsISO8601,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator'

export class CreateSeasonDto {
  @ApiProperty({ example: '2026' })
  @IsString()
  @Length(1, 64)
  seasonCode!: string

  @ApiProperty({ example: '2026 校园杯赛季' })
  @IsString()
  @Length(1, 120)
  name!: string

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsISO8601({ strict: true })
  startsOn?: string

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsISO8601({ strict: true })
  endsOn?: string
}

export class CreateTournamentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  seasonId!: string

  @ApiProperty({ example: 'CAMPUS-CUP-2026' })
  @IsString()
  @Length(1, 64)
  tournamentCode!: string

  @ApiProperty({ example: '2026 校园足球杯' })
  @IsString()
  @Length(1, 160)
  name!: string
}

export class CreateCompetitionRuleVersionDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(999)
  version!: number

  @ApiProperty({ example: '首发规则' })
  @IsString()
  @Length(1, 120)
  name!: string

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  rules!: Record<string, unknown>
}

export class CreateTeamDto {
  @ApiProperty({ example: 'TEAM-A' })
  @IsString()
  @Length(1, 64)
  teamCode!: string

  @ApiProperty({ example: '数学学院' })
  @IsString()
  @Length(1, 160)
  name!: string

  @ApiPropertyOptional({ example: '数学' })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  shortName?: string
}

export class CreateVenueDto {
  @ApiProperty({ example: 'FIELD-1' })
  @IsString()
  @Length(1, 64)
  venueCode!: string

  @ApiProperty({ example: '东区足球场' })
  @IsString()
  @Length(1, 160)
  name!: string

  @ApiPropertyOptional({ example: '大学城校区东区' })
  @IsOptional()
  @IsString()
  @Length(1, 240)
  address?: string
}

export class CreateMatchDto {
  @ApiProperty({ example: 'M-001' })
  @IsString()
  @Length(1, 64)
  matchCode!: string

  @ApiProperty({ example: '数学学院 vs 物理学院' })
  @IsString()
  @Length(1, 160)
  title!: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  homeTeamId?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  awayTeamId?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  venueId?: string

  @ApiPropertyOptional({ example: '2026-10-01T09:00:00.000Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  scheduledStartAt?: string

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number
}

export class CreateSchedulePlanDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  tournamentId!: string

  @ApiProperty({ example: '小组赛首版草案' })
  @IsString()
  @Length(1, 160)
  name!: string

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  matchIds!: string[]
}

export class SeasonResponseDto implements SeasonView {
  @ApiProperty({ format: 'uuid' })
  id!: string

  @ApiProperty({ format: 'uuid' })
  organizationId!: string

  @ApiProperty()
  seasonCode!: string

  @ApiProperty()
  name!: string

  @ApiPropertyOptional({ nullable: true })
  startsOn?: string | null

  @ApiPropertyOptional({ nullable: true })
  endsOn?: string | null
}

export class TournamentResponseDto implements TournamentView {
  @ApiProperty({ format: 'uuid' })
  id!: string

  @ApiProperty({ format: 'uuid' })
  organizationId!: string

  @ApiProperty({ format: 'uuid' })
  seasonId!: string

  @ApiProperty()
  tournamentCode!: string

  @ApiProperty()
  name!: string

  @ApiProperty({ enum: TOURNAMENT_STATUSES })
  status!: TournamentView['status']
}

export class CompetitionRuleVersionResponseDto implements CompetitionRuleVersionView {
  @ApiProperty({ format: 'uuid' })
  id!: string

  @ApiProperty({ format: 'uuid' })
  organizationId!: string

  @ApiProperty({ format: 'uuid' })
  tournamentId!: string

  @ApiProperty()
  version!: number

  @ApiProperty()
  name!: string

  @ApiProperty()
  status!: CompetitionRuleVersionView['status']

  @ApiProperty({ type: 'object', additionalProperties: true })
  rules!: Record<string, unknown>

  @ApiProperty()
  publishedAt!: string
}

export class TeamResponseDto implements TeamView {
  @ApiProperty({ format: 'uuid' })
  id!: string

  @ApiProperty({ format: 'uuid' })
  organizationId!: string

  @ApiProperty()
  teamCode!: string

  @ApiProperty()
  name!: string

  @ApiPropertyOptional({ nullable: true })
  shortName?: string | null
}

export class VenueResponseDto implements VenueView {
  @ApiProperty({ format: 'uuid' })
  id!: string

  @ApiProperty({ format: 'uuid' })
  organizationId!: string

  @ApiProperty()
  venueCode!: string

  @ApiProperty()
  name!: string

  @ApiPropertyOptional({ nullable: true })
  address?: string | null
}

export class MatchResponseDto implements MatchView {
  @ApiProperty({ format: 'uuid' })
  id!: string

  @ApiProperty({ format: 'uuid' })
  organizationId!: string

  @ApiProperty({ format: 'uuid' })
  tournamentId!: string

  @ApiProperty()
  matchCode!: string

  @ApiProperty()
  title!: string

  @ApiProperty({ enum: MATCH_STATUSES })
  status!: MatchView['status']

  @ApiPropertyOptional({ nullable: true })
  scheduledStartAt?: string | null

  @ApiPropertyOptional({ nullable: true })
  homeTeam!: NonNullable<MatchView['homeTeam']> | null

  @ApiPropertyOptional({ nullable: true })
  awayTeam!: NonNullable<MatchView['awayTeam']> | null

  @ApiPropertyOptional({ nullable: true })
  venue!: NonNullable<MatchView['venue']> | null
}

export class SchedulePlanResponseDto implements SchedulePlanView {
  @ApiProperty({ format: 'uuid' })
  id!: string

  @ApiProperty({ format: 'uuid' })
  organizationId!: string

  @ApiProperty({ format: 'uuid' })
  tournamentId!: string

  @ApiProperty()
  name!: string

  @ApiProperty({ enum: SCHEDULE_PLAN_STATUSES })
  status!: SchedulePlanView['status']

  @ApiPropertyOptional({ nullable: true })
  publishedAt?: string | null
}

export class ScheduleRevisionResponseDto implements ScheduleRevisionView {
  @ApiProperty({ format: 'uuid' })
  id!: string

  @ApiProperty({ format: 'uuid' })
  organizationId!: string

  @ApiProperty({ format: 'uuid' })
  tournamentId!: string

  @ApiProperty({ format: 'uuid' })
  schedulePlanId!: string

  @ApiProperty()
  version!: number

  @ApiProperty({ enum: SCHEDULE_REVISION_STATUSES })
  status!: ScheduleRevisionView['status']

  @ApiProperty()
  publishedAt!: string
}

export class TournamentDetailResponseDto
  extends TournamentResponseDto
  implements TournamentDetailView
{
  @ApiProperty({ type: SeasonResponseDto })
  season!: SeasonResponseDto

  @ApiProperty({ type: [CompetitionRuleVersionResponseDto] })
  ruleVersions!: CompetitionRuleVersionResponseDto[]
}

export class TournamentScheduleResponseDto implements TournamentScheduleView {
  @ApiProperty({ type: TournamentResponseDto })
  tournament!: TournamentResponseDto

  @ApiProperty({ type: ScheduleRevisionResponseDto })
  revision!: ScheduleRevisionResponseDto

  @ApiProperty({ type: [MatchResponseDto] })
  matches!: MatchResponseDto[]
}

export class PublicTournamentListResponseDto implements PublicTournamentListView {
  @ApiProperty({ type: [TournamentResponseDto] })
  items!: TournamentResponseDto[]
}
