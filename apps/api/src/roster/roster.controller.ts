import { Controller, Get, Inject, Param, Req } from '@nestjs/common'
import {
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'

import { ApiErrorResponseDto } from '../common/api-error-response.dto'
import type { RequestWithId } from '../common/request-context'
import {
  P1_DEV_ORGANIZATION_HEADER,
  P1_DEV_ROLE_HEADER,
  P1_TOURNAMENT_ADMIN_ROLE,
  requireP1DevAdminContext,
  requireP1DevOrganizationId,
} from '../schedule/dev-context'
import {
  AdminTeamRegistrationDetailResponseDto,
  AdminTeamRegistrationListResponseDto,
  PublicTournamentTeamDetailResponseDto,
  PublicTournamentTeamListResponseDto,
} from './roster.dto'
import { RosterService } from './roster.service'

@ApiTags('roster')
@Controller()
export class RosterController {
  constructor(@Inject(RosterService) private readonly rosterService: RosterService) {}

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
  @P2AdminHeaders()
  @ApiOperation({ summary: 'P2 开发期读取赛事球队报名与名单核对列表' })
  @ApiOkResponse({ type: AdminTeamRegistrationListResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  listAdminTeamRegistrations(
    @Req() request: RequestWithId,
    @Param('tournamentId') tournamentId: string,
  ) {
    const context = requireP1DevAdminContext(request)
    return this.rosterService.listAdminTeamRegistrations(context.organizationId, tournamentId)
  }

  @Get('admin/tournaments/:tournamentId/team-registrations/:registrationId')
  @P2AdminHeaders()
  @ApiOperation({ summary: 'P2 开发期读取报名、数据质量和脱敏名单详情' })
  @ApiOkResponse({ type: AdminTeamRegistrationDetailResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  getAdminTeamRegistration(
    @Req() request: RequestWithId,
    @Param('tournamentId') tournamentId: string,
    @Param('registrationId') registrationId: string,
  ) {
    const context = requireP1DevAdminContext(request)
    return this.rosterService.getAdminTeamRegistration(
      context.organizationId,
      tournamentId,
      registrationId,
    )
  }
}

function P2AdminHeaders(): MethodDecorator {
  const organizationHeader = ApiHeader({
    name: P1_DEV_ORGANIZATION_HEADER,
    description: 'P2 开发期组织上下文，后续由真实认证授权替换',
    required: true,
  })
  const roleHeader = ApiHeader({
    name: P1_DEV_ROLE_HEADER,
    description: `P2 开发期临时角色，必须为 ${P1_TOURNAMENT_ADMIN_ROLE}`,
    required: true,
  })

  return (target, propertyKey, descriptor) => {
    organizationHeader(target, propertyKey, descriptor)
    roleHeader(target, propertyKey, descriptor)
  }
}

function P2PublicHeaders(): MethodDecorator {
  return ApiHeader({
    name: P1_DEV_ORGANIZATION_HEADER,
    description: 'P2 开发期组织上下文，用于公开只读接口组织过滤',
    required: true,
  })
}
