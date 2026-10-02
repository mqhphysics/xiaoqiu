import { Transform } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

export class SearchQueryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  tournamentId?: string

  @ApiProperty({ type: String, example: '物院' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 60)
  query!: string

  @ApiPropertyOptional({ type: String, enum: ['ALL', 'PLAYER', 'TEAM', 'MATCH', 'POST'] })
  @IsOptional()
  @IsIn(['ALL', 'PLAYER', 'TEAM', 'MATCH', 'POST'])
  category: 'ALL' | 'PLAYER' | 'TEAM' | 'MATCH' | 'POST' = 'ALL'
}

export class UpdateTeamPreferencesDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  primaryTeamId!: string

  @ApiProperty({ type: [String], maxItems: 12 })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(12)
  @IsUUID('4', { each: true })
  followedTeamIds!: string[]
}

export class CreatePostDto {
  @ApiProperty({ type: String, description: '客户端生成的动态发布幂等键' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(8, 120)
  clientPostId!: string

  @ApiPropertyOptional({ type: String, format: 'uuid', description: '以球队成员身份发布球队动态' })
  @IsOptional()
  @IsUUID()
  teamId?: string

  @ApiPropertyOptional({ type: String })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Length(2, 180)
  title?: string

  @ApiProperty({ type: String })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(0, 1000)
  body!: string

  @ApiPropertyOptional({
    type: String,
    description: '兼容旧客户端的单张 JPEG/PNG/WebP/GIF 图片，最大 4 MiB',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5_600_000)
  imageDataUrl?: string

  @ApiPropertyOptional({
    type: [String],
    maxItems: 9,
    description: '按展示顺序上传，最多 9 张；与 imageDataUrl 二选一',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  @MaxLength(5_600_000, { each: true })
  imageDataUrls?: string[]
}

export class CreateCommentDto {
  @ApiProperty({ type: String, description: '客户端生成的评论幂等键' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(8, 120)
  clientCommentId!: string

  @ApiPropertyOptional({ type: String, format: 'uuid', description: '回复的评论 ID' })
  @IsOptional()
  @IsUUID()
  parentCommentId?: string

  @ApiProperty({ type: String })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 300)
  body!: string
}

export class CreateMatchReviewDto {
  @ApiProperty({ type: Number, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number

  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Length(1, 500)
  body?: string
}
