import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common'
import type { Response } from 'express'
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger'
import { AuthorizeInApplicationService } from '../auth/application-authorization'
import { getRequestId, type RequestWithId } from '../common/request-context'
import { ManagedMediaService } from './managed-media.service'
import { MediaVisibilityDto, ReviewMediaDto, SubmitMediaDto } from './managed-media.dto'

@Controller()
@ApiTags('managed-media')
@ApiBearerAuth()
@AuthorizeInApplicationService()
export class ManagedMediaController {
  constructor(@Inject(ManagedMediaService) private readonly service: ManagedMediaService) {}

  @Post('media-assets')
  @ApiBody({ type: SubmitMediaDto })
  submit(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: SubmitMediaDto,
    @Req() request: RequestWithId,
  ) {
    return this.service.submit(authorization, body, getRequestId(request))
  }

  @Get('media-assets/mine')
  mine(
    @Headers('authorization') authorization: string | undefined,
    @Query('before') before?: string,
  ) {
    return this.service.mine(authorization, before)
  }

  @Get('admin/media-assets')
  queue(
    @Headers('authorization') authorization: string | undefined,
    @Query('before') before?: string,
  ) {
    return this.service.queue(authorization, before)
  }

  @Put('admin/media-assets/:id/review')
  @ApiBody({ type: ReviewMediaDto })
  review(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: ReviewMediaDto,
    @Req() request: RequestWithId,
  ) {
    return this.service.review(authorization, id, body, getRequestId(request))
  }

  @Put('media-assets/:id/visibility')
  @ApiBody({ type: MediaVisibilityDto })
  visibility(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: MediaVisibilityDto,
    @Req() request: RequestWithId,
  ) {
    return this.service.visibility(authorization, id, body, getRequestId(request))
  }

  @Get('media-assets/matches/:matchId/goals')
  forMatch(
    @Headers('authorization') authorization: string | undefined,
    @Param('matchId') id: string,
  ) {
    return this.service.forMatch(authorization, id)
  }

  @Get('media-assets/users/:userId/presentation')
  presentation(
    @Headers('authorization') authorization: string | undefined,
    @Param('userId') id: string,
  ) {
    return this.service.presentation(authorization, id)
  }

  @Get('media-assets/:id/content')
  async content(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    await this.send(authorization, id, false, response)
  }

  @Get('media-assets/:id/poster')
  async poster(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    await this.send(authorization, id, true, response)
  }

  private async send(
    authorization: string | undefined,
    id: string,
    poster: boolean,
    response: Response,
  ) {
    const media = await this.service.content(authorization, id, poster)
    response.setHeader('Cache-Control', 'private, no-store')
    response.setHeader('Vary', 'Authorization')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
    response.type(media.mimeType).send(media.body)
  }
}
