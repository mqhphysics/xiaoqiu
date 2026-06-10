import { Controller, Get, Inject } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { AppService, type HealthResponse } from './app.service'

@ApiTags('system')
@Controller()
export class AppController {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  @Get('health')
  @ApiOperation({ summary: '检查 API 进程状态' })
  @ApiOkResponse({ description: 'API 正常运行' })
  health(): HealthResponse {
    return this.appService.health()
  }
}
