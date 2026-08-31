import { Body, Controller, Get, Headers, HttpCode, Inject, Ip, Post, Req } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import type { Request } from 'express'

import { ApiErrorResponseDto } from '../common/api-error-response.dto'
import { AuthUserDto, LoginDto, LoginResponseDto } from './auth.dto'
import { AuthService } from './auth.service'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: '使用本地演示账号登录' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  login(@Body() body: LoginDto, @Ip() ip: string, @Req() request: Request) {
    return this.authService.login(body.username, body.password, {
      ip,
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
