import { Module } from '@nestjs/common'

import { AppController } from './app.controller'
import { AppService } from './app.service'
import { DatabaseModule } from './database/database.module'
import { RosterModule } from './roster/roster.module'
import { ScheduleModule } from './schedule/schedule.module'

@Module({
  controllers: [AppController],
  imports: [DatabaseModule, RosterModule, ScheduleModule],
  providers: [AppService],
})
export class AppModule {}
