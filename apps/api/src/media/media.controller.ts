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

  @Get('media/guard-status')
  guardStatus() {
    return { guardVersion: 1, cacheControl: 'no-store' }
  }

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
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Xiaoqiu-Media-Guard', '1')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.type(avatar.mimeType).send(avatar.body)
  }

  @Get('media/demo/:kind/:fileName')
  @ApiOperation({ summary: '读取本地演示队徽或人物示意照片' })
  async demoMedia(
    @Param('kind') kind: string,
    @Param('fileName') fileName: string,
    @Res() response: Response,
  ): Promise<void> {
    const media = await this.mediaService.readDemoMedia(kind, fileName)
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Xiaoqiu-Media-Guard', '1')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.type(media.mimeType).send(media.body)
  }

  @Get('media/posts/:organizationId/:authorUserId/:fileName')
  @ApiOperation({ summary: '读取已公开动态关联的照片' })
  async postImage(
    @Param('organizationId') organizationId: string,
    @Param('authorUserId') authorUserId: string,
    @Param('fileName') fileName: string,
    @Res() response: Response,
  ): Promise<void> {
    const image = await this.mediaService.readPostImage(organizationId, authorUserId, fileName)
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Xiaoqiu-Media-Guard', '1')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.type(image.mimeType).send(image.body)
  }
}
