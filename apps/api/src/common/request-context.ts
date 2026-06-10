import type { Request } from 'express'

export interface RequestWithId extends Request {
  requestId?: string
}

export function getRequestId(request: RequestWithId): string {
  return request.requestId ?? 'unknown'
}
