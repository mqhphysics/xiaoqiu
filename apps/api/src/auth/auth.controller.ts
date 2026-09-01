import { Body, Controller, Get, Headers, HttpCode, Inject, Ip, Post, Req } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import type { Request } from 'express'

import { ApiErrorResponseDto } from '../common/api-error-response.dto'
import { getRequestId, type RequestWithId } from '../common/request-context'
import { DEMO_ORGANIZATION_ID } from '../database/demo-fixture'
import {
  AuthUserDto,
  LoginDto,
  LoginResponseDto,
  RegisterDto,
  ResetPasswordByIdentityDto,
} from './auth.dto'
import { AuthService } from './auth.service'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: '使用用户名、昵称、实名、学号或邮箱登录' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  login(@Body() body: LoginDto, @Ip() ip: string, @Req() request: Request) {
    return this.authService.login(body.username, body.password, {
      ip,
      userAgent: request.headers['user-agent'],
    })
  }

  @Post('register')
  @ApiOperation({ summary: '注册实名学生账号' })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ type: LoginResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  register(
    @Body() body: RegisterDto,
    @Headers('x-dev-organization-id') organizationId: string | undefined,
    @Ip() ip: string,
    @Req() request: RequestWithId,
  ) {
    return this.authService.register(body, organizationId?.trim() || DEMO_ORGANIZATION_ID, {
      ip,
      requestId: getRequestId(request),
      userAgent: request.headers['user-agent'],
    })
  }

  @Post('password/reset-by-identity')
  @HttpCode(204)
  @ApiOperation({ summary: '演示环境通过实名与学号重置密码' })
  @ApiBody({ type: ResetPasswordByIdentityDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async resetPasswordByIdentity(
    @Body() body: ResetPasswordByIdentityDto,
    @Ip() ip: string,
    @Req() request: RequestWithId,
  ): Promise<void> {
    await this.authService.resetPasswordByIdentity(body, {
      ip,
      requestId: getRequestId(request),
      userAgent: request.headers['user-agent'],
    })
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '读取当前登录用户' })
  @ApiOkResponse({ type: AuthUserDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async me(@Headers('authorization') authorization: string | undefined) {
    return (await this.authService.requireSession(authorization)).user
  }

  @Post('logout')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: '撤销当前会话' })
  async logout(@Headers('authorization') authorization: string | undefined): Promise<void> {
    await this.authService.logout(authorization)
  }
}
