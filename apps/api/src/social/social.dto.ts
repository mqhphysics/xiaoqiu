import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator'

const POSITIONS = ['GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD'] as const

export class CreateTeamApplicationDto {
  @ApiPropertyOptional({ type: String, enum: POSITIONS })
  @IsOptional()
  @IsIn(POSITIONS)
  requestedPosition?: (typeof POSITIONS)[number]

  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Length(1, 500)
  message?: string
}

export class ReviewTeamApplicationDto {
  @ApiProperty({ type: String, enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED'

  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string
}

export class UpdateTeamMemberDto {
  @ApiProperty({ type: String, enum: POSITIONS })
  @IsIn(POSITIONS)
  position!: (typeof POSITIONS)[number]
}

export class CreateReportDto {
  @ApiProperty({ type: String, description: '客户端生成的投诉/反馈幂等键' })
  @IsString()
  @Length(8, 120)
  clientReportId!: string

  @ApiProperty({
    type: String,
    enum: ['POST', 'COMMENT', 'MATCH_REVIEW', 'DIRECT_MESSAGE', 'USER', 'FEEDBACK'],
  })
  @IsIn(['POST', 'COMMENT', 'MATCH_REVIEW', 'DIRECT_MESSAGE', 'USER', 'FEEDBACK'])
  targetType!: 'POST' | 'COMMENT' | 'MATCH_REVIEW' | 'DIRECT_MESSAGE' | 'USER' | 'FEEDBACK'

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  targetId?: string

  @ApiProperty({ type: String, maxLength: 120 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 120)
  reason!: string

  @ApiPropertyOptional({ type: String, maxLength: 1000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  details?: string
}

export class ReviewReportDto {
  @ApiProperty({ type: String, enum: ['IN_REVIEW', 'RESOLVED', 'REJECTED'] })
  @IsIn(['IN_REVIEW', 'RESOLVED', 'REJECTED'])
  status!: 'IN_REVIEW' | 'RESOLVED' | 'REJECTED'

  @ApiProperty({ type: String, maxLength: 1000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 1000)
  resolution!: string

  @ApiPropertyOptional({ type: Boolean, default: false })
  @IsOptional()
  @IsBoolean()
  hideContent?: boolean
}

export class CreateDirectMessageDto {
  @ApiProperty({ type: String, maxLength: 2000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 2000)
  body!: string

  @ApiProperty({ type: String, description: '客户端生成的单次发送幂等键' })
  @IsString()
  @Length(8, 120)
  clientMessageId!: string
}
