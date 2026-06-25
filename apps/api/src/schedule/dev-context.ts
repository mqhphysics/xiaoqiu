import { HttpStatus } from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import type { Request } from 'express'

import { ApiHttpException } from '../common/api-http.exception'

export const P1_DEV_ORGANIZATION_HEADER = 'x-dev-organization-id'
export const P1_DEV_ROLE_HEADER = 'x-dev-role'
export const P1_TOURNAMENT_ADMIN_ROLE = 'TOURNAMENT_ADMIN'

export interface P1DevAdminContext {
  organizationId: string
  role: typeof P1_TOURNAMENT_ADMIN_ROLE
}

export function getHeaderValue(request: Request, name: string): string | undefined {
  const value = request.headers[name]

  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

export function requireP1DevOrganizationId(request: Request): string {
  const organizationId = getHeaderValue(request, P1_DEV_ORGANIZATION_HEADER)

  if (typeof organizationId !== 'string' || organizationId.trim() === '') {
    throw new ApiHttpException(HttpStatus.FORBIDDEN, {
      code: ERROR_CODES.FORBIDDEN,
      message: '缺少 P1 开发期组织上下文',
    })
  }

  return organizationId
}

export function requireP1DevAdminContext(request: Request): P1DevAdminContext {
  const organizationId = requireP1DevOrganizationId(request)
  const role = getHeaderValue(request, P1_DEV_ROLE_HEADER)

  if (role !== P1_TOURNAMENT_ADMIN_ROLE) {
    throw new ApiHttpException(HttpStatus.FORBIDDEN, {
      code: ERROR_CODES.FORBIDDEN,
      message: 'P1 开发期接口需要赛事管理员角色',
    })
  }

  return {
    organizationId,
    role,
  }
}
