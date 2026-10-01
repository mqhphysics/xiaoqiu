import { Module } from '@nestjs/common'

import { DatabaseModule } from '../database/database.module'
import { AuthModule } from '../auth/auth.module'
import { ScheduleController } from './schedule.controller'
import { ScheduleService } from './schedule.service'

@Module({
  controllers: [ScheduleController],
  imports: [DatabaseModule, AuthModule],
  providers: [ScheduleService],
})
export class ScheduleModule {}
