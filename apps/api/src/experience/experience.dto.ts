import { Transform } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator'

export class SearchQueryDto {
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
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @Length(2, 180)
  title?: string

  @ApiProperty({ type: String })
  @IsString()
  @Length(2, 1000)
  body!: string
}

export class CreateCommentDto {
  @ApiProperty({ type: String })
  @IsString()
  @Length(1, 300)
  body!: string
}
