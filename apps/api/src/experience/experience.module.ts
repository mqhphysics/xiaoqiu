import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { SocialModule } from '../social/social.module'
import { MediaModule } from '../media/media.module'
import { ExperienceController } from './experience.controller'
import { ExperienceService } from './experience.service'

@Module({
  controllers: [ExperienceController],
  imports: [AuthModule, SocialModule, MediaModule],
  providers: [ExperienceService],
})
export class ExperienceModule {}
