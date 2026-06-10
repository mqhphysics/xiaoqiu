import { Controller, Get, Inject, Req } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { AppService } from './app.service'
import { getRequestId, type RequestWithId } from './common/request-context'
import { HealthResponseDto } from './health-response.dto'

@ApiTags('system')
@Controller()
export class AppController {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  @Get('health')
  @ApiOperation({ summary: '检查 API 与数据库状态' })
  @ApiOkResponse({ description: '返回 API 与数据库连通性状态', type: HealthResponseDto })
  health(@Req() request: RequestWithId): Promise<HealthResponseDto> {
    return this.appService.health(getRequestId(request))
  }
}
