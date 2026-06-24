export const ERROR_CODES = {
  BAD_REQUEST: 'COMMON.BAD_REQUEST',
  VALIDATION_FAILED: 'COMMON.VALIDATION_FAILED',
  UNAUTHORIZED: 'AUTH.UNAUTHORIZED',
  FORBIDDEN: 'AUTH.FORBIDDEN',
  NOT_FOUND: 'COMMON.NOT_FOUND',
  CONFLICT: 'COMMON.CONFLICT',
  IDEMPOTENCY_KEY_REUSED: 'COMMON.IDEMPOTENCY_KEY_REUSED',
  SERVICE_UNAVAILABLE: 'COMMON.SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'COMMON.INTERNAL_ERROR',
  SCHEDULE_PLAN_ALREADY_PUBLISHED: 'SCHEDULE.PLAN_ALREADY_PUBLISHED',
  SCHEDULE_PLAN_EMPTY: 'SCHEDULE.PLAN_EMPTY',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export function isErrorCode(value: unknown): value is ErrorCode {
  return (
    typeof value === 'string' && (Object.values(ERROR_CODES) as readonly string[]).includes(value)
  )
}

export interface ApiErrorResponse {
  code: ErrorCode
  message: string
  requestId: string
  details?: Record<string, unknown>
}
