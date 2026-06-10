export type HealthStatus = 'ok' | 'degraded'
export type DependencyHealthStatus = 'ok' | 'down'

export interface DependencyHealth {
  status: DependencyHealthStatus
  latencyMs: number
}

export interface HealthResponse {
  service: 'api'
  status: HealthStatus
  version: string
  timestamp: string
  requestId: string
  database: DependencyHealth
}
