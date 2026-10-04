import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiHeader, ApiTags } from '@nestjs/swagger'
import { randomUUID } from 'node:crypto'
import { AuthorizeInApplicationService } from '../auth/application-authorization'
import type { RequestWithId } from '../common/request-context'
import {
  IdentityApplicationDto,
  IdentityRecordDto,
  IdentityReviewDto,
  RevokeIdentityRecordDto,
} from './identity.dto'
import { IdentityService } from './identity.service'

@Controller()
@ApiTags('identity')
@ApiBearerAuth()
@AuthorizeInApplicationService()
export class IdentityController {
  constructor(@Inject(IdentityService) private readonly service: IdentityService) {}

  @Get('me/identity')
  me(@Headers('authorization') authorization: string | undefined) {
    return this.service.myIdentity(authorization)
  }

  @Post('me/identity/applications')
  @ApiBody({ type: IdentityApplicationDto })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  apply(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: IdentityApplicationDto,
    @Req() request: RequestWithId,
  ) {
    return this.service.apply(authorization, body, key, request.requestId ?? randomUUID())
  }

  @Get('admin/identity/applications')
  applications(
    @Headers('authorization') authorization: string | undefined,
    @Req() request: RequestWithId,
  ) {
    return this.service.applications(authorization, request.requestId ?? randomUUID())
  }

  @Post('admin/identity/applications/:id/review')
  @ApiBody({ type: IdentityReviewDto })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  review(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: IdentityReviewDto,
    @Req() request: RequestWithId,
  ) {
    return this.service.review(authorization, id, body, key, request.requestId ?? randomUUID())
  }

  @Get('admin/identity/records')
  records(@Headers('authorization') authorization: string | undefined) {
    return this.service.records(authorization)
  }

  @Post('admin/identity/records')
  @ApiBody({ type: IdentityRecordDto })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  create(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: IdentityRecordDto,
    @Req() request: RequestWithId,
  ) {
    return this.service.createRecord(authorization, body, key, request.requestId ?? randomUUID())
  }

  @Post('admin/identity/records/:id/revoke')
  @ApiBody({ type: RevokeIdentityRecordDto })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  revoke(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RevokeIdentityRecordDto,
    @Req() request: RequestWithId,
  ) {
    return this.service.revokeRecord(
      authorization,
      id,
      body,
      key,
      request.requestId ?? randomUUID(),
    )
  }
}
