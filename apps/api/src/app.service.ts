import { Inject, Injectable } from '@nestjs/common'

import { PrismaService } from './database/prisma.service'
import type { HealthResponseDto } from './health-response.dto'

@Injectable()
export class AppService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async health(requestId: string): Promise<HealthResponseDto> {
    const startedAt = performance.now()
    let databaseStatus: HealthResponseDto['database']['status'] = 'ok'

    try {
      await this.prisma.$queryRawUnsafe('SELECT 1')
    } catch {
      databaseStatus = 'down'
    }

    return {
      service: 'api',
      status: databaseStatus === 'ok' ? 'ok' : 'degraded',
      version: process.env.APP_VERSION ?? '0.1.0',
      timestamp: new Date().toISOString(),
      requestId,
      database: {
        status: databaseStatus,
        latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
      },
    }
  }
}
