import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { SocialModule } from '../social/social.module'
import { ExperienceController } from './experience.controller'
import { ExperienceService } from './experience.service'

@Module({
  controllers: [ExperienceController],
  imports: [AuthModule, SocialModule],
  providers: [ExperienceService],
})
export class ExperienceModule {}
