import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator'

export class LineupSlotDto {
  @ApiProperty({ type: String })
  @IsString()
  @Length(1, 32)
  slotId!: string
  @ApiProperty({ type: String })
  @IsString()
  @Length(1, 12)
  label!: string
  @ApiProperty({ type: Number, minimum: 0, maximum: 100 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  x!: number
  @ApiProperty({ type: Number, minimum: 0, maximum: 100 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  y!: number
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  playerId!: string | null
}

export class LineupPayloadDto {
  @ApiProperty({ type: String })
  @IsString()
  @Length(1, 32)
  formation!: string
  @ApiProperty({ enum: [5, 7, 8, 11] })
  @IsIn([5, 7, 8, 11])
  format!: 5 | 7 | 8 | 11
  @ApiProperty({ type: () => [LineupSlotDto] })
  @IsArray()
  @ArrayMinSize(5)
  @ArrayMaxSize(11)
  @ValidateNested({ each: true })
  @Type(() => LineupSlotDto)
  slots!: LineupSlotDto[]
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  benchPlayerIds!: string[]
}

export class SaveLineupPlanDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  planId?: string
  @ApiProperty({ type: String })
  @IsString()
  @Length(1, 60)
  name!: string
  @ApiProperty({ enum: ['TACTIC', 'MATCH_LINEUP'] })
  @IsIn(['TACTIC', 'MATCH_LINEUP'])
  kind!: 'TACTIC' | 'MATCH_LINEUP'
  @ApiProperty({ type: Number, minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedVersion!: number
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  tournamentId?: string | null
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  matchId?: string | null
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  rosterSnapshotId?: string | null
  @ApiProperty({ type: () => LineupPayloadDto })
  @ValidateNested()
  @Type(() => LineupPayloadDto)
  payload!: LineupPayloadDto
}
