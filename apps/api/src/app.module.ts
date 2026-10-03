import { Module } from '@nestjs/common'

import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { DatabaseModule } from './database/database.module'
import { ExperienceModule } from './experience/experience.module'
import { MediaModule } from './media/media.module'
import { MatchReportModule } from './match-report/match-report.module'
import { RosterModule } from './roster/roster.module'
import { ResultsModule } from './results/results.module'
import { ScheduleModule } from './schedule/schedule.module'
import { SocialModule } from './social/social.module'
import { AdminCenterModule } from './admin-center/admin-center.module'

@Module({
  controllers: [AppController],
  imports: [
    DatabaseModule,
    AuthModule,
    ExperienceModule,
    MediaModule,
    RosterModule,
    MatchReportModule,
    ResultsModule,
    ScheduleModule,
    SocialModule,
    AdminCenterModule,
  ],
  providers: [AppService],
})
export class AppModule {}
