import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator'

export class LoginDto {
  @ApiProperty({
    type: String,
    description: '用户名、昵称、真实姓名、学号或绑定邮箱',
    example: '20249990001',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 254)
  username!: string

  @ApiProperty({ type: String, example: 'Xiaoqiu2026!' })
  @IsString()
  @Length(8, 128)
  password!: string
}

export class RegisterDto {
  @ApiProperty({ type: String, description: '登录用户名', example: 'linzhixia' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(3, 32)
  @Matches(/^[A-Za-z0-9_.-]+$/, { message: '用户名只能包含字母、数字、点、下划线和短横线' })
  username!: string

  @ApiProperty({ type: String, description: '公开昵称', example: '知夏看球' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 120)
  displayName!: string

  @ApiProperty({ type: String, description: '后台实名', example: '林知夏' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 120)
  realName!: string

  @ApiProperty({ type: String, example: '20249990001' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(6, 32)
  @Matches(/^[A-Za-z0-9-]+$/, { message: '学号格式不正确' })
  studentId!: string

  @ApiProperty({ type: String, format: 'email', example: 'student@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @Length(5, 254)
  email!: string

  @ApiProperty({ type: String, example: 'YourPassword2026!' })
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

  @ApiProperty({ type: String, required: false, nullable: true })
  avatarUrl!: string | null
}

export class AuthUserDto {
  @ApiProperty({ type: String })
  id!: string

  @ApiProperty({ type: String, format: 'uuid', description: '当前会话绑定的组织' })
  organizationId!: string

  @ApiProperty({ type: String })
  username!: string

  @ApiProperty({ type: String })
  displayName!: string

  @ApiProperty({ type: String, required: false, nullable: true })
  realName!: string | null

  @ApiProperty({ type: String, required: false, nullable: true })
  studentId!: string | null

  @ApiProperty({ type: String, required: false, nullable: true })
  email!: string | null

  @ApiProperty({ type: String, required: false, nullable: true })
  bio!: string | null

  @ApiProperty({ type: String, required: false, nullable: true })
  avatarUrl!: string | null

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

export class ResetPasswordByIdentityDto {
  @ApiProperty({ type: String, example: '林知夏' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 120)
  realName!: string

  @ApiProperty({ type: String, example: '20249990001' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(6, 32)
  studentId!: string

  @ApiProperty({ type: String, example: 'Xiaoqiu2026!' })
  @IsString()
  @Length(8, 128)
  newPassword!: string
}

export class UpdateProfileDto {
  @ApiProperty({ type: String, description: '公开昵称' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 120)
  displayName!: string

  @ApiProperty({ type: String, format: 'email', description: '绑定邮箱' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @Length(5, 254)
  email!: string

  @ApiProperty({ type: String, required: false, nullable: true, description: '公开简介' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Length(0, 280)
  bio?: string
}

export class UploadAvatarDto {
  @ApiProperty({
    type: String,
    description: '浏览器裁剪压缩后的 data URL；最大约 72 KiB 原始文件',
  })
  @IsString()
  @Length(100, 100_000)
  dataUrl!: string
}

export class AdminIdentityDto {
  @ApiProperty({ type: String })
  id!: string

  @ApiProperty({ type: String })
  username!: string

  @ApiProperty({ type: String })
  displayName!: string

  @ApiProperty({ type: String, required: false, nullable: true })
  realName!: string | null

  @ApiProperty({ type: String, required: false, nullable: true })
  studentId!: string | null

  @ApiProperty({ type: String, required: false, nullable: true })
  email!: string | null

  @ApiProperty({ type: String })
  verificationLevel!: string

  @ApiProperty({ type: [String] })
  roles!: string[]
}
