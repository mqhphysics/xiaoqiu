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
  IsArray,
  ArrayMaxSize,
  MaxLength,
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
export class AdminCenterPostsQueryDto extends AdminCenterPageDto {
  @IsOptional() @IsIn(['DRAFT', 'PUBLISHED', 'HIDDEN']) status?: 'DRAFT' | 'PUBLISHED' | 'HIDDEN'
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

  @IsOptional()
  @IsIn(['PUBLISHED', 'DRAFT'])
  status?: 'PUBLISHED' | 'DRAFT'

  @IsOptional()
  @IsIn(['OFFICIAL', 'COMMUNITY'])
  type?: 'OFFICIAL' | 'COMMUNITY'

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  @MaxLength(5_600_000, { each: true })
  imageDataUrls?: string[]
}

export class AdminSanctionDto extends AdminCenterReasonDto {
  @IsIn(['FREEZE', 'BAN', 'RESTORE'])
  action!: 'FREEZE' | 'BAN' | 'RESTORE'
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string
}

export class AdminContentDecisionDto extends AdminCenterReasonDto {
  @IsIn(['APPROVE', 'BLOCK', 'RESTORE'])
  action!: 'APPROVE' | 'BLOCK' | 'RESTORE'
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string
}

export class AdminMediaDecisionDto extends AdminCenterReasonDto {
  @IsIn(['BLOCK', 'RESTORE'])
  action!: 'BLOCK' | 'RESTORE'
  @IsString()
  @Length(1, 512)
  url!: string
  @IsInt()
  @Min(0)
  expectedVersion!: number
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
