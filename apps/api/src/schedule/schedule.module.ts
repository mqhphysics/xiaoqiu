import { Module } from '@nestjs/common'

import { DatabaseModule } from '../database/database.module'
import { ScheduleController } from './schedule.controller'
import { ScheduleService } from './schedule.service'

@Module({
  controllers: [ScheduleController],
  imports: [DatabaseModule],
  providers: [ScheduleService],
})
export class ScheduleModule {}
