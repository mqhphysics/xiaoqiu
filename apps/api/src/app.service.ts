import { Injectable } from '@nestjs/common'

export interface HealthResponse {
  service: 'api'
  status: 'ok'
  version: string
  timestamp: string
}

@Injectable()
export class AppService {
  health(): HealthResponse {
    return {
      service: 'api',
      status: 'ok',
      version: process.env.APP_VERSION ?? '0.1.0',
      timestamp: new Date().toISOString(),
    }
  }
}
