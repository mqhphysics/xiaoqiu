import type { RequestWithId } from './request-context'

export function getSafeRequestPath(request: RequestWithId): string {
  return request.path
}
