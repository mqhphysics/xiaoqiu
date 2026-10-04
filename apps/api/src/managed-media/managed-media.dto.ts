import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, MaxLength, Min } from 'class-validator'

export const MEDIA_PURPOSES = [
  'GOAL_GIF',
  'USER_AVATAR',
  'USER_BACKGROUND',
  'PLAYER_PORTRAIT',
] as const
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number]

export class SubmitMediaDto {
  @IsIn(MEDIA_PURPOSES)
  purpose!: MediaPurpose

  @IsUUID()
  targetId!: string

  @IsString()
  @Length(8, 120)
  clientSubmissionId!: string

  @IsString()
  @Length(32, 8_388_640)
  dataUrl!: string
}

export class ReviewMediaDto {
  @IsIn(['APPROVE', 'REJECT'])
  action!: 'APPROVE' | 'REJECT'

  @IsInt()
  @Min(0)
  expectedVersion!: number

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string
}

export class MediaVisibilityDto {
  @IsIn(['HIDE', 'DELETE', 'RESTORE'])
  action!: 'HIDE' | 'DELETE' | 'RESTORE'

  @IsInt()
  @Min(0)
  expectedVersion!: number

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string
}
