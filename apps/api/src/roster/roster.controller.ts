import { Controller, Get, Headers, Inject, Param, ParseUUIDPipe, Req } from '@nestjs/common'
import {
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger'

import { ApiErrorResponseDto } from '../common/api-error-response.dto'
import type { RequestWithId } from '../common/request-context'
import { P1_DEV_ORGANIZATION_HEADER, requireP1DevOrganizationId } from '../schedule/dev-context'
import {
  AdminTeamRegistrationDetailResponseDto,
  AdminTeamRegistrationListResponseDto,
  PublicTournamentTeamDetailResponseDto,
  PublicTournamentTeamListResponseDto,
} from './roster.dto'
import { RosterService } from './roster.service'
import { RosterWorkflowService } from './roster-workflow.service'
import { AuthorizeInApplicationService } from '../auth/application-authorization'

@ApiTags('roster')
@Controller()
export class RosterController {
  constructor(
    @Inject(RosterService) private readonly rosterService: RosterService,
    @Inject(RosterWorkflowService) private readonly workflow: RosterWorkflowService,
  ) {}

  @Get('public/tournaments/:tournamentId/teams')
  @P2PublicHeaders()
  @ApiOperation({ summary: '读取已发布赛事中已批准球队和锁定名单摘要' })
  @ApiOkResponse({ type: PublicTournamentTeamListResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  listPublicTournamentTeams(
    @Req() request: RequestWithId,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.rosterService.listPublicTournamentTeams(
      requireP1DevOrganizationId(request),
      tournamentId,
    )
  }

  @Get('public/tournaments/:tournamentId/teams/:teamId')
  @P2PublicHeaders()
  @ApiOperation({ summary: '读取已发布赛事球队和最新锁定公开名单' })
  @ApiOkResponse({ type: PublicTournamentTeamDetailResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  getPublicTournamentTeam(
    @Req() request: RequestWithId,
    @Param('tournamentId') tournamentId: string,
    @Param('teamId') teamId: string,
  ) {
    return this.rosterService.getPublicTournamentTeam(
      requireP1DevOrganizationId(request),
      tournamentId,
      teamId,
    )
  }

  @Get('admin/tournaments/:tournamentId/team-registrations')
  @AuthorizeInApplicationService()
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员读取本组织获授权赛事的球队报名与名单核对列表' })
  @ApiOkResponse({ type: AdminTeamRegistrationListResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async listAdminTeamRegistrations(
    @Headers('authorization') authorization: string | undefined,
    @Param('tournamentId', ParseUUIDPipe) tournamentId: string,
  ) {
    const context = await this.workflow.requireAdminContext(authorization, tournamentId)
    return this.rosterService.listAdminTeamRegistrations(context.organizationId, tournamentId)
  }

  @Get('admin/tournaments/:tournamentId/team-registrations/:registrationId')
  @AuthorizeInApplicationService()
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员读取本组织获授权赛事的报名和脱敏名单详情' })
  @ApiOkResponse({ type: AdminTeamRegistrationDetailResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async getAdminTeamRegistration(
    @Headers('authorization') authorization: string | undefined,
    @Param('tournamentId', ParseUUIDPipe) tournamentId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
  ) {
    const context = await this.workflow.requireAdminContext(authorization, tournamentId)
    return this.rosterService.getAdminTeamRegistration(
      context.organizationId,
      tournamentId,
      registrationId,
    )
  }
}

function P2PublicHeaders(): MethodDecorator {
  return ApiHeader({
    name: P1_DEV_ORGANIZATION_HEADER,
    description: 'P2 开发期组织上下文，用于公开只读接口组织过滤',
    required: true,
  })
}
