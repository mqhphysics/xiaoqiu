import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { SocialModule } from '../social/social.module'
import { MediaModule } from '../media/media.module'
import { ResultsModule } from '../results/results.module'
import { ExperienceController } from './experience.controller'
import { ExperienceService } from './experience.service'
import { SelfPlayerProfileController } from './self-player-profile.controller'
import { SelfPlayerProfileService } from './self-player-profile.service'

@Module({
  controllers: [ExperienceController, SelfPlayerProfileController],
  imports: [AuthModule, SocialModule, MediaModule, ResultsModule],
  providers: [ExperienceService, SelfPlayerProfileService],
})
export class ExperienceModule {}
