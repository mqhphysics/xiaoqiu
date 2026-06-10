export const APP_NAME = '晓球'

export interface ApiErrorResponse {
  code: string
  message: string
  requestId: string
  details?: Record<string, unknown>
}

export interface HealthResponse {
  service: string
  status: 'ok' | 'degraded'
  version: string
  timestamp: string
}
