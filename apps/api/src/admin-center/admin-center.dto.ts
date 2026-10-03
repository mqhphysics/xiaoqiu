import { Transform, Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator'

export class AdminCenterPageDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(0, 80)
  query?: string
}

export class AdminCenterUsersQueryDto extends AdminCenterPageDto {
  @IsOptional()
  @IsIn(['PENDING', 'ACTIVE', 'SUSPENDED', 'LEFT'])
  status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'LEFT'
}

export class AdminCenterAuditQueryDto extends AdminCenterPageDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  action?: string

  @IsOptional()
  @IsString()
  @Length(1, 120)
  targetType?: string
}

export class AdminCenterReasonDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 500)
  reason!: string
}

export class AdminCenterMembershipDto extends AdminCenterReasonDto {
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status!: 'ACTIVE' | 'SUSPENDED'

  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string
}

export class AdminCenterEditDto extends AdminCenterReasonDto {
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string

  @IsObject()
  patch!: Record<string, unknown>
}

export class AdminCenterCreateTeamDto extends AdminCenterReasonDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 64)
  teamCode!: string

  @IsObject()
  profile!: Record<string, unknown>
}

export class AdminCenterCreatePlayerDto extends AdminCenterReasonDto {
  @IsUUID()
  teamId!: string

  @IsObject()
  profile!: Record<string, unknown>
}

export class AdminCenterCreatePostDto extends AdminCenterReasonDto {
  @IsUUID()
  tournamentId!: string

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 180)
  title!: string

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 2000)
  body!: string
}

export class AdminCenterRuleVersionDto extends AdminCenterReasonDto {
  @IsInt()
  @Min(1)
  @Max(999)
  version!: number

  @IsInt()
  @Min(0)
  @Max(999)
  expectedVersion!: number

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 120)
  name!: string

  @IsObject()
  rules!: Record<string, unknown>
}
