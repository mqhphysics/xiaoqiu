import { Module } from '@nestjs/common'

import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { DatabaseModule } from './database/database.module'
import { ExperienceModule } from './experience/experience.module'
import { MediaModule } from './media/media.module'
import { RosterModule } from './roster/roster.module'
import { ScheduleModule } from './schedule/schedule.module'
import { SocialModule } from './social/social.module'

@Module({
  controllers: [AppController],
  imports: [
    DatabaseModule,
    AuthModule,
    ExperienceModule,
    MediaModule,
    RosterModule,
    ScheduleModule,
    SocialModule,
  ],
  providers: [AppService],
})
export class AppModule {}
