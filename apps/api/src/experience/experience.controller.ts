import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'

import { DEMO_ORGANIZATION_ID } from '../database/demo-fixture'
import type {
  CreateCommentDto,
  CreateMatchReviewDto,
  CreatePostDto,
  SearchQueryDto,
  UpdateTeamPreferencesDto,
} from './experience.dto'
import { ExperienceService } from './experience.service'

@ApiTags('experience')
@Controller()
export class ExperienceController {
  constructor(@Inject(ExperienceService) private readonly experienceService: ExperienceService) {}

  @Get('public/home')
  @PublicOrganizationHeader()
  @ApiOperation({ summary: '读取五入口产品首页聚合数据' })
  @ApiOkResponse({ description: '赛事、公告、焦点比赛、球队和社区动态' })
  home(
    @Headers('x-dev-organization-id') organizationId: string | undefined,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.experienceService.getHome(resolveOrganizationId(organizationId), authorization)
  }

  @Get('public/search')
  @PublicOrganizationHeader()
  @ApiOperation({ summary: '按球员、球队、比赛和动态搜索' })
  search(
    @Headers('x-dev-organization-id') organizationId: string | undefined,
    @Query() query: SearchQueryDto,
  ) {
    return this.experienceService.search(resolveOrganizationId(organizationId), query)
  }

  @Get('public/seasons')
  @PublicOrganizationHeader()
  @ApiOperation({ summary: '读取可切换赛季' })
  seasons(@Headers('x-dev-organization-id') organizationId: string | undefined) {
    return this.experienceService.listSeasons(resolveOrganizationId(organizationId))
  }

  @Get('public/tournaments/:tournamentId/competition-data')
  @PublicOrganizationHeader()
  @ApiOperation({ summary: '读取积分榜、淘汰赛和球员榜单' })
  competitionData(
    @Headers('x-dev-organization-id') organizationId: string | undefined,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.experienceService.getCompetitionData(
      resolveOrganizationId(organizationId),
      tournamentId,
    )
  }

  @Get('public/teams/:teamId/dashboard')
  @PublicOrganizationHeader()
  @ApiOperation({ summary: '读取球队战绩、赛程与完整名单' })
  teamDashboard(
    @Headers('x-dev-organization-id') organizationId: string | undefined,
    @Param('teamId') teamId: string,
    @Query('tournamentId') tournamentId: string | undefined,
  ) {
    return this.experienceService.getTeamDashboard(
      resolveOrganizationId(organizationId),
      teamId,
      tournamentId,
    )
  }

  @Get('public/players/:playerId')
  @PublicOrganizationHeader()
  @ApiOperation({ summary: '读取完整公开球员档案与赛季数据' })
  player(
    @Headers('x-dev-organization-id') organizationId: string | undefined,
    @Param('playerId') playerId: string,
    @Query('tournamentId') tournamentId: string | undefined,
  ) {
    return this.experienceService.getPlayer(
      resolveOrganizationId(organizationId),
      playerId,
      tournamentId,
    )
  }

  @Get('public/matches/:matchId/experience')
  @PublicOrganizationHeader()
  @ApiOperation({ summary: '读取评分、比分、事件时间轴和阵容' })
  match(
    @Headers('x-dev-organization-id') organizationId: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Param('matchId') matchId: string,
  ) {
    return this.experienceService.getMatchExperience(
      resolveOrganizationId(organizationId),
      matchId,
      authorization,
    )
  }

  @Post('matches/:matchId/reviews')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: '提交或更新当前用户的比赛评分' })
  @ApiOkResponse({ description: '更新后的比赛体验数据' })
  reviewMatch(
    @Headers('authorization') authorization: string | undefined,
    @Param('matchId') matchId: string,
    @Body() body: CreateMatchReviewDto,
  ) {
    return this.experienceService.reviewMatch(authorization, matchId, body)
  }

  @Get('public/posts')
  @PublicOrganizationHeader()
  @ApiOperation({ summary: '读取社区与官方动态' })
  posts(
    @Headers('x-dev-organization-id') organizationId: string | undefined,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.experienceService.listPosts(resolveOrganizationId(organizationId), authorization)
  }

  @Get('public/posts/:postId')
  @PublicOrganizationHeader()
  @ApiOperation({ summary: '读取动态与评论详情' })
  post(
    @Headers('x-dev-organization-id') organizationId: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Param('postId') postId: string,
  ) {
    return this.experienceService.getPost(
      resolveOrganizationId(organizationId),
      postId,
      authorization,
    )
  }

  @Get('me/team-preferences')
  @ApiBearerAuth()
  @ApiOperation({ summary: '读取当前用户主队与关注球队' })
  teamPreferences(@Headers('authorization') authorization: string | undefined) {
    return this.experienceService.getTeamPreferences(authorization)
  }

  @Put('me/team-preferences')
  @ApiBearerAuth()
  @ApiOperation({ summary: '保存当前用户主队与关注球队' })
  updateTeamPreferences(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: UpdateTeamPreferencesDto,
  ) {
    return this.experienceService.updateTeamPreferences(authorization, body)
  }

  @Post('community/posts')
  @ApiBearerAuth()
  @ApiOperation({ summary: '发布社区动态' })
  @ApiCreatedResponse({ description: '已发布动态' })
  createPost(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CreatePostDto,
  ) {
    return this.experienceService.createPost(authorization, body)
  }

  @Post('community/posts/:postId/like')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: '切换动态点赞状态' })
  like(
    @Headers('authorization') authorization: string | undefined,
    @Param('postId') postId: string,
  ) {
    return this.experienceService.toggleLike(authorization, postId)
  }

  @Post('community/posts/:postId/comments')
  @ApiBearerAuth()
  @ApiOperation({ summary: '发表评论' })
  createComment(
    @Headers('authorization') authorization: string | undefined,
    @Param('postId') postId: string,
    @Body() body: CreateCommentDto,
  ) {
    return this.experienceService.createComment(authorization, postId, body)
  }
}

function PublicOrganizationHeader() {
  return ApiHeader({
    name: 'x-dev-organization-id',
    required: false,
    description: `本地默认 ${DEMO_ORGANIZATION_ID}`,
  })
}

function resolveOrganizationId(value: string | undefined): string {
  return value?.trim() || DEMO_ORGANIZATION_ID
}
