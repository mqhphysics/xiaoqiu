import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common'

@Injectable()
export class WorkerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name)
  private heartbeat?: NodeJS.Timeout

  onApplicationBootstrap(): void {
    this.logger.log('Worker skeleton is ready')
    this.heartbeat = setInterval(() => {
      this.logger.debug('Worker heartbeat')
    }, 30_000)
  }

  onModuleDestroy(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat)
    }
  }
}
