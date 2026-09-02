import { Body, Controller, Get, Headers, Inject, Param, Put, Req, Res } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'

import { UploadAvatarDto } from '../auth/auth.dto'
import { getRequestId, type RequestWithId } from '../common/request-context'
import { MediaService } from './media.service'

@ApiTags('media')
@Controller()
export class MediaController {
  constructor(@Inject(MediaService) private readonly mediaService: MediaService) {}

  @Put('me/avatar')
  @ApiBearerAuth()
  @ApiOperation({ summary: '保存浏览器裁剪压缩后的当前用户头像' })
  @ApiBody({ type: UploadAvatarDto })
  @ApiOkResponse({ description: '返回头像元数据与刷新后的用户资料' })
  updateMyAvatar(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: UploadAvatarDto,
    @Req() request: RequestWithId,
  ) {
    return this.mediaService.updateMyAvatar(authorization, body.dataUrl, getRequestId(request))
  }

  @Put('players/:playerId/avatar')
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新本人已关联球员（或管理员授权）的头像' })
  @ApiBody({ type: UploadAvatarDto })
  updatePlayerAvatar(
    @Headers('authorization') authorization: string | undefined,
    @Param('playerId') playerId: string,
    @Body() body: UploadAvatarDto,
    @Req() request: RequestWithId,
  ) {
    return this.mediaService.updatePlayerAvatar(
      authorization,
      playerId,
      body.dataUrl,
      getRequestId(request),
    )
  }

  @Get('media/avatars/:fileName')
  @ApiOperation({ summary: '读取公开头像文件' })
  async avatar(@Param('fileName') fileName: string, @Res() response: Response): Promise<void> {
    const avatar = await this.mediaService.readAvatar(fileName)
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.type(avatar.mimeType).send(avatar.body)
  }
}
