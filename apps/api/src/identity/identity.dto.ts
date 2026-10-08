import { Transform, Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator'

export const IDENTITY_KINDS = [
  'STUDENT',
  'PLAYER',
  'TEAM_CAPTAIN',
  'TEAM_COACH',
  'MATCH_REPORTER',
] as const
export type IdentityKind = (typeof IDENTITY_KINDS)[number]

export class IdentityApplicationDto {
  @IsIn(IDENTITY_KINDS)
  kind!: IdentityKind

  @IsOptional()
  @IsString()
  @Length(40, 43)
  candidateId?: string

  @IsOptional()
  @IsUUID()
  teamId?: string

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(8, 1000)
  message!: string
}

export class IdentityReviewDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED'

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number

  @IsOptional()
  @IsString()
  @Length(40, 43)
  resolvedCandidateId?: string

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(8, 1000)
  note!: string
}

export class IdentityRecordDto {
  @IsOptional()
  @IsUUID()
  verifiedUserId?: string
  @IsIn(IDENTITY_KINDS)
  kind!: IdentityKind

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 120)
  displayName!: string

  @IsOptional()
  @IsUUID()
  teamId?: string

  @IsOptional()
  @IsUUID()
  playerProfileId?: string

  @IsOptional()
  @IsIn(['MATCH', 'TOURNAMENT'])
  scopeType?: 'MATCH' | 'TOURNAMENT'

  @IsOptional()
  @IsUUID()
  scopeId?: string

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(8, 1000)
  reason!: string
}

export class ConfirmIdentityDto {
  @IsUUID()
  recordId!: string
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number
}

export class RevokeIdentityRecordDto {
  // Both pending verified and active records can be withdrawn by administrators.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(8, 1000)
  reason!: string
}
export class VerifyIdentityUserDto {
  @IsUUID() verifiedUserId!: string
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(8, 1000)
  reason!: string
}
