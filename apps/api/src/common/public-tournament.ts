import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import { isUUID } from 'class-validator'

import type { PrismaService } from '../database/prisma.service'
import { ApiHttpException } from './api-http.exception'

/** Selection is explicit, deployment configured, then newest published season. */
export async function selectPublicTournament(
  prisma: Pick<PrismaService, 'tournament'>,
  organizationId: string,
  tournamentId?: string,
) {
  const selectedId = tournamentId ?? process.env.DEFAULT_TOURNAMENT_ID
  if (selectedId !== undefined && !isUUID(selectedId)) {
    throw new ApiHttpException(HttpStatus.BAD_REQUEST, {
      code: ERROR_CODES.BAD_REQUEST,
      message: '赛事选择必须是单个 UUID',
    })
  }
  const tournament = await prisma.tournament.findFirst({
    where: {
      organizationId,
      ...(selectedId ? { id: selectedId } : {}),
      status: 'PUBLISHED',
      organization: { status: 'ACTIVE' },
      season: { organizationId },
    },
    include: { season: true },
    orderBy: [
      { season: { startsOn: { sort: 'desc', nulls: 'last' } } },
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
  })
  if (!tournament)
    throw new ApiHttpException(HttpStatus.NOT_FOUND, {
      code: ERROR_CODES.NOT_FOUND,
      message: '当前组织没有可读取的已发布赛事',
    })
  return tournament
}
