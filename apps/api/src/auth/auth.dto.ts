import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsString, Length } from 'class-validator'

export class LoginDto {
  @ApiProperty({ type: String, example: 'student' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @Length(3, 120)
  username!: string

  @ApiProperty({ type: String, example: 'Xiaoqiu2026!' })
  @IsString()
  @Length(8, 128)
  password!: string
}

export class AuthRoleDto {
  @ApiProperty({ type: String, example: 'TEAM_CAPTAIN' })
  role!: string

  @ApiProperty({ type: String, example: 'TEAM' })
  scopeType!: string

  @ApiProperty({ type: String, example: '00000000-0000-4000-8000-000000000000' })
  scopeId!: string
}

export class LinkedPlayerDto {
  @ApiProperty({ type: String })
  id!: string

  @ApiProperty({ type: String })
  displayName!: string

  @ApiProperty({ type: String, required: false, nullable: true })
  position!: string | null
}

export class AuthUserDto {
  @ApiProperty({ type: String })
  id!: string

  @ApiProperty({ type: String })
  username!: string

  @ApiProperty({ type: String })
  displayName!: string

  @ApiProperty({ type: String, required: false, nullable: true })
  bio!: string | null

  @ApiProperty({ type: String, example: 'STUDENT_VERIFIED' })
  verificationLevel!: string

  @ApiProperty({ type: () => [AuthRoleDto] })
  roles!: AuthRoleDto[]

  @ApiProperty({ type: () => LinkedPlayerDto, required: false, nullable: true })
  linkedPlayer!: LinkedPlayerDto | null
}

export class LoginResponseDto {
  @ApiProperty({ type: String })
  accessToken!: string

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string

  @ApiProperty({ type: () => AuthUserDto })
  user!: AuthUserDto
}
